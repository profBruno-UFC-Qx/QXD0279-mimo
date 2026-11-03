import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-item-list-test-'));
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

async function getItems(query = '', authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const url = query ? `${baseUrl}/api/items?${query}` : `${baseUrl}/api/items`;
  const res = await fetch(url, { method: 'GET', headers });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function createFixtures() {
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.save(
    userRepo.create({
      name: 'Admin Teste',
      email: 'admin@example.com',
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
      pickupPoint: 'Recepção Bloco A',
      serviceHours: 'Segunda a sexta, das 8h às 18h',
    }),
  );
  const bldBiblioteca = await bldRepo.save(
    bldRepo.create({
      name: 'Biblioteca Setorial',
      address: 'Rua dos Livros, 50',
      pickupPoint: 'Balcão de Empréstimos',
      serviceHours: 'Segunda a sexta, das 7h às 21h',
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  const item1 = await itemRepo.save(
    itemRepo.create({
      title: 'Celular Samsung Galaxy Preto',
      description: 'Encontrado no banco da praça central com capa azul',
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: 'Praça Central',
      foundDate: new Date('2026-11-01'),
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  await photoRepo.save(photoRepo.create({ itemId: item1.id, url: 'https://exemplo.com/fotos/celular1.jpg' }));

  const item2 = await itemRepo.save(
    itemRepo.create({
      title: 'Carteira de Estudante Uan',
      description: 'Documento de identificação estudantil',
      categoryId: catDocumentos.id,
      buildingId: bldBiblioteca.id,
      foundLocation: 'Mesa 12 do 2º andar',
      foundDate: new Date('2026-10-25'),
      status: ItemStatus.ELIGIBLE,
      createdBy: admin.id,
    }),
  );

  const item3 = await itemRepo.save(
    itemRepo.create({
      title: 'Relógio Esportivo Digital',
      description: 'Relógio preto com pulseira de borracha',
      categoryId: catEletronicos.id,
      buildingId: bldCentral.id,
      foundLocation: 'Quadra poliesportiva',
      foundDate: new Date('2026-10-10'),
      status: ItemStatus.HANDED_OVER,
      createdBy: admin.id,
    }),
  );

  return {
    admin,
    catEletronicos,
    catDocumentos,
    bldCentral,
    bldBiblioteca,
    item1,
    item2,
    item3,
  };
}

test('RED01 — listagem pública retorna itens AVAILABLE e ELIGIBLE com categoria, prédio e fotos', async () => {
  const { item1, item2 } = await createFixtures();

  const { status, body } = await getItems();

  assert.equal(status, 200, 'Endpoint deve retornar 200 OK');
  assert.equal(body.success, true);
  assert.ok(body.data && Array.isArray(body.data.data), 'data.data deve ser uma lista de itens');
  assert.ok(body.data.pagination, 'data.pagination deve conter metadados de paginação');
  assert.equal(body.data.pagination.total, 2, 'Total deve contabilizar apenas itens AVAILABLE e ELIGIBLE');

  const items = body.data.data;
  const returnedIds = items.map((i: any) => i.id);
  assert.ok(returnedIds.includes(item1.id), 'Item 1 (AVAILABLE) deve estar presente');
  assert.ok(returnedIds.includes(item2.id), 'Item 2 (ELIGIBLE) deve estar presente');

  const foundItem1 = items.find((i: any) => i.id === item1.id);
  assert.ok(foundItem1.category, 'Deve incluir informações da categoria');
  assert.equal(foundItem1.category.name, 'Eletrônicos');
  assert.ok(foundItem1.building, 'Deve incluir informações do prédio');
  assert.equal(foundItem1.building.name, 'Campus Central');
  assert.ok(Array.isArray(foundItem1.photos), 'Deve incluir lista de fotos');
  assert.equal(foundItem1.photos.length, 1);
  assert.equal(foundItem1.photos[0].url, 'https://exemplo.com/fotos/celular1.jpg');
});

test('RED02 — listagem com coleção vazia retorna 200 com array vazio e total 0', async () => {
  const { status, body } = await getItems();

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data?.data));
  assert.equal(body.data.data.length, 0);
  assert.equal(body.data.pagination?.total, 0);
  assert.equal(body.data.pagination?.total_pages, 0);
  assert.equal(body.data.pagination?.page, 1);
  assert.equal(body.data.pagination?.per_page, 20);
});

test('RED03 — catálogo é público: acessível sem header Authorization e com token inválido', async () => {
  await createFixtures();

  const resNoAuth = await getItems();
  assert.equal(resNoAuth.status, 200, 'Requisição anônima deve ser autorizada (RF01)');
  assert.equal(resNoAuth.body.success, true);

  const resBadToken = await getItems('', 'Bearer token.invalido.123');
  assert.equal(resBadToken.status, 200, 'Acesso ao catálogo público não deve falhar por token');
  assert.equal(resBadToken.body.success, true);
});

test('RED04 — idempotência e integridade: consulta GET não modifica contagem nem registros no banco', async () => {
  await createFixtures();

  const initialItemsCount = (await AppDataSource.query('SELECT COUNT(*) as c FROM items'))[0].c;
  const initialPhotosCount = (await AppDataSource.query('SELECT COUNT(*) as c FROM item_photos'))[0].c;
  const initialItems = await AppDataSource.query('SELECT * FROM items ORDER BY id ASC');

  const responses = [
    await getItems(),
    await getItems('search=celular'),
    await getItems('page=1&per_page=10'),
  ];

  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
  }

  const finalItemsCount = (await AppDataSource.query('SELECT COUNT(*) as c FROM items'))[0].c;
  const finalPhotosCount = (await AppDataSource.query('SELECT COUNT(*) as c FROM item_photos'))[0].c;
  const finalItems = await AppDataSource.query('SELECT * FROM items ORDER BY id ASC');

  assert.equal(finalItemsCount, initialItemsCount);
  assert.equal(finalPhotosCount, initialPhotosCount);
  assert.deepEqual(finalItems, initialItems, 'Nenhum campo de item deve ser mutado por leituras');
});

test('RED05 — privacidade: não expõe dados internos ou de auditoria como createdBy, createdByUser, handovers ou dispositions', async () => {
  await createFixtures();

  const { status, body } = await getItems();
  assert.equal(status, 200);

  for (const item of body.data.data) {
    assert.equal('createdBy' in item, false, 'createdBy não deve ser exposto publicamente');
    assert.equal('createdByUser' in item, false, 'createdByUser não deve ser exposto publicamente');
    assert.equal('handovers' in item, false, 'handovers não deve ser exposto na listagem pública');
    assert.equal('dispositions' in item, false, 'dispositions não deve ser exposto na listagem pública');
    assert.equal(JSON.stringify(item).includes('admin@example.com'), false, 'E-mail do admin não deve constar na resposta');
  }
});

test('RED06 — filtro por categoryId: retorna apenas itens da categoria especificada', async () => {
  const { catEletronicos, item1 } = await createFixtures();

  const { status, body } = await getItems(`categoryId=${catEletronicos.id}`);
  assert.equal(status, 200);
  assert.equal(body.data.pagination.total, 1);
  assert.equal(body.data.data[0].id, item1.id);
  assert.equal(body.data.data[0].categoryId, catEletronicos.id);

  const { body: emptyCatBody } = await getItems(`categoryId=99999`);
  assert.equal(emptyCatBody.data.pagination.total, 0);
  assert.equal(emptyCatBody.data.data.length, 0);
});

test('RED07 — filtro por buildingId: retorna apenas itens do prédio especificado', async () => {
  const { bldBiblioteca, item2 } = await createFixtures();

  const { status, body } = await getItems(`buildingId=${bldBiblioteca.id}`);
  assert.equal(status, 200);
  assert.equal(body.data.pagination.total, 1);
  assert.equal(body.data.data[0].id, item2.id);
  assert.equal(body.data.data[0].buildingId, bldBiblioteca.id);
});

test('RED08 — filtro por search: busca palavra-chave em título e descrição', async () => {
  const { item1, item2 } = await createFixtures();

  const res1 = await getItems('search=Samsung');
  assert.equal(res1.status, 200);
  assert.equal(res1.body.data.pagination.total, 1);
  assert.equal(res1.body.data.data[0].id, item1.id);

  const res2 = await getItems('search=estudantil');
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.pagination.total, 1);
  assert.equal(res2.body.data.data[0].id, item2.id);

  const resEmpty = await getItems('search=termo_completamente_inexistente');
  assert.equal(resEmpty.status, 200);
  assert.equal(resEmpty.body.data.pagination.total, 0);
  assert.equal(resEmpty.body.data.data.length, 0);
});

test('RED09 — combinação de filtros: categoryId, buildingId e search aplicados simultaneamente', async () => {
  const { catEletronicos, bldCentral, item1 } = await createFixtures();

  const { status, body } = await getItems(`categoryId=${catEletronicos.id}&buildingId=${bldCentral.id}&search=Samsung`);
  assert.equal(status, 200);
  assert.equal(body.data.pagination.total, 1);
  assert.equal(body.data.data[0].id, item1.id);

  const resMismatch = await getItems(`categoryId=${catEletronicos.id}&buildingId=9999`);
  assert.equal(resMismatch.status, 200);
  assert.equal(resMismatch.body.data.pagination.total, 0);
  assert.equal(resMismatch.body.data.data.length, 0);
});

test('RED10 — paginação completa: cobre páginas 1, 2, 3, 4, união dos 27 IDs e ordenação determinística', async () => {
  const { admin, catEletronicos, bldCentral, item1, item2 } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);

  const allExpectedIds = new Set<number>([item1.id, item2.id]);

  for (let i = 1; i <= 25; i++) {
    const d = new Date('2026-11-02');
    d.setDate(d.getDate() - (i % 5));
    const created = await itemRepo.save(
      itemRepo.create({
        title: `Item Extra ${i.toString().padStart(2, '0')}`,
        description: `Descrição do item extra ${i}`,
        categoryId: catEletronicos.id,
        buildingId: bldCentral.id,
        foundDate: d,
        status: ItemStatus.AVAILABLE,
        createdBy: admin.id,
      }),
    );
    allExpectedIds.add(created.id);
  }

  assert.equal(allExpectedIds.size, 27, 'Devem existir 27 itens publicáveis');

  const p1 = await getItems('page=1&per_page=10');
  assert.equal(p1.status, 200);
  assert.equal(p1.body.data.data.length, 10);
  assert.equal(p1.body.data.pagination.total, 27);
  assert.equal(p1.body.data.pagination.page, 1);
  assert.equal(p1.body.data.pagination.per_page, 10);
  assert.equal(p1.body.data.pagination.total_pages, 3);

  const p2 = await getItems('page=2&per_page=10');
  assert.equal(p2.status, 200);
  assert.equal(p2.body.data.data.length, 10);
  assert.equal(p2.body.data.pagination.total, 27);
  assert.equal(p2.body.data.pagination.page, 2);
  assert.equal(p2.body.data.pagination.total_pages, 3);

  const p3 = await getItems('page=3&per_page=10');
  assert.equal(p3.status, 200);
  assert.equal(p3.body.data.data.length, 7);
  assert.equal(p3.body.data.pagination.total, 27);
  assert.equal(p3.body.data.pagination.page, 3);
  assert.equal(p3.body.data.pagination.total_pages, 3);

  const p4 = await getItems('page=4&per_page=10');
  assert.equal(p4.status, 200);
  assert.equal(p4.body.data.data.length, 0);
  assert.equal(p4.body.data.pagination.total, 27);
  assert.equal(p4.body.data.pagination.page, 4);

  const p1Ids = p1.body.data.data.map((x: any) => x.id);
  const p2Ids = p2.body.data.data.map((x: any) => x.id);
  const p3Ids = p3.body.data.data.map((x: any) => x.id);

  const set1 = new Set(p1Ids);
  const set2 = new Set(p2Ids);
  const set3 = new Set(p3Ids);

  for (const id of set1) assert.equal(set2.has(id) || set3.has(id), false, 'Página 1 não pode colidir');
  for (const id of set2) assert.equal(set1.has(id) || set3.has(id), false, 'Página 2 não pode colidir');
  for (const id of set3) assert.equal(set1.has(id) || set2.has(id), false, 'Página 3 não pode colidir');

  const combined = new Set([...p1Ids, ...p2Ids, ...p3Ids]);
  assert.equal(combined.size, 27);
  for (const id of allExpectedIds) {
    assert.ok(combined.has(id), `Item ${id} deve estar presente`);
  }

  // Ordenação determinística: foundDate DESC, id DESC
  const allReturnedItems = [...p1.body.data.data, ...p2.body.data.data, ...p3.body.data.data];
  for (let idx = 0; idx < allReturnedItems.length - 1; idx++) {
    const cur = allReturnedItems[idx];
    const nxt = allReturnedItems[idx + 1];
    const curDate = new Date(cur.foundDate).getTime();
    const nxtDate = new Date(nxt.foundDate).getTime();
    assert.ok(
      curDate > nxtDate || (curDate === nxtDate && cur.id > nxt.id),
      `Ordenação violada entre item ${cur.id} e ${nxt.id}`,
    );
  }
});

test('RED11 — visibilidade por status: exibe exatamente AVAILABLE e ELIGIBLE, oculta os 5 estados não-públicos', async () => {
  const { admin, catEletronicos, bldCentral, item1, item2 } = await createFixtures();
  const itemRepo = AppDataSource.getRepository(Item);

  const expectedPublicIds = new Set<number>([item1.id, item2.id]);
  const privateIds = new Set<number>();

  const hiddenStatuses = [
    ItemStatus.HANDED_OVER,
    ItemStatus.SOLD,
    ItemStatus.AUCTIONED,
    ItemStatus.DONATED,
    ItemStatus.DISCARDED,
  ];

  for (const st of hiddenStatuses) {
    const privItem = await itemRepo.save(
      itemRepo.create({
        title: `Item Oculto ${st}`,
        description: `Não deve aparecer no catálogo público`,
        categoryId: catEletronicos.id,
        buildingId: bldCentral.id,
        foundDate: new Date('2026-11-01'),
        status: st,
        createdBy: admin.id,
      }),
    );
    privateIds.add(privItem.id);
  }

  const { status, body } = await getItems('per_page=100');
  assert.equal(status, 200);
  assert.equal(body.data.pagination.total, expectedPublicIds.size);

  const returnedIds = new Set(body.data.data.map((i: any) => i.id));
  assert.deepEqual(returnedIds, expectedPublicIds);

  for (const privId of privateIds) {
    assert.equal(returnedIds.has(privId), false, `Item privado ${privId} não deve aparecer`);
  }
});

test('RED12 — validação estrita de query params: rejeita IDs inválidos com 400 e normaliza paginação', async () => {
  await createFixtures();

  const invalidIdCases = [
    'categoryId=abc',
    'categoryId=0',
    'categoryId=-1',
    'categoryId=1.5',
    'categoryId=12abc',
    'buildingId=invalido',
    'buildingId=0',
    'buildingId=-1',
    'buildingId=1.5',
    'buildingId=99xyz',
  ];

  for (const invalidParam of invalidIdCases) {
    const res = await getItems(invalidParam);
    assert.equal(res.status, 400, `Parametro ${invalidParam} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }

  // Normalização contratual de paginação via shared/pagination.ts
  const resPage0 = await getItems('page=0');
  assert.equal(resPage0.status, 200);
  assert.equal(resPage0.body.data.pagination.page, 1);

  const resPageNeg = await getItems('page=-1');
  assert.equal(resPageNeg.status, 200);
  assert.equal(resPageNeg.body.data.pagination.page, 1);

  const resPageNaN = await getItems('page=abc');
  assert.equal(resPageNaN.status, 200);
  assert.equal(resPageNaN.body.data.pagination.page, 1);

  const resPerPageOver = await getItems('per_page=150');
  assert.equal(resPerPageOver.status, 200);
  assert.equal(resPerPageOver.body.data.pagination.per_page, 100);

  const resPerPageZero = await getItems('per_page=0');
  assert.equal(resPerPageZero.status, 200);
  assert.equal(resPerPageZero.body.data.pagination.per_page, 1);
});

test('RED13 — paginação com múltiplas fotos: não duplica itens por JOIN e preserva fotos de cada item', async () => {
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.save(
    userRepo.create({
      name: 'Admin Teste',
      email: 'admin_fotos@example.com',
      passwordHash: 'scrypt:salt:dummyhash',
      role: UserRole.ADMIN,
    }),
  );

  const catRepo = AppDataSource.getRepository(Category);
  const cat = await catRepo.save(catRepo.create({ name: 'Objetos Diversos' }));

  const bldRepo = AppDataSource.getRepository(Building);
  const bld = await bldRepo.save(
    bldRepo.create({
      name: 'Bloco C',
      address: 'Rua C',
      pickupPoint: 'Balcão C',
      serviceHours: '8h às 18h',
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);

  // Item A: 3 fotos
  const itemA = await itemRepo.save(
    itemRepo.create({
      title: 'Item A Com 3 Fotos',
      description: 'Desc A',
      categoryId: cat.id,
      buildingId: bld.id,
      foundDate: new Date('2026-11-04'),
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  await photoRepo.save([
    photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a1.jpg' }),
    photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a2.jpg' }),
    photoRepo.create({ itemId: itemA.id, url: 'https://exemplo.com/a3.jpg' }),
  ]);

  // Item B: 2 fotos
  const itemB = await itemRepo.save(
    itemRepo.create({
      title: 'Item B Com 2 Fotos',
      description: 'Desc B',
      categoryId: cat.id,
      buildingId: bld.id,
      foundDate: new Date('2026-11-03'),
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  await photoRepo.save([
    photoRepo.create({ itemId: itemB.id, url: 'https://exemplo.com/b1.jpg' }),
    photoRepo.create({ itemId: itemB.id, url: 'https://exemplo.com/b2.jpg' }),
  ]);

  // Item C: 0 fotos
  const itemC = await itemRepo.save(
    itemRepo.create({
      title: 'Item C Sem Fotos',
      description: 'Desc C',
      categoryId: cat.id,
      buildingId: bld.id,
      foundDate: new Date('2026-11-02'),
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );

  // Item D: 1 foto
  const itemD = await itemRepo.save(
    itemRepo.create({
      title: 'Item D Com 1 Foto',
      description: 'Desc D',
      categoryId: cat.id,
      buildingId: bld.id,
      foundDate: new Date('2026-11-01'),
      status: ItemStatus.AVAILABLE,
      createdBy: admin.id,
    }),
  );
  await photoRepo.save([photoRepo.create({ itemId: itemD.id, url: 'https://exemplo.com/d1.jpg' })]);

  // Página 1: per_page=2 -> deve retornar exatamente itens A e B
  const p1 = await getItems('page=1&per_page=2');
  assert.equal(p1.status, 200);
  assert.equal(p1.body.data.pagination.total, 4, 'Total de itens deve ser 4, não linhas SQL de fotos');
  assert.equal(p1.body.data.pagination.total_pages, 2);
  assert.equal(p1.body.data.data.length, 2, 'Página deve conter exatamente 2 itens distintos');

  const returnedA = p1.body.data.data.find((x: any) => x.id === itemA.id);
  const returnedB = p1.body.data.data.find((x: any) => x.id === itemB.id);
  assert.ok(returnedA, 'Item A deve estar na página 1');
  assert.ok(returnedB, 'Item B deve estar na página 1');
  assert.equal(returnedA.photos.length, 3, 'Item A deve carregar todas as 3 fotos');
  assert.equal(returnedB.photos.length, 2, 'Item B deve carregar todas as 2 fotos');

  // Página 2: per_page=2 -> deve retornar itens C e D
  const p2 = await getItems('page=2&per_page=2');
  assert.equal(p2.status, 200);
  assert.equal(p2.body.data.data.length, 2);

  const returnedC = p2.body.data.data.find((x: any) => x.id === itemC.id);
  const returnedD = p2.body.data.data.find((x: any) => x.id === itemD.id);
  assert.ok(returnedC, 'Item C deve estar na página 2');
  assert.ok(returnedD, 'Item D deve estar na página 2');
  assert.ok(Array.isArray(returnedC.photos), 'Item C deve ter array de fotos');
  assert.equal(returnedC.photos.length, 0, 'Item C deve ter 0 fotos');
  assert.equal(returnedD.photos.length, 1, 'Item D deve ter 1 foto');
});
