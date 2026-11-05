import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import type { LostReportStatus as LostReportStatusType } from '../models/enums.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-mine-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');
const { User } = await import('../models/user.js');
const { Category } = await import('../models/category.js');
const { Building } = await import('../models/building.js');
const { LostReport } = await import('../models/lost-report.js');
const { UserRole, LostReportStatus } = await import('../models/enums.js');
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
  await AppDataSource.query('DELETE FROM lost_reports');
  await AppDataSource.query('DELETE FROM categories');
  await AppDataSource.query('DELETE FROM buildings');
  await AppDataSource.query('DELETE FROM users');
});

async function getMineLostReports(
  queryString = '',
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const url = `${baseUrl}/api/lost-reports/mine${queryString ? `?${queryString}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function createFixtureUser(email = 'autor@example.com', name = 'Autor Perda'): Promise<{ user: any; token: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.save(
    userRepo.create({
      name,
      email,
      passwordHash: 'scrypt:salt:dummyhash',
      role: UserRole.USER,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createFixtureCategory(name = 'Documentos'): Promise<any> {
  const repo = AppDataSource.getRepository(Category);
  return await repo.save(repo.create({ name }));
}

async function createFixtureBuilding(name = 'Campus Central'): Promise<any> {
  const repo = AppDataSource.getRepository(Building);
  return await repo.save(
    repo.create({
      name,
      address: 'Rua Central, 100',
      pickupPoint: 'Recepção Bloco A',
      serviceHours: '08h às 18h',
    }),
  );
}

async function createFixtureLostReport(
  userId: number,
  categoryId: number,
  buildingId: number | null,
  description: string,
  lossDate: string,
  status: LostReportStatusType = LostReportStatus.OPEN,
): Promise<any> {
  const repo = AppDataSource.getRepository(LostReport);
  return await repo.save(
    repo.create({
      userId,
      categoryId,
      buildingId,
      description,
      lossDate: new Date(lossDate),
      status,
    }),
  );
}

// -----------------------------------------------------------------------------
// CENÁRIOS DE LISTAGEM PRÓPRIA (ROTA A)
// -----------------------------------------------------------------------------

test('A-RED01 — listar perdas do usuário autenticado retorna 200 e array com todos os seus relatos', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const r1 = await createFixtureLostReport(user.id, category.id, building.id, 'Relato 1 aberto', '2026-10-20', LostReportStatus.OPEN);
  const r2 = await createFixtureLostReport(user.id, category.id, building.id, 'Relato 2 resolvido', '2026-10-21', LostReportStatus.RESOLVED);
  const r3 = await createFixtureLostReport(user.id, category.id, null, 'Relato 3 cancelado', '2026-10-22', LostReportStatus.CANCELLED);

  const res = await getMineLostReports('', `Bearer ${token}`);

  assert.equal(res.status, 200, `esperado HTTP 200 mas recebeu ${res.status}`);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 3);

  const ids = res.body.data.map((r: any) => r.id);
  assert.ok(ids.includes(r1.id));
  assert.ok(ids.includes(r2.id));
  assert.ok(ids.includes(r3.id));
});

test('A-RED02 — usuário autenticado sem perdas cadastradas recebe 200 com array vazio []', async () => {
  const { token } = await createFixtureUser();

  const res = await getMineLostReports('', `Bearer ${token}`);

  assert.equal(res.status, 200, `esperado HTTP 200 mas recebeu ${res.status}`);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 0);
});

test('A-RED03 — isolamento estrito entre usuários: A e B só veem seus próprios relatos e C vê vazio', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@example.com', 'Usuário B');
  const { token: tokenC } = await createFixtureUser('userC@example.com', 'Usuário C');
  const category = await createFixtureCategory();

  const rA1 = await createFixtureLostReport(userA.id, category.id, null, 'Perda de A 1', '2026-10-10');
  const rA2 = await createFixtureLostReport(userA.id, category.id, null, 'Perda de A 2', '2026-10-11');
  const rA3 = await createFixtureLostReport(userA.id, category.id, null, 'Perda de A 3', '2026-10-12');

  const rB1 = await createFixtureLostReport(userB.id, category.id, null, 'Perda de B 1', '2026-10-15');
  const rB2 = await createFixtureLostReport(userB.id, category.id, null, 'Perda de B 2', '2026-10-16');

  const resA = await getMineLostReports('', `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  const idsA = resA.body.data.map((r: any) => r.id);
  assert.deepEqual(idsA.sort(), [rA1.id, rA2.id, rA3.id].sort());

  const resB = await getMineLostReports('', `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  const idsB = resB.body.data.map((r: any) => r.id);
  assert.deepEqual(idsB.sort(), [rB1.id, rB2.id].sort());

  const resC = await getMineLostReports('', `Bearer ${tokenC}`);
  assert.equal(resC.status, 200);
  assert.deepEqual(resC.body.data, []);
});

test('A-RED04 — filtro por status=OPEN retorna apenas relatos com status OPEN do usuário', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const rOpen = await createFixtureLostReport(user.id, category.id, null, 'Relato aberto', '2026-10-20', LostReportStatus.OPEN);
  await createFixtureLostReport(user.id, category.id, null, 'Relato resolvido', '2026-10-21', LostReportStatus.RESOLVED);
  await createFixtureLostReport(user.id, category.id, null, 'Relato cancelado', '2026-10-22', LostReportStatus.CANCELLED);

  const res = await getMineLostReports('status=OPEN', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, rOpen.id);
  assert.equal(res.body.data[0].status, LostReportStatus.OPEN);
});

test('A-RED05 — filtro por status=RESOLVED retorna apenas relatos com status RESOLVED do usuário', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  await createFixtureLostReport(user.id, category.id, null, 'Relato aberto', '2026-10-20', LostReportStatus.OPEN);
  const rResolved = await createFixtureLostReport(user.id, category.id, null, 'Relato resolvido', '2026-10-21', LostReportStatus.RESOLVED);
  await createFixtureLostReport(user.id, category.id, null, 'Relato cancelado', '2026-10-22', LostReportStatus.CANCELLED);

  const res = await getMineLostReports('status=RESOLVED', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, rResolved.id);
  assert.equal(res.body.data[0].status, LostReportStatus.RESOLVED);
});

test('A-RED06 — filtro por status=CANCELLED retorna apenas relatos com status CANCELLED do usuário', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  await createFixtureLostReport(user.id, category.id, null, 'Relato aberto', '2026-10-20', LostReportStatus.OPEN);
  await createFixtureLostReport(user.id, category.id, null, 'Relato resolvido', '2026-10-21', LostReportStatus.RESOLVED);
  const rCancelled = await createFixtureLostReport(user.id, category.id, null, 'Relato cancelado', '2026-10-22', LostReportStatus.CANCELLED);

  const res = await getMineLostReports('status=CANCELLED', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, rCancelled.id);
  assert.equal(res.body.data[0].status, LostReportStatus.CANCELLED);
});

test('A-RED07a — status inválido na query rejeitado com HTTP 400', async () => {
  const { token } = await createFixtureUser();

  for (const badStatus of ['INVALID', 'available', 'OPENED', 'open', 'resolved']) {
    const res = await getMineLostReports(`status=${badStatus}`, `Bearer ${token}`);
    assert.equal(res.status, 400, `esperado HTTP 400 para status=${badStatus} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
});

test('A-RED07b — status vazio ou parâmetros repetidos na query rejeitados com HTTP 400', async () => {
  const { token } = await createFixtureUser();

  for (const query of ['status=', 'status=OPEN&status=RESOLVED']) {
    const res = await getMineLostReports(query, `Bearer ${token}`);
    assert.equal(res.status, 400, `esperado HTTP 400 para query "${query}" mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
});

test('A-RED08 — autenticação obrigatória: rejeição com 401 para requisições sem token, token inválido ou expirado', async () => {
  const { user } = await createFixtureUser();

  // Sem token
  const resNoAuth = await getMineLostReports('');
  assert.equal(resNoAuth.status, 401);
  assert.equal(resNoAuth.body.success, false);

  // Formato inválido
  const resBadFormat = await getMineLostReports('', 'Basic dXNlcjpwYXNz');
  assert.equal(resBadFormat.status, 401);

  // Token adulterado
  const resTampered = await getMineLostReports('', 'Bearer token-invalido-xyz');
  assert.equal(resTampered.status, 401);

  // Token expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 200, expiresInSeconds: 100 },
  );
  const resExpired = await getMineLostReports('', `Bearer ${expiredToken}`);
  assert.equal(resExpired.status, 401);

  // Usuário inexistente no banco
  const nonExistentToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resNonExistent = await getMineLostReports('', `Bearer ${nonExistentToken}`);
  assert.equal(resNonExistent.status, 401);
});

test('A-RED09 — whitelist e privacidade: relatos retornados contêm apenas campos autorizados sem vazar dados de usuário', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  await createFixtureLostReport(user.id, category.id, building.id, 'Chaves com chaveiro', '2026-10-20');

  const res = await getMineLostReports('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);

  const report = res.body.data[0];
  const expectedKeys = ['buildingId', 'categoryId', 'createdAt', 'description', 'id', 'lossDate', 'status', 'userId'];
  assert.deepEqual(Object.keys(report).sort(), expectedKeys);

  assert.equal(report.userId, user.id);
  assert.equal((report as any).user, undefined);
  assert.equal((report as any).passwordHash, undefined);
  assert.equal((report as any).password_hash, undefined);
  assert.equal((report as any).notifications, undefined);
  assert.equal((report as any).handovers, undefined);
});

test('A-RED10 — integridade read-only: consultas com sucesso ou erro não causam mutações no banco', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  await createFixtureLostReport(user.id, category.id, null, 'Perda inicial', '2026-10-20');

  const countBefore = await AppDataSource.getRepository(LostReport).count();
  assert.equal(countBefore, 1);

  await getMineLostReports('', `Bearer ${token}`);
  await getMineLostReports('status=OPEN', `Bearer ${token}`);
  await getMineLostReports('status=INVALID', `Bearer ${token}`);
  await getMineLostReports('');

  const countAfter = await AppDataSource.getRepository(LostReport).count();
  assert.equal(countAfter, countBefore);
});

test('A-RED11 — limites e robustez: suporte a múltiplos registros, buildingId nulo e caracteres Unicode', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const unicodeDesc = 'Mochila com bandeira do Brasil 🇧🇷 — esquecida no Auditório 3 com crachá';
  const rUnicode = await createFixtureLostReport(user.id, category.id, null, unicodeDesc, '2026-10-23');

  const res = await getMineLostReports('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, rUnicode.id);
  assert.equal(res.body.data[0].description, unicodeDesc);
  assert.equal(res.body.data[0].buildingId, null);
});

test('A-RED12 — tentativa de manipular proprietário via query param (ex: ?userId=999) não altera o escopo do usuário autenticado', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário A');
  const { user: userB } = await createFixtureUser('userB@example.com', 'Usuário B');
  const category = await createFixtureCategory();

  const rA = await createFixtureLostReport(userA.id, category.id, null, 'Perda de A', '2026-10-20');
  await createFixtureLostReport(userB.id, category.id, null, 'Perda de B', '2026-10-20');

  // Usuário A envia ?userId=userB.id
  const res = await getMineLostReports(`userId=${userB.id}`, `Bearer ${tokenA}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, rA.id, 'deve retornar apenas o relato do usuário autenticado A');
  assert.equal(res.body.data[0].userId, userA.id);
});
