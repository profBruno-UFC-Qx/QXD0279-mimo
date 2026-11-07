import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';
import { UserRole, ItemStatus, DispositionType } from '../models/enums.js';
import { Item } from '../models/item.js';
import { DispositionRule } from '../models/disposition-rule.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-job-test-'));
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

  userCommon = await app.createUser(UserRole.USER, 'user.job@example.com');
  adminUser = await app.createUser(UserRole.ADMIN, 'admin.job@example.com');

  userToken = app.tokenFor(userCommon);
  adminToken = app.tokenFor(adminUser);
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await app.dataSource.query('DELETE FROM disposition_rules');
  await app.dataSource.query('DELETE FROM items');
});

async function createItemWithFoundDate(foundDateStr: string, status: ItemStatus = ItemStatus.AVAILABLE) {
  const repo = app.dataSource.getRepository(Item);
  return await repo.save(
    repo.create({
      title: 'Item de Teste',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: foundDateStr,
      status,
      createdBy: adminUser.id,
    }),
  );
}

async function createRule(days: number, destination: DispositionType) {
  const repo = app.dataSource.getRepository(DispositionRule);
  return await repo.save(
    repo.create({
      days,
      destination,
      active: true,
      locked: false,
      createdBy: adminUser.id,
    }),
  );
}

test('JE01 - autenticação e autorização em POST /api/jobs/disposition-eligibility', async () => {
  const resNoAuth = await app.request('POST', '/api/jobs/disposition-eligibility');
  assert.equal(resNoAuth.status, 401);

  const resUserAuth = await app.request('POST', '/api/jobs/disposition-eligibility', userToken);
  assert.equal(resUserAuth.status, 403);
});

test('JE02 - job aplica prazo de destinação convertendo itens AVAILABLE vencidos em ELIGIBLE', async () => {
  // Criar regra de 30 dias para DONATED
  await createRule(30, DispositionType.DONATED);

  // Item encontrado há 35 dias (vencido)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 35);
  const itemExpired = await createItemWithFoundDate(pastDate.toISOString().slice(0, 10), ItemStatus.AVAILABLE);

  // Item encontrado há 5 dias (no prazo)
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 5);
  const itemRecent = await createItemWithFoundDate(recentDate.toISOString().slice(0, 10), ItemStatus.AVAILABLE);

  const res = await app.request('POST', '/api/jobs/disposition-eligibility', adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.updatedCount, 1);

  const itemRepo = app.dataSource.getRepository(Item);
  const updatedExpired = await itemRepo.findOneBy({ id: itemExpired.id });
  assert.equal(updatedExpired?.status, ItemStatus.ELIGIBLE);
  assert.equal(updatedExpired?.plannedDestination, DispositionType.DONATED);

  const updatedRecent = await itemRepo.findOneBy({ id: itemRecent.id });
  assert.equal(updatedRecent?.status, ItemStatus.AVAILABLE);
});

test('JE03 - regra de maior prazo cumprido prevalece em caso de sobreposição', async () => {
  // Regras de 7 dias (SOLD) e 30 dias (DONATED)
  await createRule(7, DispositionType.SOLD);
  await createRule(30, DispositionType.DONATED);

  // Item encontrado há 40 dias (cumpre ambas, mas 30 dias é maior)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 40);
  const item = await createItemWithFoundDate(pastDate.toISOString().slice(0, 10), ItemStatus.AVAILABLE);

  const res = await app.request('POST', '/api/jobs/disposition-eligibility', adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.updatedCount, 1);

  const itemRepo = app.dataSource.getRepository(Item);
  const updated = await itemRepo.findOneBy({ id: item.id });
  assert.equal(updated?.status, ItemStatus.ELIGIBLE);
  assert.equal(updated?.plannedDestination, DispositionType.DONATED);
});
