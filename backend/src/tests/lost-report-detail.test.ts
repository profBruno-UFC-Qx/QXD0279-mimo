import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import type { LostReportStatus as LostReportStatusType } from '../models/enums.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-detail-test-'));
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

test('B-RED01 — consultar relato de perda próprio existente retorna 200 com PublicLostReportDto', async () => {
  const { user, token } = await createFixtureUser('user1@ufc.br');
  const cat = await createFixtureCategory('Eletrônicos');
  const bld = await createFixtureBuilding('Bloco 1');

  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    bld.id,
    'Mochila cinza esquecida na sala 102',
    '2026-10-15',
    LostReportStatus.OPEN,
  );

  const res = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as ApiBody;
  assert.equal(body.success, true);
  assert.ok(body.data);
  assert.equal(body.data.id, report.id);
  assert.equal(body.data.userId, user.id);
  assert.equal(body.data.categoryId, cat.id);
  assert.equal(body.data.buildingId, bld.id);
  assert.equal(body.data.description, 'Mochila cinza esquecida na sala 102');
  assert.equal(body.data.lossDate, '2026-10-15');
  assert.equal(body.data.status, 'OPEN');
  assert.ok(body.data.createdAt);
});

test('B-RED02 — consultar ID inexistente no banco retorna HTTP 404', async () => {
  const { token } = await createFixtureUser('user1@ufc.br');

  const res = await fetch(`${baseUrl}/api/lost-reports/999999`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 404);
  const body = (await res.json()) as ApiBody;
  assert.equal(body.success, false);
  assert.equal(body.error?.code, 404);
  assert.ok(body.error?.details.includes('Relato de perda não encontrado.'));
});

test('B-RED03 — consultar relato existente pertencente a outro usuário retorna HTTP 404 sem revelar dados', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory('Documentos');

  const reportB = await createFixtureLostReport(
    userB.id,
    cat.id,
    null,
    'Carteira funcional confidencial de B',
    '2026-10-20',
    LostReportStatus.OPEN,
  );

  const res = await fetch(`${baseUrl}/api/lost-reports/${reportB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });

  assert.equal(res.status, 404);
  const body = (await res.json()) as ApiBody;
  assert.equal(body.success, false);
  assert.equal(body.error?.code, 404);
  assert.ok(body.error?.details.includes('Relato de perda não encontrado.'));
  assert.equal(body.data, null);
});

test('B-RED04 — uniformidade anti-enumeração: respostas de ID inexistente e de terceiro são idênticas', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory('Outros');

  const reportB = await createFixtureLostReport(
    userB.id,
    cat.id,
    null,
    'Chaves de B',
    '2026-10-21',
  );

  const resNonExistent = await fetch(`${baseUrl}/api/lost-reports/888888`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const resOtherUser = await fetch(`${baseUrl}/api/lost-reports/${reportB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });

  assert.equal(resNonExistent.status, 404);
  assert.equal(resOtherUser.status, 404);

  const bodyNonExistent = (await resNonExistent.json()) as ApiBody;
  const bodyOtherUser = (await resOtherUser.json()) as ApiBody;

  assert.deepEqual(bodyNonExistent, bodyOtherUser);
});

test('B-RED05 — IDs inválidos no path retornam HTTP 400', async () => {
  const { token } = await createFixtureUser('user@ufc.br');

  const invalidIds = ['0', '-1', '-100', 'abc', '1.5', '1e5', 'null', 'undefined', '9007199254740992'];

  for (const id of invalidIds) {
    const res = await fetch(`${baseUrl}/api/lost-reports/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(
      res.status,
      400,
      `esperado 400 para id="${id}", recebido ${res.status}`,
    );
    const body = (await res.json()) as ApiBody;
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 400);
    assert.ok(body.error?.details.includes('ID inválido'));
  }
});

test('B-RED06 — autenticação obrigatória: 401 para sem token, malformado, expirado ou usuário inexistente', async () => {
  const { user } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Outros');
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Caneta', '2026-10-22');

  // Sem token
  const resNoAuth = await fetch(`${baseUrl}/api/lost-reports/${report.id}`);
  assert.equal(resNoAuth.status, 401);

  // Token malformado
  const resBadToken = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: 'Bearer token-invalido-xyz' },
  });
  assert.equal(resBadToken.status, 401);

  // Token expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const resExpired = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(resExpired.status, 401);

  // Usuário inexistente no token
  const ghostToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resGhost = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${ghostToken}` },
  });
  assert.equal(resGhost.status, 401);
});

test('B-RED07 — consulta permitida para perdas próprias nos status OPEN, RESOLVED e CANCELLED', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Eletrônicos');

  const reportOpen = await createFixtureLostReport(user.id, cat.id, null, 'Item 1', '2026-10-01', LostReportStatus.OPEN);
  const reportResolved = await createFixtureLostReport(user.id, cat.id, null, 'Item 2', '2026-10-02', LostReportStatus.RESOLVED);
  const reportCancelled = await createFixtureLostReport(user.id, cat.id, null, 'Item 3', '2026-10-03', LostReportStatus.CANCELLED);

  for (const rep of [reportOpen, reportResolved, reportCancelled]) {
    const res = await fetch(`${baseUrl}/api/lost-reports/${rep.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ApiBody;
    assert.equal(body.data.id, rep.id);
    assert.equal(body.data.status, rep.status);
  }
});

test('B-RED08 — whitelist estrita: objeto retornado contém apenas as 8 propriedades públicas', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Eletrônicos');
  const bld = await createFixtureBuilding('Bloco 2');

  const report = await createFixtureLostReport(user.id, cat.id, bld.id, 'Celular', '2026-10-05');

  const res = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ApiBody;

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

  const actualKeys = Object.keys(body.data).sort();
  assert.deepEqual(actualKeys, expectedKeys);
});

test('B-RED09 — integridade read-only: consultas de sucesso, não encontrado ou erro não alteram o banco', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Livros');

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Cálculo I', '2026-10-06');

  const countBefore = await AppDataSource.getRepository(LostReport).count();
  const reportBefore = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });

  await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await fetch(`${baseUrl}/api/lost-reports/9999`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await fetch(`${baseUrl}/api/lost-reports/invalido`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const countAfter = await AppDataSource.getRepository(LostReport).count();
  const reportAfter = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });

  assert.equal(countAfter, countBefore);
  assert.equal(reportAfter.description, reportBefore.description);
  assert.equal(reportAfter.status, reportBefore.status);
});

test('B-RED10 — isolamento entre relatos semelhantes de usuários diferentes', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB, token: tokenB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory('Acessórios');

  const reportA = await createFixtureLostReport(userA.id, cat.id, null, 'Garrafa térmica azul', '2026-10-10');
  const reportB = await createFixtureLostReport(userB.id, cat.id, null, 'Garrafa térmica azul', '2026-10-10');

  // A acessa A: OK
  const resAtoA = await fetch(`${baseUrl}/api/lost-reports/${reportA.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(resAtoA.status, 200);

  // A acessa B: 404
  const resAtoB = await fetch(`${baseUrl}/api/lost-reports/${reportB.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(resAtoB.status, 404);

  // B acessa B: OK
  const resBtoB = await fetch(`${baseUrl}/api/lost-reports/${reportB.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(resBtoB.status, 200);

  // B acessa A: 404
  const resBtoA = await fetch(`${baseUrl}/api/lost-reports/${reportA.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(resBtoA.status, 404);
});

test('B-RED11 — suporte a buildingId nulo preservado na resposta', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Geral');

  const report = await createFixtureLostReport(user.id, cat.id, null, 'Guarda-chuva', '2026-10-11');

  const res = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ApiBody;
  assert.equal(body.data.buildingId, null);
});

test('B-RED12 — fluxo integrado: POST /api/lost-reports -> GET /api/lost-reports/mine -> GET /api/lost-reports/:id', async () => {
  const { token } = await createFixtureUser('user@ufc.br');
  const cat = await createFixtureCategory('Documentos');

  // 1. Criar relato via POST /api/lost-reports
  const createRes = await fetch(`${baseUrl}/api/lost-reports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      categoryId: cat.id,
      description: 'RG perdido próximo à biblioteca',
      lossDate: '2026-10-12',
    }),
  });
  assert.equal(createRes.status, 201);
  const createBody = (await createRes.json()) as ApiBody;
  const createdId = createBody.data.lostReport.id;

  // 2. Listar via GET /api/lost-reports/mine
  const mineRes = await fetch(`${baseUrl}/api/lost-reports/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(mineRes.status, 200);
  const mineBody = (await mineRes.json()) as ApiBody;
  assert.ok(mineBody.data.some((r: any) => r.id === createdId));

  // 3. Buscar via GET /api/lost-reports/:id
  const detailRes = await fetch(`${baseUrl}/api/lost-reports/${createdId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(detailRes.status, 200);
  const detailBody = (await detailRes.json()) as ApiBody;
  assert.equal(detailBody.data.id, createdId);
  assert.equal(detailBody.data.description, 'RG perdido próximo à biblioteca');
  assert.equal(detailBody.data.lossDate, '2026-10-12');
  assert.equal(detailBody.data.status, 'OPEN');
});
