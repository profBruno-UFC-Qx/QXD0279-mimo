import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';
import { UserRole, ItemStatus, DispositionType } from '../models/enums.js';
import { Item } from '../models/item.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-disposition-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

let app: TestApp;
let category: any;
let building: any;
let userCommon: any;
let adminUser: any;
let adminToken: string;
let userToken: string;

before(async () => {
  app = await startTestApp();
  assert.equal(app.dataSource.options.database, dbPath, 'teste nunca deve usar o SQLite de desenvolvimento');
  category = await app.createCategory('Eletrônicos');
  building = await app.createBuilding('Bloco A');

  userCommon = await app.createUser(UserRole.USER, 'user.disposition@example.com');
  adminUser = await app.createUser(UserRole.ADMIN, 'admin.disposition@example.com');

  userToken = app.tokenFor(userCommon);
  adminToken = app.tokenFor(adminUser);
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await app.dataSource.query('DELETE FROM dispositions');
  await app.dataSource.query('DELETE FROM items');
});

async function createItemFixture(status: ItemStatus = ItemStatus.ELIGIBLE, title = 'Item Elegível') {
  const repo = app.dataSource.getRepository(Item);
  return await repo.save(
    repo.create({
      title,
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-01',
      status,
      createdBy: adminUser.id,
    }),
  );
}

test('D01 - autenticação obrigatória e restrição de papel ADMIN em POST /api/dispositions', async () => {
  const item = await createItemFixture();

  const resNoAuth = await app.request('POST', '/api/dispositions', undefined, {
    itemId: item.id,
    destination: DispositionType.SOLD,
    receiverDocument: '12.345.678/0001-90',
  });
  assert.equal(resNoAuth.status, 401);

  const resUserAuth = await app.request('POST', '/api/dispositions', userToken, {
    itemId: item.id,
    destination: DispositionType.SOLD,
    receiverDocument: '12.345.678/0001-90',
  });
  assert.equal(resUserAuth.status, 403);
});

test('D02 - execução de destinação bem-sucedida para item ELIGIBLE atualiza status do item', async () => {
  const item = await createItemFixture(ItemStatus.ELIGIBLE, 'Notebook elegível');

  const res = await app.request('POST', '/api/dispositions', adminToken, {
    itemId: item.id,
    destination: DispositionType.SOLD,
    receiverDocument: '12.345.678/0001-90',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.itemId, item.id);
  assert.equal(res.body.data.destination, DispositionType.SOLD);
  assert.equal(res.body.data.receiverDocument, '12.345.678/0001-90');

  // Verificar status do item atualizado para SOLD
  const itemRepo = app.dataSource.getRepository(Item);
  const updatedItem = await itemRepo.findOneBy({ id: item.id });
  assert.equal(updatedItem?.status, ItemStatus.SOLD);
});

test('D03 - rejeita destinação (409) se o item não estiver em status ELIGIBLE (ex: AVAILABLE)', async () => {
  const item = await createItemFixture(ItemStatus.AVAILABLE, 'Item disponível');

  const res = await app.request('POST', '/api/dispositions', adminToken, {
    itemId: item.id,
    destination: DispositionType.DONATED,
    receiverDocument: '123.456.789-00',
  });

  assert.equal(res.status, 409);
});

test('D04 - validação de CPF/CNPJ inválido em receiverDocument retorna 400', async () => {
  const item = await createItemFixture();

  const res = await app.request('POST', '/api/dispositions', adminToken, {
    itemId: item.id,
    destination: DispositionType.DONATED,
    receiverDocument: 'documento-invalido',
  });

  assert.equal(res.status, 400);
});

test('D05 - listagem administrativa e consulta detalhada de destinações', async () => {
  const item = await createItemFixture();
  const createRes = await app.request('POST', '/api/dispositions', adminToken, {
    itemId: item.id,
    destination: DispositionType.DONATED,
    receiverDocument: '000.111.222-33',
  });

  const dispositionId = createRes.body.data.id;

  const resList = await app.request('GET', '/api/dispositions?page=1&per_page=10&destination=DONATED', adminToken);
  assert.equal(resList.status, 200);
  assert.equal(resList.body.data.data.length, 1);

  const resDetail = await app.request('GET', `/api/dispositions/${dispositionId}`, adminToken);
  assert.equal(resDetail.status, 200);
  assert.equal(resDetail.body.data.id, dispositionId);
});
