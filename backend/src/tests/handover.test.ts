import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';
import { UserRole, ItemStatus } from '../models/enums.js';
import { Item } from '../models/item.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-handover-test-'));
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

  userCommon = await app.createUser(UserRole.USER, 'user.handover@example.com');
  adminUser = await app.createUser(UserRole.ADMIN, 'admin.handover@example.com');

  userToken = app.tokenFor(userCommon);
  adminToken = app.tokenFor(adminUser);
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await app.dataSource.query('DELETE FROM handovers');
  await app.dataSource.query('DELETE FROM items');
});

async function createItemFixture(status: ItemStatus = ItemStatus.AVAILABLE, title = 'Item Encontrado') {
  const repo = app.dataSource.getRepository(Item);
  return await repo.save(
    repo.create({
      title,
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-11-01',
      status,
      createdBy: adminUser.id,
    }),
  );
}

test('H01 - autenticação obrigatória e restrição de papel ADMIN em POST /api/handovers', async () => {
  const item = await createItemFixture();

  const resNoAuth = await app.request('POST', '/api/handovers', undefined, {
    itemId: item.id,
    withdrawnName: 'Ana Silva',
    withdrawnCpf: '123.456.789-00',
  });
  assert.equal(resNoAuth.status, 401);

  const resUserAuth = await app.request('POST', '/api/handovers', userToken, {
    itemId: item.id,
    withdrawnName: 'Ana Silva',
    withdrawnCpf: '123.456.789-00',
  });
  assert.equal(resUserAuth.status, 403);
});

test('H02 - registro de entrega bem-sucedido para item AVAILABLE atualiza status para HANDED_OVER', async () => {
  const item = await createItemFixture(ItemStatus.AVAILABLE, 'Chaves perdidas');

  const res = await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: 'João Souza',
    withdrawnCpf: '111.222.333-44',
    withdrawnUserId: userCommon.id,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.itemId, item.id);
  assert.equal(res.body.data.withdrawnName, 'João Souza');
  assert.equal(res.body.data.withdrawnCpf, '111.222.333-44');
  assert.equal(res.body.data.withdrawnUserId, userCommon.id);

  // Verificar se o status do item mudou para HANDED_OVER
  const itemRepo = app.dataSource.getRepository(Item);
  const updatedItem = await itemRepo.findOneBy({ id: item.id });
  assert.equal(updatedItem?.status, ItemStatus.HANDED_OVER);
});

test('H03 - registro de entrega para item ELIGIBLE também é permitido', async () => {
  const item = await createItemFixture(ItemStatus.ELIGIBLE, 'Tablet elegível');

  const res = await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: 'Maria Oliveira',
    withdrawnCpf: '222.333.444-55',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
});

test('H04 - rejeita entrega (409) para itens já entregues ou em status inválido', async () => {
  const item = await createItemFixture(ItemStatus.SOLD, 'Item vendido');

  const res = await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: 'Carlos Lima',
    withdrawnCpf: '333.444.555-66',
  });

  assert.equal(res.status, 409);
});

test('H05 - validação de CPF inválido retorna 400', async () => {
  const item = await createItemFixture();

  const res = await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: 'Carlos Lima',
    withdrawnCpf: '12345',
  });

  assert.equal(res.status, 400);
});

test('H06 - histórico pessoal de retiradas GET /api/handovers/mine', async () => {
  const item = await createItemFixture();
  await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: userCommon.name,
    withdrawnCpf: '999.888.777-66',
    withdrawnUserId: userCommon.id,
  });

  const res = await app.request('GET', '/api/handovers/mine', userToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].withdrawnUserId, userCommon.id);
});

test('H07 - listagem administrativa e consulta detalhada de handovers', async () => {
  const item = await createItemFixture();
  const createRes = await app.request('POST', '/api/handovers', adminToken, {
    itemId: item.id,
    withdrawnName: 'Retirante Admin',
    withdrawnCpf: '000.111.222-33',
  });

  const handoverId = createRes.body.data.id;

  const resList = await app.request('GET', '/api/handovers?page=1&per_page=10', adminToken);
  assert.equal(resList.status, 200);
  assert.equal(resList.body.data.data.length, 1);

  const resDetail = await app.request('GET', `/api/handovers/${handoverId}`, adminToken);
  assert.equal(resDetail.status, 200);
  assert.equal(resDetail.body.data.id, handoverId);
});
