import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-notif-unread-count-test-'));
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

async function getUnreadCount(
  queryString = '',
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const url = `${baseUrl}/api/notifications/unread-count${queryString ? `?${queryString}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
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

test('B01 — contagem básica: três notificações próprias não lidas retornam count 3', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/items/3', null);

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { count: 3 });
});

test('B02 — nenhuma notificação: usuário sem notificações recebe count 0', async () => {
  const { token } = await createFixtureUser();

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { count: 0 });
});

test('B03 — todas lidas: usuário com apenas notificações lidas recebe count 0', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', new Date());
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date());

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { count: 0 });
});

test('B04 — mistura de lidas e não lidas: conta somente registros com readAt = null', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/2', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/3', new Date());
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/items/4', new Date());
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/items/5', new Date());

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { count: 2 });
});

test('B05 — isolamento entre usuários: contagem considera apenas o usuário autenticado', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@example.com', 'Usuário B');

  await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(userA.id, NotificationType.ITEM_CLAIMED, '/items/2', null);

  await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/items/3', null);
  await createFixtureNotification(userB.id, NotificationType.ITEM_CLAIMED, '/items/4', null);
  await createFixtureNotification(userB.id, NotificationType.REPORT_RESOLVED, '/items/5', null);

  const resA = await getUnreadCount('', `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  assert.deepEqual(resA.body.data, { count: 2 });

  const resB = await getUnreadCount('', `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  assert.deepEqual(resB.body.data, { count: 3 });
});

test('B06 — tentativa de manipulação da identidade via query param não afeta o resultado', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@example.com', 'Usuário B');

  await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/items/2', null);
  await createFixtureNotification(userB.id, NotificationType.ITEM_CLAIMED, '/items/3', null);

  const res = await getUnreadCount(`userId=${userB.id}`, `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { count: 1 });
});

test('B07 — autenticação obrigatória: requisição sem token retorna HTTP 401', async () => {
  const res = await getUnreadCount('');
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 401);
});

test('B08 — tokens inválidos, expirados ou de usuário inexistente retornam HTTP 401', async () => {
  const { user } = await createFixtureUser();

  // 1. Header malformado
  const resBadHeader = await getUnreadCount('', 'Basic dXNlcjpwYXNz');
  assert.equal(resBadHeader.status, 401);

  // 2. Token adulterado
  const resTampered = await getUnreadCount('', 'Bearer token.invalido.adulterado');
  assert.equal(resTampered.status, 401);

  // 3. Token expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const resExpired = await getUnreadCount('', `Bearer ${expiredToken}`);
  assert.equal(resExpired.status, 401);

  // 4. Usuário inexistente
  const nonExistentToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resNonExistent = await getUnreadCount('', `Bearer ${nonExistentToken}`);
  assert.equal(resNonExistent.status, 401);
});

test('B09 — formato exato da resposta: data.count é número inteiro não negativo e envelope é estrito', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(typeof res.body.data.count, 'number');
  assert.equal(Number.isInteger(res.body.data.count), true);
  assert.equal(res.body.data.count >= 0, true);
  assert.deepEqual(Object.keys(res.body.data), ['count']);
});

test('B10 — todos os três tipos de notificação são contabilizados quando não lidos', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/1', null);

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { count: 3 });
});

test('B11 — integridade read-only: contagem não altera readAt nem remove/adiciona registros', async () => {
  const { user, token } = await createFixtureUser();
  const n = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);

  const snapBefore = await AppDataSource.getRepository(Notification).find();

  const res = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(res.status, 200);

  const snapAfter = await AppDataSource.getRepository(Notification).find();
  assert.equal(snapAfter.length, snapBefore.length);
  assert.equal(snapAfter[0].id, n.id);
  assert.equal(snapAfter[0].readAt, null);
});

test('B12 — erro de banco de dados resulta em HTTP 500 controlado sem vazar SQL ou stack trace', async () => {
  const { token } = await createFixtureUser();

  const notifRepo = AppDataSource.getRepository(Notification);
  const originalCount = notifRepo.count;
  const originalCreateQueryBuilder = notifRepo.createQueryBuilder;

  (notifRepo as any).createQueryBuilder = () => {
    throw new Error('Falha simulada no driver SQLite na contagem');
  };

  try {
    const res = await getUnreadCount('', `Bearer ${token}`);
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 500);
    assert.ok(!JSON.stringify(res.body).includes('Falha simulada no driver SQLite na contagem'));
    assert.ok(!JSON.stringify(res.body).includes('stack'));
  } finally {
    (notifRepo as any).createQueryBuilder = originalCreateQueryBuilder;
    (notifRepo as any).count = originalCount;
  }
});

test('B13 — integração: count é exatamente igual à quantidade de itens retornados por GET /api/notifications?read=false', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/items/3', new Date());

  // 1. Contagem
  const countRes = await getUnreadCount('', `Bearer ${token}`);
  assert.equal(countRes.status, 200);

  // 2. Listagem não lidas
  const listRes = await fetch(`${baseUrl}/api/notifications?read=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const listBody = (await listRes.json()) as ApiBody;

  assert.equal(countRes.body.data.count, listBody.data.length);
  assert.equal(countRes.body.data.count, 2);
});

test('B14 — múltiplos usuários e múltiplos registros: contagem correta sob volume de dados', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@example.com', 'Usuário B');

  for (let i = 0; i < 7; i++) {
    await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, `/items/${i}`, null);
  }
  for (let i = 0; i < 3; i++) {
    await createFixtureNotification(userA.id, NotificationType.ITEM_CLAIMED, `/items/${i + 10}`, new Date());
  }

  for (let i = 0; i < 12; i++) {
    await createFixtureNotification(userB.id, NotificationType.REPORT_RESOLVED, `/items/${i + 20}`, null);
  }

  const resA = await getUnreadCount('', `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  assert.deepEqual(resA.body.data, { count: 7 });

  const resB = await getUnreadCount('', `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  assert.deepEqual(resB.body.data, { count: 12 });
});

test('B15 — consultas repetidas retornam o mesmo valor de forma determinística', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', null);

  for (let i = 0; i < 3; i++) {
    const res = await getUnreadCount('', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { count: 2 });
  }
});
