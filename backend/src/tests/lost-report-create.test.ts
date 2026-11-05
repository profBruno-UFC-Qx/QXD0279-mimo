import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-create-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');
const { User } = await import('../models/user.js');
const { Category } = await import('../models/category.js');
const { Building } = await import('../models/building.js');
const { Item } = await import('../models/item.js');
const { ItemPhoto } = await import('../models/item-photo.js');
const { LostReport } = await import('../models/lost-report.js');
const { Notification } = await import('../models/notification.js');
const { UserRole, ItemStatus, LostReportStatus } = await import('../models/enums.js');
const { generateToken } = await import('../shared/token.js');
const { Repository } = await import('typeorm');

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
  await AppDataSource.query('DELETE FROM lost_reports');
  await AppDataSource.query('DELETE FROM item_photos');
  await AppDataSource.query('DELETE FROM items');
  await AppDataSource.query('DELETE FROM categories');
  await AppDataSource.query('DELETE FROM buildings');
  await AppDataSource.query('DELETE FROM users');
});

async function postLostReport(
  payload: unknown,
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/lost-reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function patchLostReport(
  id: number,
  payload: unknown,
  authHeader: string,
): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}/api/lost-reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(payload),
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

async function createFixtureCategory(name = 'Eletrônicos'): Promise<any> {
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

// -----------------------------------------------------------------------------
// CENÁRIOS DE CRIAÇÃO E PERSISTÊNCIA BÁSICA
// -----------------------------------------------------------------------------

test('RED01 — criação válida com todos os campos retorna 201 com envelope ApiResponse<{ lostReport, suggestions }>', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const payload = {
    categoryId: category.id,
    buildingId: building.id,
    description: 'Chaveiro de metal com três chaves e fita azul marinho',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data);
  assert.ok(res.body.data.lostReport);
  assert.equal(typeof res.body.data.lostReport.id, 'number');
  assert.equal(res.body.data.lostReport.userId, user.id);
  assert.equal(res.body.data.lostReport.categoryId, category.id);
  assert.equal(res.body.data.lostReport.buildingId, building.id);
  assert.equal(res.body.data.lostReport.description, payload.description);
  assert.equal(res.body.data.lostReport.status, LostReportStatus.OPEN);
  assert.ok(Array.isArray(res.body.data.suggestions));

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 1, 'exatamente 1 registro deve ser persistido');

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.userId, user.id);
  assert.equal(saved.categoryId, category.id);
  assert.equal(saved.buildingId, building.id);
  assert.equal(saved.description, payload.description);
  assert.equal(saved.status, LostReportStatus.OPEN);
});

test('RED02a — criação válida sem buildingId (campo omitido) retorna 201 e persiste buildingId como null', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Mochila escolar preta sem identificação de prédio',
    lossDate: '2026-10-24',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.lostReport);
  assert.equal(res.body.data.lostReport.buildingId, null);

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.userId, user.id);
  assert.equal(saved.buildingId, null);
});

test('RED02b — criação válida com buildingId explicitamente null retorna 201 e persiste buildingId como null', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    buildingId: null,
    description: 'Guarda-chuva preto esquecido em área descoberta',
    lossDate: '2026-10-25',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.lostReport);
  assert.equal(res.body.data.lostReport.buildingId, null);

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.userId, user.id);
  assert.equal(saved.buildingId, null);
});

// -----------------------------------------------------------------------------
// H03: SUGESTÕES E DUPLICAÇÃO
// -----------------------------------------------------------------------------

test('RED03 — cálculo de sugestões compatíveis (RF12) com fixture controlada e sem duplicatas por fotos', async () => {
  const { user, token } = await createFixtureUser();
  const catA = await createFixtureCategory('Eletrônicos');
  const catB = await createFixtureCategory('Vestuário');
  const bld1 = await createFixtureBuilding('Bloco A');
  const bld2 = await createFixtureBuilding('Bloco B');

  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  // Item A: mesma categoria, AVAILABLE, mesmo prédio, COM 2 FOTOS -> sugerido exatamente UMA vez
  const itemA = await itemRepo.save(
    itemRepo.create({
      title: 'Item A',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AVAILABLE,
      createdBy: user.id,
    }),
  );
  await photoRepo.save(photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a1.jpg' }));
  await photoRepo.save(photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a2.jpg' }));

  // Item B: mesma categoria, ELIGIBLE, mesmo prédio -> sugerido
  const itemB = await itemRepo.save(
    itemRepo.create({
      title: 'Item B',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.ELIGIBLE,
      createdBy: user.id,
    }),
  );

  // Item C: mesma categoria, HANDED_OVER -> NÃO sugerido
  const itemC = await itemRepo.save(
    itemRepo.create({
      title: 'Item C',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.HANDED_OVER,
      createdBy: user.id,
    }),
  );

  // Item D: mesma categoria, SOLD -> NÃO sugerido
  const itemD = await itemRepo.save(
    itemRepo.create({
      title: 'Item D',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.SOLD,
      createdBy: user.id,
    }),
  );

  // Item E: categoria DIFERENTE, AVAILABLE -> NÃO sugerido
  const itemE = await itemRepo.save(
    itemRepo.create({
      title: 'Item E',
      categoryId: catB.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AVAILABLE,
      createdBy: user.id,
    }),
  );

  // Item F: mesma categoria, DONATED -> NÃO sugerido
  const itemF = await itemRepo.save(
    itemRepo.create({
      title: 'Item F',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.DONATED,
      createdBy: user.id,
    }),
  );

  // Item G: mesma categoria, DISCARDED -> NÃO sugerido
  const itemG = await itemRepo.save(
    itemRepo.create({
      title: 'Item G',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.DISCARDED,
      createdBy: user.id,
    }),
  );

  // Item H: mesma categoria, AUCTIONED -> NÃO sugerido
  const itemH = await itemRepo.save(
    itemRepo.create({
      title: 'Item H',
      categoryId: catA.id,
      buildingId: bld1.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AUCTIONED,
      createdBy: user.id,
    }),
  );

  // Item I: mesma categoria, AVAILABLE, prédio DIFERENTE -> sugerido (buildingId do relato é local provável)
  const itemI = await itemRepo.save(
    itemRepo.create({
      title: 'Item I',
      categoryId: catA.id,
      buildingId: bld2.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AVAILABLE,
      createdBy: user.id,
    }),
  );

  const payload = {
    categoryId: catA.id,
    buildingId: bld1.id,
    description: 'Fone de ouvido bluetooth modelo esportivo',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.ok(Array.isArray(res.body.data.suggestions));

  const ids = res.body.data.suggestions.map((s: any) => s.id);
  const expectedIds = [itemA.id, itemB.id, itemI.id];

  assert.equal(ids.length, expectedIds.length, `esperado ${expectedIds.length} sugestões mas recebeu ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, 'a resposta não pode conter sugestões duplicadas');
  assert.deepEqual([...ids].sort((a, b) => a - b), [...expectedIds].sort((a, b) => a - b));

  assert.ok(!ids.includes(itemC.id), 'itemC (HANDED_OVER) não pode ser sugerido');
  assert.ok(!ids.includes(itemD.id), 'itemD (SOLD) não pode ser sugerido');
  assert.ok(!ids.includes(itemE.id), 'itemE (outra categoria) não pode ser sugerido');
  assert.ok(!ids.includes(itemF.id), 'itemF (DONATED) não pode ser sugerido');
  assert.ok(!ids.includes(itemG.id), 'itemG (DISCARDED) não pode ser sugerido');
  assert.ok(!ids.includes(itemH.id), 'itemH (AUCTIONED) não pode ser sugerido');
});

test('RED04 — criação sem itens compatíveis retorna 201 com suggestions vazio []', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Guarda-chuva azul marinho com cabo de madeira',
    lossDate: '2026-10-25',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.ok(Array.isArray(res.body.data.suggestions));
  assert.equal(res.body.data.suggestions.length, 0);
});

// -----------------------------------------------------------------------------
// AUTENTICAÇÃO
// -----------------------------------------------------------------------------

test('RED05a — rejeição com 401 quando cabeçalho Authorization estiver ausente', async () => {
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Carteira de couro marrom com documentos',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload);

  assert.equal(res.status, 401, `esperado HTTP 401 mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0, 'nenhum registro deve ser persistido em falha de autenticação');
});

test('RED05b — rejeição com 401 quando formato de Authorization for inválido', async () => {
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Carteira de couro marrom com documentos',
    lossDate: '2026-10-23',
  };

  for (const badAuth of ['Basic dXNlcjpwYXNz', 'Bearer', 'Token 123456', 'Bearer token extra']) {
    const res = await postLostReport(payload, badAuth);
    assert.equal(res.status, 401, `esperado HTTP 401 para header "${badAuth}" mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

test('RED06 — rejeição com 401 quando token JWT for adulterado ou assinatura inválida', async () => {
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Documento de identidade RG plastificado',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, 'Bearer token-invalido-adulterado.xyz');

  assert.equal(res.status, 401, `esperado HTTP 401 mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

test('RED07a — rejeição com 401 quando token JWT estiver expirado', async () => {
  const { user } = await createFixtureUser();
  const category = await createFixtureCategory();

  const expiredToken = generateToken(
    { sub: String(user.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: Math.floor(Date.now() / 1000) - 200, expiresInSeconds: 100 },
  );

  const payload = {
    categoryId: category.id,
    description: 'Relógio de pulso metálico prateado',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${expiredToken}`);

  assert.equal(res.status, 401, `esperado HTTP 401 para token expirado mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

test('RED07b — rejeição com 401 quando token referenciar usuário inexistente no banco', async () => {
  const category = await createFixtureCategory();
  const tokenInexistente = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);

  const payload = {
    categoryId: category.id,
    description: 'Garrafa térmica metálica prateada',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${tokenInexistente}`);

  assert.equal(res.status, 401, `esperado HTTP 401 mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

// -----------------------------------------------------------------------------
// H04: VALIDAÇÃO INDEPENDENTE DE CATEGORYID
// -----------------------------------------------------------------------------

test('RED08a — validação de categoryId: rejeição com 400 quando ausente ou null', async () => {
  const { token } = await createFixtureUser();

  for (const catVal of [undefined, null]) {
    const payload: any = { description: 'Caderno espiral capa dura verde', lossDate: '2026-10-23' };
    if (catVal !== undefined) payload.categoryId = catVal;

    const res = await postLostReport(payload, `Bearer ${token}`);
    assert.equal(res.status, 400, `esperado 400 para categoryId=${String(catVal)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED08b — validação de categoryId: rejeição com 400 para números não positivos (0 e negativo)', async () => {
  const { token } = await createFixtureUser();

  for (const catVal of [0, -1, -100]) {
    const res = await postLostReport(
      { categoryId: catVal, description: 'Caderno capa dura verde', lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para categoryId=${catVal}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED08c — validação de categoryId: rejeição com 400 para números decimais', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport(
    { categoryId: 1.5, description: 'Caderno capa dura verde', lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED08d — validação de categoryId: rejeição com 400 para strings e valores não numéricos', async () => {
  const { token } = await createFixtureUser();

  for (const catVal of ['abc', '12abc', '1', true, []]) {
    const res = await postLostReport(
      { categoryId: catVal, description: 'Caderno capa dura verde', lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para categoryId=${JSON.stringify(catVal)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED08e — validação de categoryId: rejeição com 400 para inteiro fora do limite seguro', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport(
    { categoryId: 9007199254740992, description: 'Caderno capa dura verde', lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED09 — integridade de categoryId: rejeição com 400 quando ID não existir no banco', async () => {
  const { token } = await createFixtureUser();

  const payload = {
    categoryId: 999999,
    description: 'Estojo escolar com lápis de cor e canetas',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 400, `esperado HTTP 400 mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 400);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

// -----------------------------------------------------------------------------
// H04: VALIDAÇÃO INDEPENDENTE DE BUILDINGID
// -----------------------------------------------------------------------------

test('RED10a — validação de buildingId: rejeição com 400 para 0 e valores negativos', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const bldId of [0, -1, -50]) {
    const res = await postLostReport(
      { categoryId: category.id, buildingId: bldId, description: 'Calculadora Casio preta', lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para buildingId=${bldId}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED10b — validação de buildingId: rejeição com 400 para valores decimais, strings e unsafe integer', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const bldId of [1.5, 'abc', '12abc', '1', 9007199254740992]) {
    const res = await postLostReport(
      { categoryId: category.id, buildingId: bldId, description: 'Calculadora Casio preta', lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para buildingId=${String(bldId)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED11 — integridade de buildingId: rejeição com 400 quando ID informado não existir no banco', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    buildingId: 999999,
    description: 'Calculadora científica Casio preta',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 400, `esperado HTTP 400 mas recebeu ${res.status}`);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 400);

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

// -----------------------------------------------------------------------------
// H04: VALIDAÇÃO INDEPENDENTE DE DESCRIPTION
// -----------------------------------------------------------------------------

test('RED12a — validação de description: rejeição com 400 quando ausente ou null', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const desc of [undefined, null]) {
    const payload: any = { categoryId: category.id, lossDate: '2026-10-23' };
    if (desc !== undefined) payload.description = desc;

    const res = await postLostReport(payload, `Bearer ${token}`);
    assert.equal(res.status, 400, `esperado 400 para description=${String(desc)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED12b — validação de description: rejeição com 400 para tipos não-string (número, array, objeto, booleano)', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const desc of [12345, ['texto'], { text: 'desc' }, true]) {
    const res = await postLostReport(
      { categoryId: category.id, description: desc, lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para description=${JSON.stringify(desc)}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED12c — validação de description: rejeição com 400 para string com menos de 10 caracteres', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const desc of ['', '   ', 'curto', '123456789']) {
    const res = await postLostReport(
      { categoryId: category.id, description: desc, lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para description="${desc}"`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED13 — validação de description: aceita exatamente 10 e 2000 chars, rejeita 2001 chars com 400', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  // Limite exato inferior válido: 10 caracteres
  const desc10 = '1234567890';
  const res10 = await postLostReport(
    { categoryId: category.id, description: desc10, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res10.status, 201, `esperado HTTP 201 para 10 caracteres mas recebeu ${res10.status}`);

  // Limite exato superior válido: 2000 caracteres
  const desc2000 = 'A'.repeat(2000);
  const res2000 = await postLostReport(
    { categoryId: category.id, description: desc2000, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res2000.status, 201, `esperado HTTP 201 para 2000 caracteres mas recebeu ${res2000.status}`);

  // Limite superior excedido: 2001 caracteres -> 400
  const desc2001 = 'A'.repeat(2001);
  const res2001 = await postLostReport(
    { categoryId: category.id, description: desc2001, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res2001.status, 400, `esperado HTTP 400 para 2001 caracteres mas recebeu ${res2001.status}`);
  assert.equal(res2001.body.success, false);
  assert.equal(res2001.body.error?.code, 400);
});

// -----------------------------------------------------------------------------
// H04: NORMALIZAÇÃO DE DESCRIPTION (trim)
// -----------------------------------------------------------------------------

test('RED22a — description só com espaços é rejeitada (10 e 2000 espaços) sem criar relato nem notificação', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const desc of [' '.repeat(10), ' '.repeat(2000)]) {
    const res = await postLostReport(
      { categoryId: category.id, description: desc, lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para ${desc.length} espaços mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }

  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
});

test('RED22b — texto útil de 9 caracteres cercado por espaços é rejeitado com 400', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  for (const desc of [' 123456789 ', '   123456789   ']) {
    const res = await postLostReport(
      { categoryId: category.id, description: desc, lossDate: '2026-10-23' },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `esperado 400 para "${desc}" mas recebeu ${res.status}`);
    assert.equal(res.body.error?.code, 400);
  }

  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
});

test('RED22c — limites contam caracteres úteis após trim: 10 e 2000 aceitos, 2001 rejeitado', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const res10 = await postLostReport(
    { categoryId: category.id, description: ' 1234567890 ', lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res10.status, 201, `esperado 201 para 10 caracteres úteis mas recebeu ${res10.status}`);
  assert.equal(res10.body.data.lostReport.description, '1234567890');

  const desc2000 = 'A'.repeat(2000);
  const res2000 = await postLostReport(
    { categoryId: category.id, description: ` ${desc2000} `, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res2000.status, 201, `esperado 201 para 2000 caracteres úteis mas recebeu ${res2000.status}`);
  assert.equal(res2000.body.data.lostReport.description, desc2000);

  const res2001 = await postLostReport(
    { categoryId: category.id, description: ` ${'A'.repeat(2001)} `, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res2001.status, 400, `esperado 400 para 2001 caracteres úteis mas recebeu ${res2001.status}`);
  assert.equal(res2001.body.error?.code, 400);
});

test('RED22d — espaços nas extremidades são removidos na resposta e na persistência, preservando espaços internos', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const description = '  Guarda-chuva  azul   marinho com cabo de madeira  ';
  const expected = 'Guarda-chuva  azul   marinho com cabo de madeira';

  const res = await postLostReport(
    { categoryId: category.id, description, lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.lostReport.description, expected);

  const saved = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: res.body.data.lostReport.id });
  assert.equal(saved.description, expected);
});

test('RED22e — normalização da criação é coerente com a atualização via PATCH', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const created = await postLostReport(
    { categoryId: category.id, description: 'Descrição inicial válida', lossDate: '2026-10-23' },
    `Bearer ${token}`,
  );
  assert.equal(created.status, 201);

  const res = await patchLostReport(
    created.body.data.lostReport.id,
    { description: '  Descrição atualizada com espaços  ' },
    `Bearer ${token}`,
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.description, 'Descrição atualizada com espaços');

  const saved = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: created.body.data.lostReport.id });
  assert.equal(saved.description, 'Descrição atualizada com espaços');
});

// -----------------------------------------------------------------------------
// H04 & H05: VALIDAÇÃO DE LOSSDATE E DATAS EXTREMAS
// -----------------------------------------------------------------------------

test('RED14a — validação de lossDate: rejeição com 400 para ausente, null, tipo não string ou formato inválido', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const invalidDates = [
    undefined,
    null,
    123456,
    true,
    '',
    'texto-invalido',
    '03/11/2026',
    '2026/11/03',
    '2026-1-3',
    '2026-11-03T10:30:00Z',
  ];

  for (const dateVal of invalidDates) {
    const payload: any = {
      categoryId: category.id,
      description: 'Livro didático de Cálculo Diferencial e Integral',
    };
    if (dateVal !== undefined) {
      payload.lossDate = dateVal;
    }

    const res = await postLostReport(payload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para lossDate=${String(dateVal)} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
});

test('RED14b — validação de lossDate: aceita datas reais contemporâneas e rejeita datas de calendário impossíveis', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  // Datas impossíveis no calendário real -> 400
  const impossibleDates = [
    '2026-02-29', // 2026 não é bissexto
    '2026-02-30', // fevereiro nunca tem 30
    '2026-13-01', // mês 13 inexistente
    '2026-00-10', // mês 00 inexistente
    '2026-11-31', // novembro só tem 30 dias
    '2026-04-31', // abril só tem 30 dias
  ];

  for (const dateStr of impossibleDates) {
    const payload = {
      categoryId: category.id,
      description: 'Livro de Física Geral e Experimental',
      lossDate: dateStr,
    };

    const res = await postLostReport(payload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para data impossível ${dateStr} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 400);
  }

  // Datas válidas no calendário real contemporâneo -> 201
  const validDates = [
    '2026-11-03',
    '2024-02-29', // 2024 é ano bissexto
  ];

  for (const dateStr of validDates) {
    const payload = {
      categoryId: category.id,
      description: 'Livro de Física Geral e Experimental Volume II',
      lossDate: dateStr,
    };

    const res = await postLostReport(payload, `Bearer ${token}`);
    assert.equal(res.status, 201, `esperado HTTP 201 para data válida ${dateStr} mas recebeu ${res.status}`);
  }
});

test('RED14c — validação de lossDate em anos extremos: aceita anos pequenos válidos e rejeita anos não bissextos', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  // 1900 NÃO é bissexto (divisível por 100 mas não por 400) -> 400
  const res1900 = await postLostReport(
    { categoryId: category.id, description: 'Relato com ano 1900 não bissexto', lossDate: '1900-02-29' },
    `Bearer ${token}`,
  );
  assert.equal(res1900.status, 400, '1900-02-29 não é bissexto, deve retornar 400');

  // 2000 É bissexto (divisível por 400) -> 201
  const res2000 = await postLostReport(
    { categoryId: category.id, description: 'Relato com ano 2000 bissexto válido', lossDate: '2000-02-29' },
    `Bearer ${token}`,
  );
  assert.equal(res2000.status, 201, '2000-02-29 é bissexto válido, deve retornar 201');

  // 0100-01-01 é data válida -> 201
  const res0100 = await postLostReport(
    { categoryId: category.id, description: 'Relato com ano 0100 válido', lossDate: '0100-01-01' },
    `Bearer ${token}`,
  );
  assert.equal(res0100.status, 201, '0100-01-01 deve retornar 201');

  // Anos pequenos (< 100): 0001-01-01 e 0099-12-31 são datas ISO válidas com 4 dígitos de ano
  const res0001 = await postLostReport(
    { categoryId: category.id, description: 'Relato com ano 0001 válido', lossDate: '0001-01-01' },
    `Bearer ${token}`,
  );
  assert.equal(res0001.status, 201, `esperado 201 para 0001-01-01 mas recebeu ${res0001.status}`);

  const res0099 = await postLostReport(
    { categoryId: category.id, description: 'Relato com ano 0099 válido', lossDate: '0099-12-31' },
    `Bearer ${token}`,
  );
  assert.equal(res0099.status, 201, `esperado 201 para 0099-12-31 mas recebeu ${res0099.status}`);
});

// -----------------------------------------------------------------------------
// SEGURANÇA E PROPRIEDADE
// -----------------------------------------------------------------------------

test('RED15 — segurança de propriedade: cliente não pode forjar userId para outro usuário no body', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário Legítimo A');
  const { user: userB } = await createFixtureUser('userB@example.com', 'Usuário Vítima B');
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Tablet Samsung Galaxy Tab com capa protetora preta',
    lossDate: '2026-10-23',
    userId: userB.id,
  };

  const res = await postLostReport(payload, `Bearer ${tokenA}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.data.lostReport.userId, userA.id, 'userId retornado deve ser do usuário autenticado A');

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.userId, userA.id, 'userId persistido deve ser obrigatoriamente do usuário autenticado');
  assert.notEqual(saved.userId, userB.id, 'userId não pode ser usurpado pelo cliente');
});

test('RED16 — integridade de status: cliente não pode forjar status inicial diferente de OPEN', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Óculos de grau com armação preta e estojo rígido',
    lossDate: '2026-10-23',
    status: 'RESOLVED',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.data.lostReport.status, LostReportStatus.OPEN, 'status inicial deve ser forçado para OPEN');

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.status, LostReportStatus.OPEN);
});

// -----------------------------------------------------------------------------
// H04: ENTRADAS ADVERSARIAIS
// -----------------------------------------------------------------------------

test('RED17a — entrada adversarial: payload vazio {} rejeitado com 400 sem mutação no banco', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport({}, `Bearer ${token}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED17b — entrada adversarial: payload array [] rejeitado com 400 sem mutação no banco', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport([], `Bearer ${token}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED17c — entrada adversarial: payload sem campos obrigatórios rejeitado com 400 sem mutação no banco', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport({ unknownField: 'test' }, `Bearer ${token}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED17d — entrada adversarial: payload com categoryId nulo rejeitado com 400 sem mutação no banco', async () => {
  const { token } = await createFixtureUser();

  const res = await postLostReport({ categoryId: null }, `Bearer ${token}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 400);
  assert.equal(await AppDataSource.getRepository(LostReport).count(), 0);
});

test('RED18 — criação aceita caracteres Unicode e acentuação na descrição sem corrupção', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const unicodeDesc = 'Mochila com brasão da UFC — esquecida no Bloco 3, contém crachá & fone 🎒🎧';
  const payload = {
    categoryId: category.id,
    description: unicodeDesc,
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);
  assert.equal(res.body.data.lostReport.description, unicodeDesc);

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.description, unicodeDesc);
});

test('RED19 — isolamento entre usuários: relatos de A e B são independentes e mantêm propriedade correta', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('autorA@example.com', 'Autor A');
  const { user: userB, token: tokenB } = await createFixtureUser('autorB@example.com', 'Autor B');
  const category = await createFixtureCategory();

  const resA = await postLostReport(
    { categoryId: category.id, description: 'Relato criado pelo usuário A', lossDate: '2026-10-20' },
    `Bearer ${tokenA}`,
  );
  assert.equal(resA.status, 201);
  assert.equal(resA.body.data.lostReport.userId, userA.id);

  const resB = await postLostReport(
    { categoryId: category.id, description: 'Relato criado pelo usuário B', lossDate: '2026-10-21' },
    `Bearer ${tokenB}`,
  );
  assert.equal(resB.status, 201);
  assert.equal(resB.body.data.lostReport.userId, userB.id);

  const repo = AppDataSource.getRepository(LostReport);
  const savedA = await repo.findOne({ where: { id: resA.body.data.lostReport.id } });
  const savedB = await repo.findOne({ where: { id: resB.body.data.lostReport.id } });

  assert.ok(savedA);
  assert.ok(savedB);
  assert.equal(savedA.userId, userA.id);
  assert.equal(savedB.userId, userB.id);
  assert.notEqual(savedA.id, savedB.id);
});

// -----------------------------------------------------------------------------
// H02: WHITELIST EXATA DAS SUGESTÕES E DO RELATO
// -----------------------------------------------------------------------------

test('RED20 — whitelist exata de resposta: lostReport e items em suggestions expõem apenas campos públicos', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  // Sugestão 1: com 2 fotos
  const itemComFotos = await itemRepo.save(
    itemRepo.create({
      title: 'Item Sugerido com Duas Fotos',
      description: 'Descrição pública detalhada',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AVAILABLE,
      createdBy: user.id,
    }),
  );
  await photoRepo.save(photoRepo.create({ itemId: itemComFotos.id, url: 'https://exemplo.com/f1.jpg' }));
  await photoRepo.save(photoRepo.create({ itemId: itemComFotos.id, url: 'https://exemplo.com/f2.jpg' }));

  // Sugestão 2: sem fotos
  const itemSemFotos = await itemRepo.save(
    itemRepo.create({
      title: 'Item Sugerido sem Foto',
      description: null,
      categoryId: category.id,
      buildingId: building.id,
      foundDate: new Date('2026-10-21'),
      status: ItemStatus.ELIGIBLE,
      createdBy: user.id,
    }),
  );

  const payload = {
    categoryId: category.id,
    buildingId: building.id,
    description: 'Relato de teste para verificação da whitelist exata',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201);
  const lostReport = res.body.data.lostReport;

  // 1. Chaves exatas de lostReport
  const expectedLostReportKeys = ['buildingId', 'categoryId', 'createdAt', 'description', 'id', 'lossDate', 'status', 'userId'];
  assert.deepEqual(Object.keys(lostReport).sort(), expectedLostReportKeys);

  // Ausência de relações aninhadas completas vazadas
  assert.equal((lostReport as any).user, undefined);
  assert.equal((lostReport as any).category, undefined);
  assert.equal((lostReport as any).building, undefined);

  // 2. Chaves exatas de suggestions
  assert.equal(res.body.data.suggestions.length, 2);

  const sugComFotos = res.body.data.suggestions.find((s: any) => s.id === itemComFotos.id);
  const sugSemFotos = res.body.data.suggestions.find((s: any) => s.id === itemSemFotos.id);
  assert.ok(sugComFotos);
  assert.ok(sugSemFotos);

  const expectedSuggestionKeys = [
    'building',
    'buildingId',
    'category',
    'categoryId',
    'description',
    'foundDate',
    'foundLocation',
    'id',
    'photos',
    'status',
    'title',
  ];
  assert.deepEqual(Object.keys(sugComFotos).sort(), expectedSuggestionKeys);
  assert.deepEqual(Object.keys(sugSemFotos).sort(), expectedSuggestionKeys);

  // 3. Chaves exatas de relações aninhadas
  assert.deepEqual(Object.keys(sugComFotos.category).sort(), ['id', 'name']);
  assert.deepEqual(Object.keys(sugComFotos.building).sort(), ['id', 'name']);

  // 4. Chaves exatas de fotos
  assert.equal(sugComFotos.photos.length, 2);
  assert.deepEqual(Object.keys(sugComFotos.photos[0]).sort(), ['id', 'url']);
  assert.deepEqual(Object.keys(sugComFotos.photos[1]).sort(), ['id', 'url']);
  assert.equal(sugSemFotos.photos.length, 0);

  // 5. Blindagem contra exposição de dados sensíveis ou administrativos
  for (const sug of [sugComFotos, sugSemFotos]) {
    assert.equal(sug.createdBy, undefined);
    assert.equal(sug.createdByUser, undefined);
    assert.equal(sug.passwordHash, undefined);
    assert.equal(sug.password_hash, undefined);
    assert.equal(sug.handovers, undefined);
    assert.equal(sug.dispositions, undefined);
    assert.equal(sug.plannedDestination, undefined);
    assert.equal(sug.pickupPoint, undefined);
    assert.equal(sug.serviceHours, undefined);
  }
});

// -----------------------------------------------------------------------------
// H01: COMMIT E ROLLBACK TRANSACIONAL REAL
// -----------------------------------------------------------------------------

test('RED21a — commit transacional em sucesso: criação válida persiste exatamente 1 relato e calcula sugestões no mesmo commit', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const initialCount = await AppDataSource.getRepository(LostReport).count();
  assert.equal(initialCount, 0);

  const payload = {
    categoryId: category.id,
    description: 'Mochila com pertences para teste de commit transacional',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.lostReport.id);

  const finalCount = await AppDataSource.getRepository(LostReport).count();
  assert.equal(finalCount, 1, 'exatamente 1 relato deve ser persistido em sucesso');

  const saved = await AppDataSource.getRepository(LostReport).findOne({
    where: { id: res.body.data.lostReport.id },
  });
  assert.ok(saved);
  assert.equal(saved.userId, user.id);
});

test('RED21b — rollback transacional real: falha controlada na fase de sugestões após inserção reverte a criação da perda', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const initialCount = await AppDataSource.getRepository(LostReport).count();
  assert.equal(initialCount, 0);

  const originalCreateQueryBuilder = Repository.prototype.createQueryBuilder;
  let suggestionPhaseReached = false;

  // Interceptamos a consulta de sugestões que ocorre obrigatoriamente APÓS a inserção da perda
  Repository.prototype.createQueryBuilder = function (this: any, ...args: any[]) {
    const alias = args[0];
    if (alias === 'item') {
      suggestionPhaseReached = true;
      throw new Error('Falha simulada na consulta de sugestões pós-inserção');
    }
    return originalCreateQueryBuilder.apply(this, args as any);
  };

  try {
    const payload = {
      categoryId: category.id,
      description: 'Mochila para teste de falha real pós-inserção',
      lossDate: '2026-10-23',
    };

    const res = await postLostReport(payload, `Bearer ${token}`);

    // Falha interna capturada pelo errorHandler compartilhado resulta em HTTP 500
    assert.equal(res.status, 500, `esperado HTTP 500 em falha interna mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 500);
    assert.equal(suggestionPhaseReached, true, 'a fase de sugestões DEVE ter sido alcançada após a inserção');

    // Comprovamos que NENHUM registro de lost_reports permaneceu persistido no banco
    const finalCount = await AppDataSource.getRepository(LostReport).count();
    assert.equal(finalCount, 0, 'o relato inserido na transação DEVE ter sofrido rollback completo');

    const saved = await AppDataSource.getRepository(LostReport).findOne({
      where: { description: payload.description },
    });
    assert.equal(saved, null, 'relato não pode existir no banco após rollback');
  } finally {
    Repository.prototype.createQueryBuilder = originalCreateQueryBuilder;
  }
});
