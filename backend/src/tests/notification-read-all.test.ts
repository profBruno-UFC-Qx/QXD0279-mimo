import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-notif-read-all-test-'));
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
  await removeTransitionCounter();
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

function readAll(
  token: string,
  options: { body?: unknown; query?: string } = {},
): Promise<{ status: number; text: string; body: ApiBody | null }> {
  const suffix = options.query ? `?${options.query}` : '';
  return request('PATCH', `/api/notifications/read-all${suffix}`, {
    token,
    body: options.body,
  });
}

function markRead(token: string, rawId: string | number) {
  return request('PATCH', `/api/notifications/${rawId}/read`, { token });
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

async function findAllStoredNotifications(): Promise<any[]> {
  return await AppDataSource.getRepository(Notification).find({ order: { id: 'ASC' } });
}

async function findStoredNotification(id: number): Promise<any | null> {
  return await AppDataSource.getRepository(Notification).findOne({ where: { id } });
}

const TRANSITION_LOG_TABLE = 'test_notification_read_all_transitions';
const TRANSITION_TRIGGER = 'trg_test_notification_read_all_transition';

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

async function countTransitions(): Promise<number> {
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM ${TRANSITION_LOG_TABLE}`,
  );
  return Number(rows[0].total);
}

async function removeTransitionCounter(): Promise<void> {
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${TRANSITION_TRIGGER}`);
  await AppDataSource.query(`DROP TABLE IF EXISTS ${TRANSITION_LOG_TABLE}`);
}

test('B01 — marcar todas: três notificações próprias não lidas recebem readAt e resposta é 204', async () => {
  const { user, token } = await createFixtureUser();
  const notifications = [
    await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null),
    await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null),
    await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null),
  ];

  const res = await readAll(token);

  assert.equal(res.status, 204);
  assert.equal(res.text, '');

  for (const notification of notifications) {
    const stored = await findStoredNotification(notification.id);
    assert.ok(stored?.readAt instanceof Date);
  }
});

test('B02 — contrato 204 sem corpo e exatamente três transições efetivas', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null);

  await installTransitionCounter();
  try {
    const res = await readAll(token);

    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.equal(await countTransitions(), 3);
  } finally {
    await removeTransitionCounter();
  }
});

test('B03 — usuário sem notificações: sucesso 204 e nenhuma linha criada ou alterada', async () => {
  const { token } = await createFixtureUser();

  const res = await readAll(token);

  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  assert.deepEqual(await findAllStoredNotifications(), []);
});

test('B04 — todas já lidas: nenhum timestamp é alterado', async () => {
  const { user, token } = await createFixtureUser();
  const firstReadAt = new Date('2026-10-01T10:00:00.000Z');
  const secondReadAt = new Date('2026-10-02T11:30:00.000Z');
  const first = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', firstReadAt);
  const second = await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', secondReadAt);

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const storedFirst = await findStoredNotification(first.id);
  const storedSecond = await findStoredNotification(second.id);
  assert.equal(storedFirst.readAt.getTime(), firstReadAt.getTime());
  assert.equal(storedSecond.readAt.getTime(), secondReadAt.getTime());
});

test('B05 — mistura de lidas e não lidas: somente as não lidas recebem novo readAt', async () => {
  const { user, token } = await createFixtureUser();
  const originalReadAt = new Date('2026-09-20T08:15:00.000Z');
  const alreadyRead = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', originalReadAt);
  const unreadOne = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const unreadTwo = await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null);

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const storedRead = await findStoredNotification(alreadyRead.id);
  const storedOne = await findStoredNotification(unreadOne.id);
  const storedTwo = await findStoredNotification(unreadTwo.id);

  assert.equal(storedRead.readAt.getTime(), originalReadAt.getTime());
  assert.ok(storedOne.readAt instanceof Date);
  assert.ok(storedTwo.readAt instanceof Date);
});

test('B06 — isolamento entre usuários: token de A não altera notificações de B ou C', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('a@example.com', 'Usuário A');
  const { user: userB } = await createFixtureUser('b@example.com', 'Usuário B');
  const { user: userC } = await createFixtureUser('c@example.com', 'Usuário C');

  const notificationA = await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const notificationB = await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/lost-reports/2', null);
  const notificationC = await createFixtureNotification(userC.id, NotificationType.MATCH_FOUND, '/lost-reports/3', null);

  const res = await readAll(tokenA);
  assert.equal(res.status, 204);

  const storedA = await findStoredNotification(notificationA.id);
  const storedB = await findStoredNotification(notificationB.id);
  const storedC = await findStoredNotification(notificationC.id);

  assert.ok(storedA.readAt instanceof Date);
  assert.equal(storedB.readAt, null);
  assert.equal(storedC.readAt, null);
});

test('B07 — falsificação de proprietário: userId em body e query é ignorado', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('a@example.com', 'Usuário A');
  const { user: userB } = await createFixtureUser('b@example.com', 'Usuário B');

  const notificationA = await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const notificationB = await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/lost-reports/2', null);

  const res = await readAll(tokenA, {
    body: { userId: userB.id },
    query: `userId=${userB.id}`,
  });

  assert.equal(res.status, 204);

  const storedA = await findStoredNotification(notificationA.id);
  const storedB = await findStoredNotification(notificationB.id);
  assert.ok(storedA.readAt instanceof Date);
  assert.equal(storedB.readAt, null);
});

test('B08 — autenticação obrigatória: sem JWT retorna HTTP 401 e não altera nada', async () => {
  const { user } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const res = await request('PATCH', '/api/notifications/read-all');

  assert.equal(res.status, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error?.code, 401);

  const stored = await findStoredNotification(notification.id);
  assert.equal(stored.readAt, null);
});

test('B09 — JWT inválido: malformado, adulterado, expirado e usuário inexistente retornam HTTP 401', async () => {
  const { user } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  const malformed = await request('PATCH', '/api/notifications/read-all', {
    authHeader: 'Basic dXNlcjpwYXNz',
  });
  assert.equal(malformed.status, 401);

  const tampered = await request('PATCH', '/api/notifications/read-all', {
    authHeader: 'Bearer token.invalido.adulterado',
  });
  assert.equal(tampered.status, 401);

  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const expired = await request('PATCH', '/api/notifications/read-all', {
    authHeader: `Bearer ${expiredToken}`,
  });
  assert.equal(expired.status, 401);

  const nonExistentToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const nonExistent = await request('PATCH', '/api/notifications/read-all', {
    authHeader: `Bearer ${nonExistentToken}`,
  });
  assert.equal(nonExistent.status, 401);

  const stored = await findStoredNotification(notification.id);
  assert.equal(stored.readAt, null);
});

test('B10 — idempotência: segunda chamada retorna 204, preserva timestamps e não repete transições', async () => {
  const { user, token } = await createFixtureUser();
  const first = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const second = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);

  await installTransitionCounter();
  try {
    const firstCall = await readAll(token);
    assert.equal(firstCall.status, 204);

    const storedAfterFirst = await findAllStoredNotifications();
    const timestampsAfterFirst = new Map(storedAfterFirst.map((n) => [n.id, n.readAt.getTime()]));
    assert.equal(await countTransitions(), 2);

    const secondCall = await readAll(token);
    assert.equal(secondCall.status, 204);

    const storedAfterSecond = await findAllStoredNotifications();
    for (const notification of storedAfterSecond) {
      assert.equal(notification.readAt.getTime(), timestampsAfterFirst.get(notification.id));
    }
    assert.equal(await countTransitions(), 2);

    assert.ok(storedAfterSecond.find((n) => n.id === first.id).readAt);
    assert.ok(storedAfterSecond.find((n) => n.id === second.id).readAt);
  } finally {
    await removeTransitionCounter();
  }
});

test('B11 — preservação de dados: somente readAt muda, todos os demais campos permanecem', async () => {
  const { user, token } = await createFixtureUser();
  const notifications = [
    await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null),
    await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null),
    await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null),
  ];
  const before = await findAllStoredNotifications();

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const after = await findAllStoredNotifications();
  assert.equal(after.length, before.length);

  for (const snapshot of before) {
    const current = after.find((n) => n.id === snapshot.id);
    assert.ok(current);
    assert.equal(current.id, snapshot.id);
    assert.equal(current.userId, snapshot.userId);
    assert.equal(current.type, snapshot.type);
    assert.equal(current.linkUrl, snapshot.linkUrl);
    assert.equal(current.createdAt.getTime(), snapshot.createdAt.getTime());
  }

  for (const notification of notifications) {
    const stored = await findStoredNotification(notification.id);
    assert.ok(stored.readAt instanceof Date);
  }
});

test('B12 — integração com unread-count: após read-all, contagem do usuário é zero', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null);

  const before = await request('GET', '/api/notifications/unread-count', { token });
  assert.equal(before.status, 200);
  assert.deepEqual(before.body?.data, { count: 3 });

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const after = await request('GET', '/api/notifications/unread-count', { token });
  assert.equal(after.status, 200);
  assert.deepEqual(after.body?.data, { count: 0 });
});

test('B13 — integração com listagem: todas aparecem em read=true e nenhuma em read=false', async () => {
  const { user, token } = await createFixtureUser();
  const notifications = [
    await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null),
    await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null),
    await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null),
  ];

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const readList = await request('GET', '/api/notifications?read=true', { token });
  assert.equal(readList.status, 200);
  assert.equal(readList.body?.data.length, 3);
  assert.deepEqual(
    readList.body?.data.map((n: any) => n.id).sort((a: number, b: number) => a - b),
    notifications.map((n) => n.id).sort((a, b) => a - b),
  );

  const unreadList = await request('GET', '/api/notifications?read=false', { token });
  assert.equal(unreadList.status, 200);
  assert.deepEqual(unreadList.body?.data, []);
});

test('B14 — volume e tipos: múltiplos registros de usuários diferentes, sem depender de IDs sequenciais', async () => {
  const { user: userB, token: tokenB } = await createFixtureUser('b@example.com', 'Usuário B');
  const { user: userA, token: tokenA } = await createFixtureUser('a@example.com', 'Usuário A');
  const { user: userC } = await createFixtureUser('c@example.com', 'Usuário C');

  const bNotifications = [];
  for (let i = 0; i < 10; i++) {
    bNotifications.push(
      await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, `/lost-reports/b-${i}`, null),
    );
  }

  const aUnread = [];
  const types = [NotificationType.MATCH_FOUND, NotificationType.ITEM_CLAIMED, NotificationType.REPORT_RESOLVED];
  for (let i = 0; i < 12; i++) {
    aUnread.push(
      await createFixtureNotification(userA.id, types[i % types.length], `/notifications/a-${i}`, null),
    );
  }

  const aAlreadyRead = [];
  for (let i = 0; i < 3; i++) {
    aAlreadyRead.push(
      await createFixtureNotification(
        userA.id,
        NotificationType.REPORT_RESOLVED,
        `/notifications/a-read-${i}`,
        new Date(`2026-09-0${i + 1}T10:00:00.000Z`),
      ),
    );
  }

  const cNotification = await createFixtureNotification(userC.id, NotificationType.ITEM_CLAIMED, '/admin/items/c', null);

  const res = await readAll(tokenA);
  assert.equal(res.status, 204);

  for (const notification of aUnread) {
    const stored = await findStoredNotification(notification.id);
    assert.ok(stored.readAt instanceof Date);
  }

  for (const notification of aAlreadyRead) {
    const stored = await findStoredNotification(notification.id);
    assert.equal(stored.readAt.toISOString(), notification.readAt.toISOString());
  }

  for (const notification of bNotifications) {
    const stored = await findStoredNotification(notification.id);
    assert.equal(stored.readAt, null);
  }

  const storedC = await findStoredNotification(cNotification.id);
  assert.equal(storedC.readAt, null);

  const unreadB = await request('GET', '/api/notifications/unread-count', { token: tokenB });
  assert.deepEqual(unreadB.body?.data, { count: 10 });
});

test('B15 — concorrência entre duas chamadas read-all: cada notificação sofre uma única transição', async () => {
  const { user, token } = await createFixtureUser();
  const notifications = [];
  for (let i = 0; i < 5; i++) {
    notifications.push(
      await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, `/lost-reports/${i}`, null),
    );
  }

  await installTransitionCounter();
  try {
    const [first, second] = await Promise.all([readAll(token), readAll(token)]);

    assert.equal(first.status, 204);
    assert.equal(second.status, 204);
    assert.equal(await countTransitions(), 5);

    for (const notification of notifications) {
      const stored = await findStoredNotification(notification.id);
      assert.ok(stored.readAt instanceof Date);
    }
  } finally {
    await removeTransitionCounter();
  }
});

test('B16 — concorrência com marcação individual: apenas uma transição para a mesma notificação', async () => {
  const { user, token } = await createFixtureUser();
  const notification = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);

  await installTransitionCounter();
  try {
    const [allRes, singleRes] = await Promise.all([readAll(token), markRead(token, notification.id)]);

    assert.equal(allRes.status, 204);
    assert.equal(singleRes.status, 200);
    assert.equal(await countTransitions(), 1);

    const stored = await findStoredNotification(notification.id);
    assert.ok(stored.readAt instanceof Date);
    assert.equal(stored.readAt.toISOString(), singleRes.body?.data.readAt);
  } finally {
    await removeTransitionCounter();
  }
});

test('B17 — falha de persistência: erro controlado, sem falso sucesso e sem mutação parcial', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('a@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('b@example.com', 'Usuário B');

  const aNotifications = [
    await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null),
    await createFixtureNotification(userA.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null),
  ];
  const bNotification = await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/lost-reports/2', null);

  const failureTrigger = 'trg_test_fail_notification_read_all';
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  await AppDataSource.query(
    `CREATE TRIGGER ${failureTrigger}
       BEFORE UPDATE OF read_at ON notifications
       WHEN OLD.user_id = ${userA.id} AND OLD.read_at IS NULL
       BEGIN
         SELECT RAISE(ABORT, 'Falha simulada de persistência em lote no SQLite temporário');
       END`,
  );

  try {
    const res = await readAll(tokenA);

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error?.code, 500);
    assert.ok(!JSON.stringify(res.body).includes('Falha simulada de persistência'));
    assert.ok(!JSON.stringify(res.body).includes('stack'));

    for (const notification of aNotifications) {
      const stored = await findStoredNotification(notification.id);
      assert.equal(stored.readAt, null);
    }

    const storedB = await findStoredNotification(bNotification.id);
    assert.equal(storedB.readAt, null);

    const unreadB = await request('GET', '/api/notifications/unread-count', { token: tokenB });
    assert.deepEqual(unreadB.body?.data, { count: 1 });
  } finally {
    await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  }
});

test('B18 — todos os tipos de notificação são tratados da mesma forma', async () => {
  const { user, token } = await createFixtureUser();
  const matchFound = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/lost-reports/1', null);
  const itemClaimed = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  const reportResolved = await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/2', null);

  const res = await readAll(token);
  assert.equal(res.status, 204);

  const stored = await findAllStoredNotifications();
  assert.equal(stored.length, 3);
  assert.deepEqual(
    stored.map((n) => n.type).sort(),
    [NotificationType.ITEM_CLAIMED, NotificationType.MATCH_FOUND, NotificationType.REPORT_RESOLVED].sort(),
  );
  assert.ok(stored.find((n) => n.id === matchFound.id).readAt instanceof Date);
  assert.ok(stored.find((n) => n.id === itemClaimed.id).readAt instanceof Date);
  assert.ok(stored.find((n) => n.id === reportResolved.id).readAt instanceof Date);
});
