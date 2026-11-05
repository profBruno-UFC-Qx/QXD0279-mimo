import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-item-detail-test-'));
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
const { UserRole, ItemStatus } = await import('../models/enums.js');
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
  await AppDataSource.query('DELETE FROM item_photos');
  await AppDataSource.query('DELETE FROM items');
  await AppDataSource.query('DELETE FROM categories');
  await AppDataSource.query('DELETE FROM buildings');
  await AppDataSource.query('DELETE FROM users');
});

async function getItem(id: unknown, authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const url = `${baseUrl}/api/items/${id}`;
  const res = await fetch(url, { method: 'GET', headers });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function createFixtures() {
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.save(
    userRepo.create({
      name: 'Admin Teste Detalhes',
      email: 'admin.detalhes@example.com',
      passwordHash: 'scrypt:salt:dummyhash',
      role: UserRole.ADMIN,
    }),
  );

  const catRepo = AppDataSource.getRepository(Category);
  const catEletronicos = await catRepo.save(catRepo.create({ name: 'Eletrônicos' }));
  const catDocumentos = await catRepo.save(catRepo.create({ name: 'Documentos' }));

  const bldRepo = AppDataSource.getRepository(Building);
  const bldCentral = await bldRepo.save(
    bldRepo.create({
      name: 'Campus Central',
      address: 'Rua Principal, 100',
      pickupPoint: 'Recepção Bloco A - Balcão 1',
      serviceHours: 'Segunda a sexta, das 8h às 18h',
    }),
  );
  const bldBiblioteca = await bldRepo.save(
    bldRepo.create({
      name: 'Biblioteca Setorial',
      address: 'Rua dos Livros, 50',
      pickupPoint: 'Balcão de Empréstimos 2º Andar',
      serviceHours: 'Segunda a sexta, das 7h às 21h',
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  const itemDisponivel = await itemRepo.save(
    itemRepo.create({
      title: 'Notebook Dell Latitude 7490',
      description: 'Notebook preto com adesivo na tampa, carregador na bolsa',
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: 'Laboratório de Informática 3',
      foundDate: '2026-11-01',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  const photo1 = await photoRepo.save(
    photoRepo.create({ itemId: itemDisponivel.id, url: 'https://exemplo.com/fotos/dell1.jpg' }),
  );
  const photo2 = await photoRepo.save(
    photoRepo.create({ itemId: itemDisponivel.id, url: 'https://exemplo.com/fotos/dell2.jpg' }),
  );

  const itemElegivel = await itemRepo.save(
    itemRepo.create({
      title: 'Carteira de Couro Marrom',
      description: 'Contém documentos pessoais em nome de Maria',
      categoryId: catDocumentos.id,
      buildingId: bldBiblioteca.id,
      foundLocation: 'Mesa de estudos 5',
      foundDate: '2026-10-15',
      status: ItemStatus.ELIGIBLE,
      createdBy: admin.id,
    }),
  );

  return {
    admin,
    catEletronicos,
    catDocumentos,
    bldCentral,
    bldBiblioteca,
    itemDisponivel,
    photo1,
    photo2,
    itemElegivel,
  };
}

// -----------------------------------------------------------------------------
// RED01 — Detalhes de item existente no contrato oficial { item, photos, building }
// -----------------------------------------------------------------------------
test('RED01 — GET /api/items/:id com item AVAILABLE retorna 200 e estrutura { item, photos, building }', async () => {
  const { itemDisponivel, catEletronicos, bldCentral } = await createFixtures();

  const res = await getItem(itemDisponivel.id);
  assert.equal(res.status, 200, 'Deve retornar HTTP 200 para item existente');
  assert.equal(res.body.success, true);
  assert.ok(res.body.data, 'Envelope data não pode ser nulo');

  assert.deepEqual(Object.keys(res.body.data).sort(), ['building', 'item', 'photos']);

  const item = res.body.data.item;
  assert.ok(item, 'data.item deve existir');
  assert.equal(item.id, itemDisponivel.id);
  assert.equal(item.title, 'Notebook Dell Latitude 7490');
  assert.equal(item.description, 'Notebook preto com adesivo na tampa, carregador na bolsa');
  assert.equal(item.foundLocation, 'Laboratório de Informática 3');
  assert.equal(item.foundDate, '2026-11-01');
  assert.equal(item.status, ItemStatus.AVAILABLE);
  assert.equal(item.categoryId, catEletronicos.id);
  assert.equal(item.buildingId, bldCentral.id);

  // Categoria permanece na representação pública do item
  assert.ok(item.category, 'Deve incluir categoria');
  assert.equal(item.category.id, catEletronicos.id);
  assert.equal(item.category.name, 'Eletrônicos');

  // Prédio separado, com ponto de retirada e horário (RF03)
  const building = res.body.data.building;
  assert.ok(building, 'data.building deve existir');
  assert.equal(building.id, bldCentral.id);
  assert.equal(building.name, 'Campus Central');
  assert.equal(building.pickupPoint, 'Recepção Bloco A - Balcão 1');
  assert.equal(building.serviceHours, 'Segunda a sexta, das 8h às 18h');

  // Fotos separadas
  const photos = res.body.data.photos;
  assert.ok(Array.isArray(photos), 'data.photos deve ser lista');
  assert.equal(photos.length, 2);
  const urls = photos.map((p: any) => p.url).sort();
  assert.deepEqual(urls, ['https://exemplo.com/fotos/dell1.jpg', 'https://exemplo.com/fotos/dell2.jpg']);
});

test('RED01b — item ELIGIBLE retorna a mesma estrutura contratual', async () => {
  const { itemElegivel, catDocumentos, bldBiblioteca } = await createFixtures();

  const res = await getItem(itemElegivel.id);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data).sort(), ['building', 'item', 'photos']);
  assert.equal(res.body.data.item.id, itemElegivel.id);
  assert.equal(res.body.data.item.status, ItemStatus.ELIGIBLE);
  assert.equal(res.body.data.item.category.id, catDocumentos.id);
  assert.equal(res.body.data.building.id, bldBiblioteca.id);
  assert.deepEqual(res.body.data.photos, []);
});

// -----------------------------------------------------------------------------
// RED02 — Item inexistente
// -----------------------------------------------------------------------------
test('RED02 — GET /api/items/:id com ID numérico inexistente retorna 404 e envelope de erro padrão', async () => {
  await createFixtures();

  const nonExistentId = 999999;
  const res = await getItem(nonExistentId);
  assert.equal(res.status, 404, 'Item inexistente deve retornar HTTP 404');
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.ok(res.body.error, 'Deve conter objeto error');
  assert.equal(res.body.error?.code, 404);
  assert.equal(res.body.error?.details, 'Item não encontrado.');
});

// -----------------------------------------------------------------------------
// RED03 — Identificadores inválidos desmembrados (um test por valor)
// -----------------------------------------------------------------------------
const invalidIds = [
  '0',
  '-1',
  '-99',
  'abc',
  'item1',
  '12abc',
  '1.5',
  'null',
  'undefined',
  '9007199254740992', // Acima de MAX_SAFE_INTEGER
  '999999999999999999999999999999', // Inteiro extremo
];

for (const id of invalidIds) {
  test(`RED03 — identificador inválido '${id}' retorna 400 sem consulta ao banco`, async () => {
    await createFixtures();
    const res = await getItem(id);
    assert.equal(
      res.status,
      400,
      `ID '${id}' deve ser rejeitado com HTTP 400, observado ${res.status}`,
    );
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  });
}

// -----------------------------------------------------------------------------
// RED04 — Acesso público (sem token, com token válido real e com token inválido)
// -----------------------------------------------------------------------------
test('RED04 — GET /api/items/:id é público: responde 200 e dados idênticos sem auth, com token válido ou com token malformado', async () => {
  const { itemDisponivel, admin } = await createFixtures();
  const validToken = generateToken({ sub: String(admin.id) });

  // 1. Sem header de autorização
  const resAnon = await getItem(itemDisponivel.id);
  assert.equal(resAnon.status, 200, 'Acesso anônimo deve responder 200');

  // 2. Com token JWT real válido
  const resValidToken = await getItem(itemDisponivel.id, `Bearer ${validToken}`);
  assert.equal(resValidToken.status, 200, 'Acesso autenticado com token válido deve responder 200');

  // 3. Com token inválido / expirado / malformado (não deve barrar rota pública)
  const resBadToken = await getItem(itemDisponivel.id, 'Bearer token-invalido-qualquer');
  assert.equal(resBadToken.status, 200, 'Token inválido não deve bloquear rota pública');

  // As três respostas devem retornar exatamente os mesmos dados
  assert.deepEqual(resAnon.body.data, resValidToken.body.data);
  assert.deepEqual(resAnon.body.data, resBadToken.body.data);
});

// -----------------------------------------------------------------------------
// RED05 — Categoria e prédio isolados por item
// -----------------------------------------------------------------------------
test('RED05 — GET /api/items/:id retorna exclusivamente o prédio e categoria do item solicitado', async () => {
  const { itemDisponivel, bldCentral, catEletronicos } = await createFixtures();

  const res = await getItem(itemDisponivel.id);
  assert.equal(res.status, 200);

  const item = res.body.data.item;
  assert.equal(item.category.name, catEletronicos.name);
  assert.notEqual(item.category.name, 'Documentos');

  assert.equal(res.body.data.building.name, bldCentral.name);
  assert.equal(res.body.data.building.pickupPoint, bldCentral.pickupPoint);
  assert.notEqual(res.body.data.building.name, 'Biblioteca Setorial');
});

// -----------------------------------------------------------------------------
// RED06 — Fotos de múltiplos itens (Item A com 3, Item B com 2, Item C com 0)
// -----------------------------------------------------------------------------
test('RED06 — GET /api/items/:id isola fotos entre itens distintos e retorna array vazio quando não há fotos', async () => {
  const { admin, catDocumentos, bldBiblioteca } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  const itemA = await itemRepo.save(
    itemRepo.create({
      title: 'Item A Com Tres Fotos',
      categoryId: catDocumentos.id,
      buildingId: bldBiblioteca.id,
      foundLocation: 'Setor A',
      foundDate: '2026-11-01',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  const pA1 = await photoRepo.save(photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a1.jpg' }));
  const pA2 = await photoRepo.save(photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a2.jpg' }));
  const pA3 = await photoRepo.save(photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a3.jpg' }));

  const itemB = await itemRepo.save(
    itemRepo.create({
      title: 'Item B Com Duas Fotos',
      categoryId: catDocumentos.id,
      buildingId: bldBiblioteca.id,
      foundLocation: 'Setor B',
      foundDate: '2026-11-02',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  const pB1 = await photoRepo.save(photoRepo.create({ itemId: itemB.id, url: 'https://exemplo.com/b1.jpg' }));
  const pB2 = await photoRepo.save(photoRepo.create({ itemId: itemB.id, url: 'https://exemplo.com/b2.jpg' }));

  const itemC = await itemRepo.save(
    itemRepo.create({
      title: 'Item C Sem Fotos',
      categoryId: catDocumentos.id,
      buildingId: bldBiblioteca.id,
      foundLocation: 'Setor C',
      foundDate: '2026-11-03',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  // Consulta Item A -> exatamente 3 fotos de A
  const resA = await getItem(itemA.id);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.data.photos.length, 3);
  const idsA = resA.body.data.photos.map((p: any) => p.id).sort();
  assert.deepEqual(idsA, [pA1.id, pA2.id, pA3.id].sort());

  // Consulta Item B -> exatamente 2 fotos de B
  const resB = await getItem(itemB.id);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.data.photos.length, 2);
  const idsB = resB.body.data.photos.map((p: any) => p.id).sort();
  assert.deepEqual(idsB, [pB1.id, pB2.id].sort());

  // Consulta Item C -> array vazio
  const resC = await getItem(itemC.id);
  assert.equal(resC.status, 200);
  assert.ok(Array.isArray(resC.body.data.photos));
  assert.equal(resC.body.data.photos.length, 0);
});

// -----------------------------------------------------------------------------
// RED07 — Visibilidade por status desmembrada (um test por estado)
// -----------------------------------------------------------------------------
const statuses = [
  { status: ItemStatus.AVAILABLE, isPublic: true },
  { status: ItemStatus.ELIGIBLE, isPublic: true },
  { status: ItemStatus.HANDED_OVER, isPublic: false },
  { status: ItemStatus.SOLD, isPublic: false },
  { status: ItemStatus.AUCTIONED, isPublic: false },
  { status: ItemStatus.DONATED, isPublic: false },
  { status: ItemStatus.DISCARDED, isPublic: false },
];

for (const s of statuses) {
  test(`RED07 — status '${s.status}' responde HTTP ${s.isPublic ? 200 : 404}`, async () => {
    const { admin, catEletronicos, bldCentral } = await createFixtures();
    const itemRepo = AppDataSource.getRepository(Item);

    const item = await itemRepo.save(
      itemRepo.create({
        title: `Item Status ${s.status}`,
        description: `Teste de visibilidade para status ${s.status}`,
        categoryId: catEletronicos.id,
        buildingId: bldCentral.id,
        foundLocation: 'Sala X',
        foundDate: '2026-11-01',
        status: s.status,
        createdBy: admin.id,
      }),
    );

    const res = await getItem(item.id);
    if (s.isPublic) {
      assert.equal(
        res.status,
        200,
        `Status ${s.status} é público e deve responder HTTP 200, observado ${res.status}`,
      );
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.item.status, s.status);
    } else {
      assert.equal(
        res.status,
        404,
        `Status ${s.status} NÃO é público e deve responder HTTP 404 uniforme para evitar enumeração, observado ${res.status}`,
      );
      assert.equal(res.body.success, false);
      assert.equal(res.body.data, null);
      assert.equal(res.body.error?.code, 404);
      assert.equal(res.body.error?.details, 'Item não encontrado.');
    }
  });
}

// -----------------------------------------------------------------------------
// RED08 — Whitelist exata e proteção contra vazamento administrativo
// -----------------------------------------------------------------------------
test('RED08 — GET /api/items/:id valida whitelist exata de chaves e nunca expõe campos administrativos', async () => {
  const { itemDisponivel } = await createFixtures();

  const res = await getItem(itemDisponivel.id);
  assert.equal(res.status, 200);

  const { item, photos, building } = res.body.data;

  // 1. Whitelist exata do envelope de detalhe
  assert.deepEqual(Object.keys(res.body.data).sort(), ['building', 'item', 'photos']);

  // 2. Whitelist exata do item
  assert.deepEqual(Object.keys(item).sort(), [
    'buildingId',
    'category',
    'categoryId',
    'description',
    'foundDate',
    'foundLocation',
    'id',
    'status',
    'title',
  ]);

  // 3. Whitelist exata da categoria
  assert.deepEqual(Object.keys(item.category).sort(), ['id', 'name']);

  // 4. Whitelist exata do prédio: RF03 autoriza id, name, pickupPoint e serviceHours
  assert.deepEqual(Object.keys(building).sort(), [
    'id',
    'name',
    'pickupPoint',
    'serviceHours',
  ]);

  // 5. Whitelist exata de cada foto
  assert.ok(photos.length > 0);
  for (const photo of photos) {
    assert.deepEqual(Object.keys(photo).sort(), ['id', 'url']);
  }

  // 6. Não existem propriedades duplicadas fora de data.item
  for (const duplicated of ['id', 'title', 'category', 'status', 'description', 'foundDate']) {
    assert.equal((res.body.data as any)[duplicated], undefined, `'${duplicated}' não deve duplicar fora de data.item`);
  }
  assert.equal((item as any).photos, undefined, "'photos' não deve duplicar dentro de data.item");
  assert.equal((item as any).building, undefined, "'building' não deve duplicar dentro de data.item");

  // 7. Proibição expressa de dados sensíveis e administrativos
  const forbidden = [
    'createdBy',
    'createdByUser',
    'passwordHash',
    'password_hash',
    'handovers',
    'dispositions',
    'plannedDestination',
    'createdAt',
    'updatedAt',
    'address', // Endereço é exclusivo de GET /api/buildings (RF04)
  ];

  for (const f of forbidden) {
    assert.equal((item as any)[f], undefined, `Campo proibido '${f}' vazou no item`);
    assert.equal((building as any)[f], undefined, `Campo proibido '${f}' vazou no prédio`);
    assert.equal((item.category as any)[f], undefined, `Campo proibido '${f}' vazou na categoria`);
  }
});

// -----------------------------------------------------------------------------
// RED09 — Campos opcionais e valores nulos
// -----------------------------------------------------------------------------
test('RED09 — GET /api/items/:id suporta campos opcionais nulos (description e foundLocation) sem falhas', async () => {
  const { admin, catEletronicos, bldCentral } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);

  const itemSemDesc = await itemRepo.save(
    itemRepo.create({
      title: 'Item Sem Descricao e Sem Local',
      description: null,
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: null,
      foundDate: '2026-11-03',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  const res = await getItem(itemSemDesc.id);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.item.description, null);
  assert.equal(res.body.data.item.foundLocation, null);
  assert.equal(res.body.data.item.foundDate, '2026-11-03');
});

// -----------------------------------------------------------------------------
// RED10 — Consulta estritamente read-only
// -----------------------------------------------------------------------------
test('RED10 — GET /api/items/:id é estritamente idempotente e não muta estado no banco', async () => {
  const { itemDisponivel } = await createFixtures();

  const countBefore = (await AppDataSource.query('SELECT COUNT(*) as c FROM items'))[0].c;
  const snapshotBefore = await AppDataSource.query('SELECT * FROM items WHERE id = ?', [itemDisponivel.id]);

  const resValido = await getItem(itemDisponivel.id);
  assert.equal(resValido.status, 200, 'Consulta válida deve responder 200');

  const resInexistente = await getItem(999999);
  assert.equal(resInexistente.status, 404, 'Consulta inexistente deve responder 404');

  const resInvalido = await getItem('invalido');
  assert.equal(resInvalido.status, 400, 'Consulta inválida deve responder 400');

  const countAfter = (await AppDataSource.query('SELECT COUNT(*) as c FROM items'))[0].c;
  const snapshotAfter = await AppDataSource.query('SELECT * FROM items WHERE id = ?', [itemDisponivel.id]);

  assert.equal(countAfter, countBefore, 'Contagem de itens deve permanecer idêntica');
  assert.deepEqual(snapshotAfter, snapshotBefore, 'Nenhum registro de item deve ser mutado');
});

// -----------------------------------------------------------------------------
// RED11 — Consistência do item solicitado
// -----------------------------------------------------------------------------
test('RED11 — GET /api/items/:id não sofre confusão entre registros com dados similares', async () => {
  const { admin, catEletronicos, bldCentral } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);

  const itemA = await itemRepo.save(
    itemRepo.create({
      title: 'Celular Smartphone A',
      description: 'Mesma descrição',
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: 'Sala 1',
      foundDate: '2026-11-01',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  const itemB = await itemRepo.save(
    itemRepo.create({
      title: 'Celular Smartphone B',
      description: 'Mesma descrição',
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: 'Sala 2',
      foundDate: '2026-11-02',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  const resA = await getItem(itemA.id);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.data.item.id, itemA.id);
  assert.equal(resA.body.data.item.title, 'Celular Smartphone A');

  const resB = await getItem(itemB.id);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.data.item.id, itemB.id);
  assert.equal(resB.body.data.item.title, 'Celular Smartphone B');
});

test('RED11b — o DTO retornado pelo serviço é consistente com a resposta HTTP', async () => {
  const { getPublicItemDetails } = await import('../services/item.service.js');
  const { itemDisponivel } = await createFixtures();

  const serviceDto = await getPublicItemDetails(itemDisponivel.id);
  const res = await getItem(itemDisponivel.id);

  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(serviceDto)), res.body.data);
});

// -----------------------------------------------------------------------------
// RED12 — Item removido previamente à leitura retorna 404
// -----------------------------------------------------------------------------
test('RED12 — item removido do banco previamente à leitura retorna HTTP 404', async () => {
  const { itemDisponivel } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);

  // Remove o item fisicamente do banco antes da requisição
  await itemRepo.delete(itemDisponivel.id);

  const res = await getItem(itemDisponivel.id);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 404);
  assert.equal(res.body.error?.details, 'Item não encontrado.');
});
