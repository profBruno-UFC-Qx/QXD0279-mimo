import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-notif-list-test-'));
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

async function getNotifications(
  queryString = '',
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const url = `${baseUrl}/api/notifications${queryString ? `?${queryString}` : ''}`;
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

test('A01 — listagem de notificações próprias: retorna 200, array com todos os registros e sem duplicatas', async () => {
  const { user, token } = await createFixtureUser();

  const n1 = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  const n2 = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date());

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);

  const ids = res.body.data.map((n: any) => n.id);
  assert.ok(ids.includes(n1.id));
  assert.ok(ids.includes(n2.id));
});

test('A02 — sem notificações: usuário sem registros recebe 200 com array vazio []', async () => {
  const { token } = await createFixtureUser();

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, []);
});

test('A03 — isolamento entre usuários: A e B só veem suas próprias notificações e C recebe vazio', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@example.com', 'Usuário B');
  const { token: tokenC } = await createFixtureUser('userC@example.com', 'Usuário C');

  const nA1 = await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/items/10', null);
  const nA2 = await createFixtureNotification(userA.id, NotificationType.REPORT_RESOLVED, '/items/11', null);
  const nB1 = await createFixtureNotification(userB.id, NotificationType.ITEM_CLAIMED, '/items/20', null);

  const resA = await getNotifications('', `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.data.length, 2);
  assert.ok(resA.body.data.every((n: any) => n.userId === userA.id));
  assert.ok(!resA.body.data.some((n: any) => n.id === nB1.id));

  const resB = await getNotifications('', `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.data.length, 1);
  assert.equal(resB.body.data[0].id, nB1.id);
  assert.equal(resB.body.data[0].userId, userB.id);

  const resC = await getNotifications('', `Bearer ${tokenC}`);
  assert.equal(resC.status, 200);
  assert.deepEqual(resC.body.data, []);
});

test('A04 — sem filtro read: retorna notificações lidas e não lidas do usuário', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date('2026-10-01T12:00:00Z'));

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);

  const unread = res.body.data.find((n: any) => n.readAt === null);
  const read = res.body.data.find((n: any) => n.readAt !== null);
  assert.ok(unread);
  assert.ok(read);
});

test('A05 — filtro read=true: retorna somente notificações com readAt preenchido', async () => {
  const { user, token } = await createFixtureUser();

  const unread = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  const read = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date('2026-10-02T10:00:00Z'));

  const res = await getNotifications('read=true', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, read.id);
  assert.ok(res.body.data[0].readAt !== null);
});

test('A06 — filtro read=false: retorna somente notificações com readAt null', async () => {
  const { user, token } = await createFixtureUser();

  const unread = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  const read = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date('2026-10-02T10:00:00Z'));

  const res = await getNotifications('read=false', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, unread.id);
  assert.equal(res.body.data[0].readAt, null);
});

test('A07 — filtro combinado com isolamento: filtro read não vaza registros de outros usuários', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB } = await createFixtureUser('userB@example.com', 'Usuário B');

  await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(userA.id, NotificationType.ITEM_CLAIMED, '/items/2', new Date());
  await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/items/3', null);
  await createFixtureNotification(userB.id, NotificationType.ITEM_CLAIMED, '/items/4', new Date());

  const resTrue = await getNotifications('read=true', `Bearer ${tokenA}`);
  assert.equal(resTrue.status, 200);
  assert.equal(resTrue.body.data.length, 1);
  assert.equal(resTrue.body.data[0].userId, userA.id);

  const resFalse = await getNotifications('read=false', `Bearer ${tokenA}`);
  assert.equal(resFalse.status, 200);
  assert.equal(resFalse.body.data.length, 1);
  assert.equal(resFalse.body.data[0].userId, userA.id);
});

test('A08 — parâmetros inválidos na query read retornam HTTP 400', async () => {
  const { token } = await createFixtureUser();

  const invalidQueries = [
    'read=',
    'read=invalid',
    'read=1',
    'read=0',
    'read=yes',
    'read=TRUE',
    'read=False',
    'read=true&read=false',
    'read[]=true',
  ];

  for (const q of invalidQueries) {
    const res = await getNotifications(q, `Bearer ${token}`);
    assert.equal(res.status, 400, `esperado HTTP 400 para query "${q}" mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
});

test('A09 — tentativa de manipulação de proprietário via query param não afeta escopo do usuário autenticado', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB } = await createFixtureUser('userB@example.com', 'Usuário B');

  const nA = await createFixtureNotification(userA.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(userB.id, NotificationType.MATCH_FOUND, '/items/2', null);

  const res = await getNotifications(`userId=${userB.id}`, `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, nA.id);
  assert.equal(res.body.data[0].userId, userA.id);
});

test('A10 — autenticação obrigatória: requisição sem token retorna HTTP 401', async () => {
  const res = await getNotifications('');
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 401);
});

test('A11 — tokens inválidos, expirados ou de usuário inexistente retornam HTTP 401', async () => {
  const { user } = await createFixtureUser();

  // 1. Header malformado
  const resBadHeader = await getNotifications('', 'Basic dXNlcjpwYXNz');
  assert.equal(resBadHeader.status, 401);

  // 2. Token adulterado
  const resTampered = await getNotifications('', 'Bearer token.invalido.adulterado');
  assert.equal(resTampered.status, 401);

  // 3. Token expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const resExpired = await getNotifications('', `Bearer ${expiredToken}`);
  assert.equal(resExpired.status, 401);

  // 4. Usuário inexistente
  const nonExistentToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resNonExistent = await getNotifications('', `Bearer ${nonExistentToken}`);
  assert.equal(resNonExistent.status, 401);
});

test('A12 — três tipos de notificação são retornados corretamente sem exclusão indevida', async () => {
  const { user, token } = await createFixtureUser();

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/admin/items/1', null);
  await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/lost-reports/1', null);

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 3);

  const types = res.body.data.map((n: any) => n.type).sort();
  assert.deepEqual(types, ['ITEM_CLAIMED', 'MATCH_FOUND', 'REPORT_RESOLVED']);
});

test('A13 — whitelist de resposta: expõe estritamente os 6 campos públicos sem vazar entidades ou passwordHash', async () => {
  const { user, token } = await createFixtureUser();
  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);

  const item = res.body.data[0];
  const expectedKeys = ['createdAt', 'id', 'linkUrl', 'readAt', 'type', 'userId'].sort();
  assert.deepEqual(Object.keys(item).sort(), expectedKeys);

  assert.equal((item as any).user, undefined);
  assert.equal((item as any).passwordHash, undefined);
});

test('A14 — campos de data: readAt nulo serializado como null e createdAt preservado', async () => {
  const { user, token } = await createFixtureUser();
  const dateRead = new Date('2026-10-15T14:30:00.000Z');

  const unread = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  const read = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', dateRead);

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);

  const itemUnread = res.body.data.find((n: any) => n.id === unread.id);
  assert.equal(itemUnread.readAt, null);
  assert.ok(itemUnread.createdAt);

  const itemRead = res.body.data.find((n: any) => n.id === read.id);
  assert.ok(itemRead.readAt);
  assert.ok(itemRead.createdAt);
});

test('A15 — integridade read-only: listagem não altera estado de leitura nem quantidade de registros', async () => {
  const { user, token } = await createFixtureUser();
  const n = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);

  const snapBefore = await AppDataSource.getRepository(Notification).find();

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);

  const snapAfter = await AppDataSource.getRepository(Notification).find();
  assert.equal(snapAfter.length, snapBefore.length);
  assert.equal(snapAfter[0].id, n.id);
  assert.equal(snapAfter[0].readAt, null);
});

test('A16 — múltiplos registros e caracteres especiais no linkUrl são preservados', async () => {
  const { user, token } = await createFixtureUser();
  const specialUrl = '/lost-reports/detalhes?item=Óculos%20de%20Grau&busca=chaves%20antigas';

  await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, specialUrl, null);

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data[0].linkUrl, specialUrl);
});

test('A17 — erro de banco de dados resulta em HTTP 500 padronizado sem vazar SQL ou stack trace', async () => {
  const { token } = await createFixtureUser();

  const notifRepo = AppDataSource.getRepository(Notification);
  const originalFind = notifRepo.find;
  const originalCreateQueryBuilder = notifRepo.createQueryBuilder;

  // Intercepta método para forçar falha controlada
  (notifRepo as any).createQueryBuilder = () => {
    throw new Error('Falha simulada no driver SQLite');
  };

  try {
    const res = await getNotifications('', `Bearer ${token}`);
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 500);
    assert.ok(!JSON.stringify(res.body).includes('Falha simulada no driver SQLite'));
    assert.ok(!JSON.stringify(res.body).includes('stack'));
  } finally {
    (notifRepo as any).createQueryBuilder = originalCreateQueryBuilder;
    (notifRepo as any).find = originalFind;
  }
});

test('A18 — ordenação estável por createdAt DESC, id DESC', async () => {
  const { user, token } = await createFixtureUser();

  const n1 = await createFixtureNotification(user.id, NotificationType.MATCH_FOUND, '/items/1', null);
  const n2 = await createFixtureNotification(user.id, NotificationType.ITEM_CLAIMED, '/items/2', null);
  const n3 = await createFixtureNotification(user.id, NotificationType.REPORT_RESOLVED, '/items/3', null);

  const res = await getNotifications('', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 3);

  // Ordem decrescente
  const ids = res.body.data.map((n: any) => n.id);
  assert.deepEqual(ids, [n3.id, n2.id, n1.id]);
});
