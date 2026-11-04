import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-notif-mark-read-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');
const { User } = await import('../models/user.js');
const { Notification } = await import('../models/notification.js');
const { UserRole, NotificationType } = await import('../models/enums.js');
const { generateToken } = await import('../shared/token.js');

type ApiBody<T = any> = {
  success: boolean;
  data: T;
  error?: { code: number; details: string } | null;
  message?: string;
};

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

before(async () => {
  assert.equal(AppDataSource.options.database, dbPath, 'testes nunca devem usar o SQLite de desenvolvimento');
  assert.notEqual(path.resolve(String(AppDataSource.options.database)), path.resolve('data/achadex.sqlite'));
  await AppDataSource.initialize();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await AppDataSource.query('DELETE FROM notifications');
  await AppDataSource.query('DELETE FROM users');
});

interface RequestOptions {
  token?: string;
  authHeader?: string;
  body?: unknown;
}

async function request(
  method: string,
  requestPath: string,
  options: RequestOptions = {},
): Promise<{ status: number; text: string; body: ApiBody | null }> {
  const headers: Record<string, string> = {};
  if (options.authHeader !== undefined) {
    headers.Authorization = options.authHeader;
  } else if (options.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${baseUrl}${requestPath}`, { method, headers, body });
  const text = await res.text();
  let parsed: ApiBody | null = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as ApiBody;
    } catch {
      parsed = null;
    }
  }
  return { status: res.status, text, body: parsed };
}

function markRead(token: string, rawId: string | number, body?: unknown) {
  return request('PATCH', `/api/notifications/${rawId}/read`, { token, body });
}

async function createFixtureUser(
  email = 'usuario@example.com',
  name = 'Usuário Notificação',
  role = UserRole.USER,
): Promise<{ user: any; token: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.save(
    userRepo.create({
      name,
      email,
      passwordHash: 'scrypt:salt:dummyhash',
      role,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createFixtureNotification(
  userId: number,
  type = NotificationType.MATCH_FOUND,
  linkUrl = '/lost-reports/1',
  readAt: Date | null = null,
): Promise<any> {
  const repo = AppDataSource.getRepository(Notification);
  return await repo.save(
    repo.create({
      userId,
      type,
      linkUrl,
      readAt,
    }),
  );
}

async function findStoredNotification(id: number): Promise<any | null> {
  return await AppDataSource.getRepository(Notification).findOne({ where: { id } });
}

const TRANSITION_LOG_TABLE = 'test_notification_read_transitions';
const TRANSITION_TRIGGER = 'trg_test_notification_read_transition';

async function installTransitionCounter(): Promise<void> {
  await AppDataSource.query(`DROP TABLE IF EXISTS ${TRANSITION_LOG_TABLE}`);
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${TRANSITION_TRIGGER}`);
  await AppDataSource.query(
    `CREATE TABLE ${TRANSITION_LOG_TABLE} (notification_id INTEGER NOT NULL)`,
  );
  await AppDataSource.query(
    `CREATE TRIGGER ${TRANSITION_TRIGGER}
       AFTER UPDATE OF read_at ON notifications
       WHEN OLD.read_at IS NULL AND NEW.read_at IS NOT NULL
       BEGIN
         INSERT INTO ${TRANSITION_LOG_TABLE} (notification_id) VALUES (NEW.id);
       END`,
  );
}

async function countTransitions(notificationId: number): Promise<number> {
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM ${TRANSITION_LOG_TABLE} WHERE notification_id = ?`,
    [notificationId],
  );
  return Number(rows[0].total);
}

async function removeTransitionCounter(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${TRANSITION_TRIGGER}`);
  await AppDataSource.query(`DROP TABLE IF EXISTS ${TRANSITION_LOG_TABLE}`);
}

test('A01 — marcação válida: notificação própria não lida passa a ter readAt preenchido com HTTP 200', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await markRead(token, notification.id);

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data.id, notification.id);
  assert.equal(res.body?.data.userId, user.id);
  assert.ok(res.body?.data.readAt);
});

test('A02 — persistência: o readAt retornado foi efetivamente gravado no SQLite temporário', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await markRead(token, notification.id);
  assert.equal(res.status, 200);

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.ok(stored.readAt instanceof Date);
  assert.equal(stored.readAt.toISOString(), res.body?.data.readAt);
});

test('A03 — notificação inexistente: HTTP 404 sem qualquer mutação', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await markRead(token, 999999);

  assert.equal(res.status, 404);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error?.code, 404);
  assert.equal(res.body?.data, null);
});

test('A04 — notificação de terceiro: HTTP 404 e registro do proprietário permanece não lido', async () => {
  const { user: owner } = await createFixtureUser('owner@example.com', 'Proprietário');
  const { token: attackerToken } = await createFixtureUser('attacker@example.com', 'Terceiro');
  const notification = await createFixtureNotification(owner.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);

  const res = await markRead(attackerToken, notification.id);

  assert.equal(res.status, 404);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error?.code, 404);

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt, null);
});

test('A05 — uniformidade de ausência: inexistente e de terceiro produzem resposta indistinguível', async () => {
  const { user: owner } = await createFixtureUser('owner@example.com', 'Proprietário');
  const { token: attackerToken } = await createFixtureUser('attacker@example.com', 'Terceiro');
  const foreign = await createFixtureNotification(owner.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const missingRes = await markRead(attackerToken, 999999);
  const foreignRes = await markRead(attackerToken, foreign.id);

  assert.equal(missingRes.status, 404);
  assert.equal(foreignRes.status, 404);
  assert.deepEqual(missingRes.body, foreignRes.body);
});

test('A06 — ID inválido no path retorna HTTP 400', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const invalidIds = [
    '0',
    '-1',
    'abc',
    '1.5',
    '12abc',
    '9007199254740992',
    '999999999999999999999999999999',
  ];

  for (const rawId of invalidIds) {
    const res = await markRead(token, rawId);
    assert.equal(res.status, 400, `esperado HTTP 400 para ID "${rawId}" mas recebeu ${res.status}`);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error?.code, 400);
  }

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt, null);
});

test('A07 — sem autenticação: HTTP 401 sem mutação', async () => {
  const { user } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await request('PATCH', `/api/notifications/${notification.id}/read`);

  assert.equal(res.status, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error?.code, 401);

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt, null);
});

test('A08 — JWT inválido: malformado, adulterado, expirado e usuário inexistente retornam HTTP 401', async () => {
  const { user } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const malformed = await request('PATCH', `/api/notifications/${notification.id}/read`, {
    authHeader: 'Basic dXNlcjpwYXNz',
  });
  assert.equal(malformed.status, 401);

  const tampered = await request('PATCH', `/api/notifications/${notification.id}/read`, {
    authHeader: 'Bearer token.invalido.adulterado',
  });
  assert.equal(tampered.status, 401);

  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const expired = await request('PATCH', `/api/notifications/${notification.id}/read`, {
    authHeader: `Bearer ${expiredToken}`,
  });
  assert.equal(expired.status, 401);

  const nonExistentToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const nonExistent = await request('PATCH', `/api/notifications/${notification.id}/read`, {
    authHeader: `Bearer ${nonExistentToken}`,
  });
  assert.equal(nonExistent.status, 401);

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt, null);
});

test('A09 — marcação repetida: segunda chamada retorna 200 e preserva o readAt original', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const first = await markRead(token, notification.id);
  assert.equal(first.status, 200);
  const firstReadAt = first.body?.data.readAt;
  assert.ok(firstReadAt);

  const second = await markRead(token, notification.id);
  assert.equal(second.status, 200);
  assert.equal(second.body?.data.readAt, firstReadAt);

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt.toISOString(), firstReadAt);
});

test('A10 — notificação já lida: operação retorna 200 e não sobrescreve o readAt existente', async () => {
  const { user, token } = await createFixtureUser();
  const originalReadAt = new Date('2026-10-15T14:30:00.000Z');
  const notification = await createFixtureNotification(
    user.id,
    NotificationType.REPORT_RESOLVED,
    '/lost-reports/2',
    originalReadAt,
  );

  const res = await markRead(token, notification.id);

  assert.equal(res.status, 200);
  assert.equal(res.body?.data.readAt, originalReadAt.toISOString());

  const stored = await findStoredNotification(notification.id);
  assert.ok(stored);
  assert.equal(stored.readAt.getTime(), originalReadAt.getTime());
});

test('A11 — whitelist pública: resposta contém exatamente as seis propriedades autorizadas', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await markRead(token, notification.id);
  assert.equal(res.status, 200);

  const expectedKeys = ['createdAt', 'id', 'linkUrl', 'readAt', 'type', 'userId'].sort();
  assert.deepEqual(Object.keys(res.body!.data).sort(), expectedKeys);
  assert.equal((res.body!.data as any).user, undefined);
  assert.equal((res.body!.data as any).passwordHash, undefined);
});

test('A12 — preservação de campos: somente readAt muda na primeira marcação válida', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(
    user.id,
    NotificationType.ITEM_CLAIMED,
    '/admin/items/7',
    null,
  );

  const before = await findStoredNotification(notification.id);
  assert.ok(before);
  assert.equal(before.readAt, null);

  const res = await markRead(token, notification.id);
  assert.equal(res.status, 200);

  const after = await findStoredNotification(notification.id);
  assert.ok(after);
  assert.equal(after.id, before.id);
  assert.equal(after.userId, before.userId);
  assert.equal(after.type, before.type);
  assert.equal(after.linkUrl, before.linkUrl);
  assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
  assert.ok(after.readAt instanceof Date);
});

test('A13 — concorrência: duas marcações simultâneas produzem uma única transição lógica', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  await installTransitionCounter();
  try {
    const [first, second] = await Promise.all([
      markRead(token, notification.id),
      markRead(token, notification.id),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.ok(first.body?.data.readAt);
    assert.equal(first.body?.data.readAt, second.body?.data.readAt);

    const stored = await findStoredNotification(notification.id);
    assert.ok(stored);
    assert.equal(stored.readAt.toISOString(), first.body?.data.readAt);
    assert.equal(await countTransitions(notification.id), 1);
  } finally {
    await removeTransitionCounter();
  }
});

test('A14 — falha de persistência: erro controlado, sem falso HTTP 200 e sem mutação', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const failureTrigger = 'trg_test_fail_notification_read';
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  await AppDataSource.query(
    `CREATE TRIGGER ${failureTrigger}
       BEFORE UPDATE OF read_at ON notifications
       WHEN OLD.id = ${notification.id} AND OLD.read_at IS NULL
       BEGIN
         SELECT RAISE(ABORT, 'Falha simulada de persistência no SQLite temporário');
       END`,
  );

  try {
    const res = await markRead(token, notification.id);

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error?.code, 500);
    assert.ok(!JSON.stringify(res.body).includes('Falha simulada de persistência'));
    assert.ok(!JSON.stringify(res.body).includes('stack'));

    const stored = await findStoredNotification(notification.id);
    assert.ok(stored);
    assert.equal(stored.readAt, null);
  } finally {
    await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  }
});

test('A15 — integração com listagem: após marcar, read=false exclui e read=true inclui a notificação', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const marked = await markRead(token, notification.id);
  assert.equal(marked.status, 200);

  const unreadList = await request('GET', '/api/notifications?read=false', { token });
  assert.equal(unreadList.status, 200);
  assert.deepEqual(unreadList.body?.data, []);

  const readList = await request('GET', '/api/notifications?read=true', { token });
  assert.equal(readList.status, 200);
  assert.equal(readList.body?.data.length, 1);
  assert.equal(readList.body?.data[0].id, notification.id);
  assert.ok(readList.body?.data[0].readAt);
});

test('A16 — integração com contagem: unread-count diminui exatamente uma unidade após a primeira marcação', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const before = await request('GET', '/api/notifications/unread-count', { token });
  assert.equal(before.status, 200);
  assert.deepEqual(before.body?.data, { count: 1 });

  const marked = await markRead(token, notification.id);
  assert.equal(marked.status, 200);

  const after = await request('GET', '/api/notifications/unread-count', { token });
  assert.equal(after.status, 200);
  assert.deepEqual(after.body?.data, { count: 0 });
});

test('A17 — requisição sem payload: endpoint não exige body', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await request('PATCH', `/api/notifications/${notification.id}/read`, { token });

  assert.equal(res.status, 200);
  assert.ok(res.body?.data.readAt);
});

test('A18 — isolamento por papel: USER, ADMIN e SUPERADMIN só alteram as próprias notificações', async () => {
  const { user: commonUser, token: commonToken } = await createFixtureUser(
    'user@example.com',
    'Usuário Comum',
    UserRole.USER,
  );
  const { user: adminUser, token: adminToken } = await createFixtureUser(
    'admin@example.com',
    'Administrador',
    UserRole.ADMIN,
  );
  const { user: superUser, token: superToken } = await createFixtureUser(
    'super@example.com',
    'Superadministrador',
    UserRole.SUPERADMIN,
  );

  const commonNotification = await createFixtureNotification(commonUser.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const adminNotification = await createFixtureNotification(adminUser.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  const superNotification = await createFixtureNotification(superUser.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null);

  const commonRes = await markRead(commonToken, commonNotification.id);
  assert.equal(commonRes.status, 200);

  const adminOwnRes = await markRead(adminToken, adminNotification.id);
  assert.equal(adminOwnRes.status, 200);

  const superRes = await markRead(superToken, superNotification.id);
  assert.equal(superRes.status, 200);

  const adminForeignRes = await markRead(adminToken, commonNotification.id);
  assert.equal(adminForeignRes.status, 404);

  const storedCommon = await findStoredNotification(commonNotification.id);
  const storedAdmin = await findStoredNotification(adminNotification.id);
  const storedSuper = await findStoredNotification(superNotification.id);

  assert.ok(storedCommon?.readAt);
  assert.ok(storedAdmin?.readAt);
  assert.ok(storedSuper?.readAt);
  assert.equal(storedCommon.userId, commonUser.id);
  assert.equal(storedAdmin.userId, adminUser.id);
  assert.equal(storedSuper.userId, superUser.id);
});
