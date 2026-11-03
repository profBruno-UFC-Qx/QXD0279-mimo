import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import type { LostReportStatus as LostReportStatusType } from '../models/enums.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-update-test-'));
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

async function patchLostReport(
  id: string | number,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}/api/lost-reports/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as ApiBody,
  };
}

// -----------------------------------------------------------------------------
// CENÁRIOS DE ATUALIZAÇÃO (ROTA A - PATCH)
// -----------------------------------------------------------------------------

test('A01 — atualização válida: alterar descrição de relato próprio OPEN retorna 200 e persiste alteração', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const bld = await createFixtureBuilding();

  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    bld.id,
    'Mochila cinza antiga',
    '2026-10-15',
    LostReportStatus.OPEN,
  );

  const res = await patchLostReport(
    report.id,
    { description: 'Mochila cinza com logotipo bordado nova' },
    token,
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.userId, user.id);
  assert.equal(res.body.data.description, 'Mochila cinza com logotipo bordado nova');
  assert.equal(res.body.data.categoryId, cat.id);
  assert.equal(res.body.data.buildingId, bld.id);
  assert.equal(res.body.data.lossDate, '2026-10-15');
  assert.equal(res.body.data.status, 'OPEN');

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Mochila cinza com logotipo bordado nova');
  assert.equal(inDb.status, LostReportStatus.OPEN);
});

test('A02 — atualização parcial: campos omitidos não são alterados', async () => {
  const { user, token } = await createFixtureUser();
  const cat1 = await createFixtureCategory('Cat 1');
  const cat2 = await createFixtureCategory('Cat 2');
  const bld1 = await createFixtureBuilding('Bloco 1');
  const bld2 = await createFixtureBuilding('Bloco 2');

  const report = await createFixtureLostReport(
    user.id,
    cat1.id,
    bld1.id,
    'Descrição inicial de teste',
    '2026-10-10',
    LostReportStatus.OPEN,
  );

  // 1. Apenas categoryId
  const resCat = await patchLostReport(report.id, { categoryId: cat2.id }, token);
  assert.equal(resCat.status, 200);
  assert.equal(resCat.body.data.categoryId, cat2.id);
  assert.equal(resCat.body.data.buildingId, bld1.id);
  assert.equal(resCat.body.data.description, 'Descrição inicial de teste');
  assert.equal(resCat.body.data.lossDate, '2026-10-10');

  // 2. Apenas buildingId
  const resBld = await patchLostReport(report.id, { buildingId: bld2.id }, token);
  assert.equal(resBld.status, 200);
  assert.equal(resBld.body.data.categoryId, cat2.id);
  assert.equal(resBld.body.data.buildingId, bld2.id);

  // 3. Apenas lossDate
  const resDate = await patchLostReport(report.id, { lossDate: '2026-10-25' }, token);
  assert.equal(resDate.status, 200);
  assert.equal(resDate.body.data.lossDate, '2026-10-25');
  assert.equal(resDate.body.data.description, 'Descrição inicial de teste');

  // 4. Múltiplos campos simultâneos
  const resMulti = await patchLostReport(
    report.id,
    { description: 'Descrição atualizada com sucesso', lossDate: '2026-10-28' },
    token,
  );
  assert.equal(resMulti.status, 200);
  assert.equal(resMulti.body.data.description, 'Descrição atualizada com sucesso');
  assert.equal(resMulti.body.data.lossDate, '2026-10-28');
  assert.equal(resMulti.body.data.categoryId, cat2.id);
  assert.equal(resMulti.body.data.buildingId, bld2.id);
});

test('A03 — limpeza de prédio: enviar buildingId como null remove o prédio associado', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const bld = await createFixtureBuilding();

  const report = await createFixtureLostReport(user.id, cat.id, bld.id, 'Chaves de casa', '2026-10-12');

  const res = await patchLostReport(report.id, { buildingId: null }, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.buildingId, null);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.buildingId, null);
});

test('A04 — propriedade estrita: usuário A não pode alterar perda de B (retorna 404 sem vazar dados)', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory();

  const reportB = await createFixtureLostReport(userB.id, cat.id, null, 'Documento de B', '2026-10-14');

  const res = await patchLostReport(reportB.id, { description: 'Tentativa de alteração maliciosa' }, tokenA);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 404);
  assert.ok(res.body.error?.details.includes('Relato de perda não encontrado.'));

  // Registro de B inalterado
  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: reportB.id });
  assert.equal(inDb.description, 'Documento de B');
});

test('A05 — relato inexistente retorna HTTP 404 com resposta idêntica à de relato de terceiro', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@ufc.br');
  const { user: userB } = await createFixtureUser('userB@ufc.br');
  const cat = await createFixtureCategory();

  const reportB = await createFixtureLostReport(userB.id, cat.id, null, 'Item B', '2026-10-14');

  const resInexistente = await patchLostReport(999999, { description: 'Texto qualquer 123' }, tokenA);
  const resTerceiro = await patchLostReport(reportB.id, { description: 'Texto qualquer 123' }, tokenA);

  assert.equal(resInexistente.status, 404);
  assert.equal(resTerceiro.status, 404);
  assert.deepEqual(resInexistente.body, resTerceiro.body);
});

test('A06 — IDs inválidos no path retornam HTTP 400', async () => {
  const { token } = await createFixtureUser();
  const invalidIds = ['0', '-1', 'abc', '12abc', '1.5', 'null', 'undefined', '9007199254740992', '999999999999999999999999999'];

  for (const id of invalidIds) {
    const res = await patchLostReport(id, { description: 'Descricao valida 123' }, token);
    assert.equal(res.status, 400, `esperado 400 para id="${id}", recebido ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
});

test('A07 — autenticação obrigatória: rejeição com 401 para sem token, malformado, expirado ou usuário inexistente', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Mochila escolar', '2026-10-15');

  // Sem token
  const resNoAuth = await patchLostReport(report.id, { description: 'Atualizacao desc' });
  assert.equal(resNoAuth.status, 401);

  // Malformado
  const resBadToken = await patchLostReport(report.id, { description: 'Atualizacao desc' }, 'token-malformado');
  assert.equal(resBadToken.status, 401);

  // Expirado
  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 7200, expiresInSeconds: 60 },
  );
  const resExpired = await patchLostReport(report.id, { description: 'Atualizacao desc' }, expiredToken);
  assert.equal(resExpired.status, 401);

  // Usuário inexistente
  const ghostToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);
  const resGhost = await patchLostReport(report.id, { description: 'Atualizacao desc' }, ghostToken);
  assert.equal(resGhost.status, 401);

  // Banco inalterado
  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Mochila escolar');
});

test('A08 — relato com status RESOLVED não pode ser editado (retorna 409 Conflito)', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    null,
    'Item já resolvido',
    '2026-10-10',
    LostReportStatus.RESOLVED,
  );

  const res = await patchLostReport(report.id, { description: 'Tentando editar resolvido' }, token);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 409);
  assert.ok(res.body.error?.details.includes('Somente relatos com status OPEN podem ser editados.'));

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Item já resolvido');
  assert.equal(inDb.status, LostReportStatus.RESOLVED);
});

test('A09 — relato com status CANCELLED não pode ser editado (retorna 409 Conflito)', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(
    user.id,
    cat.id,
    null,
    'Item já cancelado',
    '2026-10-10',
    LostReportStatus.CANCELLED,
  );

  const res = await patchLostReport(report.id, { description: 'Tentando editar cancelado' }, token);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 409);
  assert.ok(res.body.error?.details.includes('Somente relatos com status OPEN podem ser editados.'));

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Item já cancelado');
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});

test('A10 — payload vazio {} é rejeitado com HTTP 400', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Item original', '2026-10-10');

  const res = await patchLostReport(report.id, {}, token);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.ok(res.body.error?.details.includes('Nenhum campo válido para atualização foi informado.'));
});

test('A11 — campos administrativos (status, userId, id, createdAt) não podem ser alterados', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Descrição válida inicial', '2026-10-10');

  // Envia campos administrativos junto a descrição
  const res = await patchLostReport(
    report.id,
    {
      description: 'Nova descrição autorizada',
      status: 'RESOLVED',
      userId: 9999,
      id: 8888,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    token,
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.userId, user.id);
  assert.equal(res.body.data.status, 'OPEN');
  assert.equal(res.body.data.description, 'Nova descrição autorizada');

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.id, report.id);
  assert.equal(inDb.userId, user.id);
  assert.equal(inDb.status, LostReportStatus.OPEN);
});

test('A12 — validação estrita de campos em erro: rejeição com 400', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Item de teste válido', '2026-10-10');

  // Categoria inexistente
  const resCatInexistente = await patchLostReport(report.id, { categoryId: 9999 }, token);
  assert.equal(resCatInexistente.status, 400);

  // Categoria não positiva
  const resCatZero = await patchLostReport(report.id, { categoryId: 0 }, token);
  assert.equal(resCatZero.status, 400);

  // Prédio inexistente
  const resBldInexistente = await patchLostReport(report.id, { buildingId: 9999 }, token);
  assert.equal(resBldInexistente.status, 400);

  // Descrição curta (< 10 chars)
  const resDescCurta = await patchLostReport(report.id, { description: 'Curto' }, token);
  assert.equal(resDescCurta.status, 400);

  // Descrição longa (> 2000 chars)
  const resDescLonga = await patchLostReport(report.id, { description: 'a'.repeat(2001) }, token);
  assert.equal(resDescLonga.status, 400);

  // Descrição não string
  const resDescNum = await patchLostReport(report.id, { description: 12345678901 }, token);
  assert.equal(resDescNum.status, 400);

  // Data impossível
  const resDataImp = await patchLostReport(report.id, { lossDate: '2026-02-30' }, token);
  assert.equal(resDataImp.status, 400);

  // Data formato incorreto
  const resDataFmt = await patchLostReport(report.id, { lossDate: '10/10/2026' }, token);
  assert.equal(resDataFmt.status, 400);
});

test('A13 — valores nos limites: 10 chars, 2000 chars, data bissexta e ano pequeno válidos', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Item de teste válido', '2026-10-10');

  // Exatamente 10 chars
  const res10 = await patchLostReport(report.id, { description: '1234567890' }, token);
  assert.equal(res10.status, 200);
  assert.equal(res10.body.data.description, '1234567890');

  // Exatamente 2000 chars
  const desc2000 = 'x'.repeat(2000);
  const res2000 = await patchLostReport(report.id, { description: desc2000 }, token);
  assert.equal(res2000.status, 200);
  assert.equal(res2000.body.data.description, desc2000);

  // Ano bissexto 2024-02-29
  const resBissexto = await patchLostReport(report.id, { lossDate: '2024-02-29' }, token);
  assert.equal(resBissexto.status, 200);
  assert.equal(resBissexto.body.data.lossDate, '2024-02-29');

  // Ano pequeno válido 0099-12-31 (sem bug de Date.UTC legacy)
  const resAnoPequeno = await patchLostReport(report.id, { lossDate: '0099-12-31' }, token);
  assert.equal(resAnoPequeno.status, 200);
  assert.equal(resAnoPequeno.body.data.lossDate, '0099-12-31');
});

test('A14 — atomicidade: falhas de validação não causam mutações parciais no banco', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const bld = await createFixtureBuilding();
  const report = await createFixtureLostReport(user.id, cat.id, bld.id, 'Descrição estável original', '2026-10-10');

  const snapBefore = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });

  // Descrição válida mas categoria inexistente
  const res = await patchLostReport(
    report.id,
    { description: 'Nova descricao que nao deve persistir', categoryId: 999999 },
    token,
  );
  assert.equal(res.status, 400);

  const snapAfter = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(snapAfter.description, snapBefore.description);
  assert.equal(snapAfter.categoryId, snapBefore.categoryId);
});

test('A15 — whitelist de retorno: resposta contém estritamente as 8 propriedades públicas', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Objeto perdido teste', '2026-10-10');

  const res = await patchLostReport(report.id, { description: 'Nova descricao teste' }, token);
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

test('A16 — fluxo integrado: PATCH reflete em GET /mine e GET /:id preservando o autor', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Casaco de couro preto', '2026-10-10');

  // 1. PATCH
  const patchRes = await patchLostReport(report.id, { description: 'Casaco de couro preto tam M' }, token);
  assert.equal(patchRes.status, 200);

  // 2. GET /:id
  const getDetail = await fetch(`${baseUrl}/api/lost-reports/${report.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getDetail.status, 200);
  const detailBody = (await getDetail.json()) as ApiBody;
  assert.equal(detailBody.data.description, 'Casaco de couro preto tam M');
  assert.equal(detailBody.data.userId, user.id);

  // 3. GET /mine
  const getMine = await fetch(`${baseUrl}/api/lost-reports/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(getMine.status, 200);
  const mineBody = (await getMine.json()) as ApiBody;
  const found = mineBody.data.find((r: any) => r.id === report.id);
  assert.ok(found);
  assert.equal(found.description, 'Casaco de couro preto tam M');
  assert.equal(found.userId, user.id);
});

test('A17 — concorrência e estado: atualização condicional protege contra transição concorrente', async () => {
  const { user, token } = await createFixtureUser();
  const cat = await createFixtureCategory();
  const report = await createFixtureLostReport(user.id, cat.id, null, 'Caderno de estudos', '2026-10-10');

  // Simula cancelamento do relato imediatamente antes do PATCH
  await AppDataSource.getRepository(LostReport).update({ id: report.id }, { status: LostReportStatus.CANCELLED });

  const res = await patchLostReport(report.id, { description: 'Tentativa concorrente de edicao' }, token);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.description, 'Caderno de estudos');
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
});
