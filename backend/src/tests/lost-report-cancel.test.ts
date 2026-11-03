import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import type { LostReportStatus as LostReportStatusType } from '../models/enums.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-cancel-test-'));
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
  assert.equal(AppDataSource.options.database, dbPath, 'testes nunca devem usar o SQLite de dev');
  assert.notEqual(
    AppDataSource.options.database,
    path.resolve('data/achadex.sqlite'),
    'isolamento obrigatório do banco de desenvolvimento',
  );

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  server = app.listen(0);
  await once(server, 'listening');
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (server) {
    server.close();
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }
});

beforeEach(async () => {
  await AppDataSource.query('DELETE FROM lost_reports');
  await AppDataSource.query('DELETE FROM items');
  await AppDataSource.query('DELETE FROM categories');
  await AppDataSource.query('DELETE FROM buildings');
  await AppDataSource.query('DELETE FROM users');
});

async function createFixtureUser(email = 'user@ufc.br', name = 'User Test'): Promise<{ user: any; token: string }> {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      name,
      email,
      passwordHash: 'dummy-hash',
      role: UserRole.USER,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createFixtureCategory(name = 'Eletrônicos'): Promise<any> {
  const repo = AppDataSource.getRepository(Category);
  return await repo.save(repo.create({ name }));
}

async function createFixtureBuilding(name = 'Bloco 1'): Promise<any> {
  const repo = AppDataSource.getRepository(Building);
  return await repo.save(
    repo.create({
      name,
      address: 'Rua Universitária, 100',
      pickupPoint: 'Recepção Bloco 1',
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
      lossDate: lossDate as any,
      status,
    }),
  );
}

async function cancelLostReport(
  id: string | number,
  token?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}/api/lost-reports/${encodeURIComponent(String(id))}/cancel`, {
    method: 'POST',
    headers,
  });
  return {
    status: res.status,
    body: (await res.json()) as ApiBody,
  };
}

// -----------------------------------------------------------------------------
// CENÁRIOS DE CANCELAMENTO (ROTA B - POST /:id/cancel)
// -----------------------------------------------------------------------------

test('B01 — cancelamento válido: relato próprio OPEN passa para CANCELLED com 200', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const bld = await createFixtureBuilding();

  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    bld.id,
    'Mochila cinza para cancelar',
    '2026-10-15',
    LostReportStatus.OPEN,
  );

  const res = await cancelLostReport(report.id, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.userId, user.id);
  assert.equal(res.body.data.status, 'CANCELLED');
  assert.equal(res.body.data.description, 'Mochila cinza para cancelar');
  assert.equal(res.body.data.categoryId, cat.id);
  assert.equal(res.body.data.buildingId, bld.id);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});

test('B02 — autenticação obrigatória: cancelamento sem JWT retorna HTTP 401', async () => {
  const { user } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato teste 123', '2026-10-15');

  const res = await cancelLostReport(report.id);
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.OPEN);
});

test('B03 — tokens inválidos: malformado, expirado e usuário inexistente retornam HTTP 401', async () => {
  const { user } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato teste 456', '2026-10-15');

  // Malformado
  const resBad = await cancelLostReport(report.id, 'token-invalido');
  assert.equal(resBad.status, 401);

  // Expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const resExpired = await cancelLostReport(report.id, expiredToken);
  assert.equal(resExpired.status, 401);

  // Usuário inexistente
  const ghostToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resGhost = await cancelLostReport(report.id, ghostToken);
  assert.equal(resGhost.status, 401);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.OPEN);
});

test('B04 — relato de terceiros: usuário A tenta cancelar relato de B e recebe 404 sem alteração', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory();

  const reportB = await createFixtureLostReport(userB.id, cat.id, null, 'Relato de B inviolável', '2026-10-15');

  const res = await cancelLostReport(reportB.id, tokenA);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 404);
  assert.ok(res.body.error?.details.includes('Relato de perda não encontrado.'));

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: reportB.id });
  assert.equal(inDb.status, LostReportStatus.OPEN);
});

test('B05 — relato inexistente retorna HTTP 404 idêntico a relato de terceiro', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory();

  const reportB = await createFixtureLostReport(userB.id, cat.id, null, 'Relato de B', '2026-10-15');

  const resInexistente = await cancelLostReport(999999, tokenA);
  const resTerceiro = await cancelLostReport(reportB.id, tokenA);

  assert.equal(resInexistente.status, 404);
  assert.equal(resTerceiro.status, 404);
  assert.deepEqual(resInexistente.body, resTerceiro.body);
});

test('B06 — IDs inválidos no path retornam HTTP 400', async () => {
  const { token } = await createFixtureUser();
  const invalidIds = ['0', '-1', 'abc', '12abc', '1.5', 'null', 'undefined', '9007199254740992', '999999999999999999999999999'];

  for (const id of invalidIds) {
    const res = await cancelLostReport(id, token);
    assert.equal(res.status, 400, `esperado 400 para id="${id}", recebido ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
});

test('B07 — relato com status RESOLVED não pode ser cancelado (retorna HTTP 409 Conflito)', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    null,
    'Relato resolvido preliminar',
    '2026-10-10',
    LostReportStatus.RESOLVED,
  );

  const res = await cancelLostReport(report.id, token);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 409);
  assert.ok(res.body.error?.details.includes('Somente relatos com status OPEN podem ser cancelados.'));

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.RESOLVED);
});

test('B08 — cancelamento repetido: segunda tentativa retorna HTTP 409 sem nova mutação', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato para cancelar duas vezes', '2026-10-10');

  // 1º cancelamento -> 200
  const res1 = await cancelLostReport(report.id, token);
  assert.equal(res1.status, 200);
  assert.equal(res1.body.data.status, 'CANCELLED');

  // 2º cancelamento -> 409
  const res2 = await cancelLostReport(report.id, token);
  assert.equal(res2.status, 409);
  assert.equal(res2.body.success, false);
  assert.equal(res2.body.error?.code, 409);
  assert.ok(res2.body.error?.details.includes('Somente relatos com status OPEN podem ser cancelados.'));

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});

test('B09 — preservação estrita de campos: cancelamento altera somente o status', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const bld = await createFixtureBuilding();

  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    bld.id,
    'Descrição completa estável 100%',
    '2026-10-11',
    LostReportStatus.OPEN,
  );

  const beforeSnap = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });

  const res = await cancelLostReport(report.id, token);
  assert.equal(res.status, 200);

  const afterSnap = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });

  assert.equal(afterSnap.id, beforeSnap.id);
  assert.equal(afterSnap.userId, beforeSnap.userId);
  assert.equal(afterSnap.categoryId, beforeSnap.categoryId);
  assert.equal(afterSnap.buildingId, beforeSnap.buildingId);
  assert.equal(afterSnap.description, beforeSnap.description);
  assert.equal(afterSnap.lossDate, beforeSnap.lossDate);
  assert.equal(afterSnap.createdAt.toISOString(), beforeSnap.createdAt.toISOString());
  assert.equal(afterSnap.status, LostReportStatus.CANCELLED);
});

test('B10 — concorrência: duas requisições concorrentes de cancelamento realizam exatamente uma transição', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato concorrencia cancel', '2026-10-10');

  const [resA, resB] = await Promise.all([
    cancelLostReport(report.id, token),
    cancelLostReport(report.id, token),
  ]);

  const statuses = [resA.status, resB.status].sort();
  // Exatamente uma obtém 200 e a outra obtém 409
  assert.deepEqual(statuses, [200, 409]);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});

test('B11 — disputa entre PATCH e cancelamento: após cancelado, PATCH posterior é rejeitado com 409', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato disputa patch x cancel', '2026-10-10');

  // 1. Cancela o relato
  const cancelRes = await cancelLostReport(report.id, token);
  assert.equal(cancelRes.status, 200);

  // 2. Tenta PATCH posterior
  const patchRes = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description: 'Tentando editar relato cancelado' }),
  });

  assert.equal(patchRes.status, 409);
  const patchBody = (await patchRes.json()) as ApiBody;
  assert.equal(patchBody.success, false);
  assert.equal(patchBody.error?.code, 409);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Relato disputa patch x cancel');
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});

test('B12 — whitelist pública: resposta de sucesso respeita exatamente as 8 propriedades públicas', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Objeto teste whitelist', '2026-10-10');

  const res = await cancelLostReport(report.id, token);
  assert.equal(res.status, 200);

  const expectedKeys = [
    'id',
    'userId',
    'categoryId',
    'buildingId',
    'description',
    'lossDate',
    'status',
    'createdAt',
  ].sort();

  const actualKeys = Object.keys(res.body.data).sort();
  assert.deepEqual(actualKeys, expectedKeys);
});

test('B13 — integração: após cancelamento, GET /:id retorna CANCELLED e GET /mine filtra corretamente', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Relato integrado cancel', '2026-10-10');

  // Cancelar
  const cancelRes = await cancelLostReport(report.id, token);
  assert.equal(cancelRes.status, 200);

  // GET /:id
  const getDetail = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getDetail.status, 200);
  const detailBody = (await getDetail.json()) as ApiBody;
  assert.equal(detailBody.data.status, 'CANCELLED');

  // GET /mine?status=CANCELLED
  const getCancelled = await fetch(`${baseUrl}/api/lost-reports/mine?status=CANCELLED`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getCancelled.status, 200);
  const cancelledBody = (await getCancelled.json()) as ApiBody;
  assert.ok(cancelledBody.data.some((r: any) => r.id === report.id));

  // GET /mine?status=OPEN
  const getOpen = await fetch(`${baseUrl}/api/lost-reports/mine?status=OPEN`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getOpen.status, 200);
  const openBody = (await getOpen.json()) as ApiBody;
  assert.ok(!openBody.data.some((r: any) => r.id === report.id));
});
