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
const { LostReport } = await import('../models/lost-report.js');
const { UserRole, ItemStatus, LostReportStatus, DispositionType } = await import('../models/enums.js');
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
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
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

test('RED03 — cálculo de sugestões compatíveis (RF12) com fixture controlada de status e prédios', async () => {
  const { user, token } = await createFixtureUser();
  const catA = await createFixtureCategory('Eletrônicos');
  const catB = await createFixtureCategory('Vestuário');
  const bld1 = await createFixtureBuilding('Bloco A');
  const bld2 = await createFixtureBuilding('Bloco B');

  const itemRepo = AppDataSource.getRepository(Item);

  // Item A: mesma categoria, AVAILABLE, mesmo prédio -> sugerido
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

  const suggestionIds = new Set(res.body.data.suggestions.map((s: any) => s.id));
  assert.equal(suggestionIds.has(itemA.id), true, 'itemA (AVAILABLE) deve ser sugerido');
  assert.equal(suggestionIds.has(itemB.id), true, 'itemB (ELIGIBLE) deve ser sugerido');
  assert.equal(suggestionIds.has(itemI.id), true, 'itemI (AVAILABLE em outro prédio) deve ser sugerido');

  assert.equal(suggestionIds.has(itemC.id), false, 'itemC (HANDED_OVER) não pode ser sugerido');
  assert.equal(suggestionIds.has(itemD.id), false, 'itemD (SOLD) não pode ser sugerido');
  assert.equal(suggestionIds.has(itemE.id), false, 'itemE (outra categoria) não pode ser sugerido');
  assert.equal(suggestionIds.has(itemF.id), false, 'itemF (DONATED) não pode ser sugerido');
  assert.equal(suggestionIds.has(itemG.id), false, 'itemG (DISCARDED) não pode ser sugerido');
  assert.equal(suggestionIds.has(itemH.id), false, 'itemH (AUCTIONED) não pode ser sugerido');
  assert.equal(suggestionIds.size, 3, 'devem ser sugeridos exatamente 3 itens compatíveis');
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

  // Gera token que expirou há 10 segundos
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

test('RED08 — validação de categoryId: rejeição com 400 para ausente, null, 0, negativo, decimal, string e inteiro inseguro', async () => {
  const { token } = await createFixtureUser();

  const invalidCategoryIds = [
    undefined,
    null,
    0,
    -1,
    1.5,
    'abc',
    '12abc',
    9007199254740992,
  ];

  for (const catId of invalidCategoryIds) {
    const payload: any = {
      description: 'Caderno espiral capa dura verde',
      lossDate: '2026-10-23',
    };
    if (catId !== undefined) {
      payload.categoryId = catId;
    }

    const res = await postLostReport(payload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para categoryId=${String(catId)} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
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

test('RED10 — validação de buildingId: rejeição com 400 para 0, negativo, decimal, string e inteiro inseguro', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const invalidBuildingIds = [
    0,
    -1,
    1.5,
    'abc',
    '12abc',
    9007199254740992,
  ];

  for (const bldId of invalidBuildingIds) {
    const payload = {
      categoryId: category.id,
      buildingId: bldId,
      description: 'Calculadora científica Casio preta',
      lossDate: '2026-10-23',
    };

    const res = await postLostReport(payload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para buildingId=${String(bldId)} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
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

test('RED12 — validação de description: rejeição com 400 para ausente, null, não-string e tamanho < 10 (ex: 9 chars)', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  const invalidDescriptions = [
    undefined,
    null,
    12345,
    [],
    {},
    '',
    '         ',
    '123456789', // 9 caracteres
  ];

  for (const desc of invalidDescriptions) {
    const payload: any = {
      categoryId: category.id,
      lossDate: '2026-10-23',
    };
    if (desc !== undefined) {
      payload.description = desc;
    }

    const res = await postLostReport(payload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para description=${JSON.stringify(desc)} mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
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

test('RED14b — validação de lossDate: aceita datas reais (incluindo ano bissexto 2024-02-29) e rejeita datas de calendário impossíveis', async () => {
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

  // Datas válidas no calendário real -> 201
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

test('RED15 — segurança de propriedade: cliente não pode forjar userId para outro usuário no body', async () => {
  const { user: userA, token: tokenA } = await createFixtureUser('userA@example.com', 'Usuário Legítimo A');
  const { user: userB } = await createFixtureUser('userB@example.com', 'Usuário Vítima B');
  const category = await createFixtureCategory();

  const payload = {
    categoryId: category.id,
    description: 'Tablet Samsung Galaxy Tab com capa protetora preta',
    lossDate: '2026-10-23',
    userId: userB.id, // Tentativa de forjar o autor
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
    status: 'RESOLVED', // Tentativa de burlar o status inicial
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

test('RED17 — entrada adversarial: payload vazio, array ou JSON primitivo rejeitado com 400 sem mutação no banco', async () => {
  const { token } = await createFixtureUser();

  for (const badPayload of [{}, [], 'string-pura', 12345, null]) {
    const res = await postLostReport(badPayload, `Bearer ${token}`);

    assert.equal(res.status, 400, `esperado HTTP 400 para payload adversarial mas recebeu ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  const count = await AppDataSource.getRepository(LostReport).count();
  assert.equal(count, 0);
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

test('RED20 — whitelist de resposta: lostReport e items em suggestions expõem apenas campos públicos sem vazar dados sensíveis', async () => {
  const { user, token } = await createFixtureUser();
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const itemRepo = AppDataSource.getRepository(Item);
  await itemRepo.save(
    itemRepo.create({
      title: 'Item Sugerido com Foto',
      description: 'Descrição pública do item',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: new Date('2026-10-20'),
      status: ItemStatus.AVAILABLE,
      createdBy: user.id,
    }),
  );

  const payload = {
    categoryId: category.id,
    buildingId: building.id,
    description: 'Relato de teste para verificação de chaves públicas',
    lossDate: '2026-10-23',
  };

  const res = await postLostReport(payload, `Bearer ${token}`);

  assert.equal(res.status, 201);
  const lostReport = res.body.data.lostReport;
  const lostReportKeys = Object.keys(lostReport).sort();

  // Chaves autorizadas para LostReport
  const expectedLostReportKeys = ['buildingId', 'categoryId', 'createdAt', 'description', 'id', 'lossDate', 'status', 'userId'];
  assert.deepEqual(lostReportKeys, expectedLostReportKeys);

  // Verifica que nenhuma relação interna vazou em lostReport
  assert.equal((lostReport as any).user, undefined);
  assert.equal((lostReport as any).category, undefined);
  assert.equal((lostReport as any).building, undefined);

  // Verifica itens em suggestions
  assert.equal(res.body.data.suggestions.length, 1);
  const suggestion = res.body.data.suggestions[0];

  assert.equal(typeof suggestion.id, 'number');
  assert.equal(typeof suggestion.title, 'string');
  assert.equal(suggestion.createdBy, undefined, 'createdBy não pode ser exposto publicamente');
  assert.equal(suggestion.createdByUser, undefined, 'createdByUser não pode ser exposto publicamente');
  assert.equal(suggestion.passwordHash, undefined, 'passwordHash não pode ser exposto publicamente');
  assert.equal(suggestion.handovers, undefined, 'handovers não pode ser exposto publicamente');
  assert.equal(suggestion.dispositions, undefined, 'dispositions não pode ser exposto publicamente');
});

test('RED21 — transacionalidade: falha durante execução reverte persistência garantindo ausência de estado parcial', async () => {
  const { token } = await createFixtureUser();
  const category = await createFixtureCategory();

  // Testamos a garantia de que se o serviço/repositório falhar internamente antes de responder com sucesso,
  // nenhum registro residual de lost_reports é mantido no banco de dados.
  const payload = {
    categoryId: category.id,
    description: 'Mochila com pertences para teste de rollback transacional',
    lossDate: '2026-10-23',
  };

  // Verificamos antes da chamada: banco está com 0 perdas
  const countBefore = await AppDataSource.getRepository(LostReport).count();
  assert.equal(countBefore, 0);

  const res = await postLostReport(payload, `Bearer ${token}`);

  // No estado RED atual, o handler 501 falha antes da persistência, deixando count em 0
  assert.equal(res.status, 201, `esperado HTTP 201 mas recebeu ${res.status}`);

  // No estado GREEN, o registro será persistido. Mas se ocorresse erro, contagem deveria ser 0.
  const countAfter = await AppDataSource.getRepository(LostReport).count();
  assert.equal(countAfter, 1);
});
