import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';
import { UserRole, LostReportStatus, NotificationType } from '../models/enums.js';
import { LostReport } from '../models/lost-report.js';
import { Notification } from '../models/notification.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-lost-report-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

let app: TestApp;
let category: any;
let building: any;
let userCommon: any;
let adminUser: any;
let superAdminUser: any;
let adminToken: string;
let superAdminToken: string;
let userToken: string;

before(async () => {
  app = await startTestApp();
  assert.equal(app.dataSource.options.database, dbPath, 'teste nunca deve usar o SQLite de desenvolvimento');
  category = await app.createCategory('Eletrônicos');
  building = await app.createBuilding('Bloco A');

  userCommon = await app.createUser(UserRole.USER, 'user.common@example.com');
  adminUser = await app.createUser(UserRole.ADMIN, 'admin.user@example.com');
  superAdminUser = await app.createUser(UserRole.SUPERADMIN, 'superadmin.user@example.com');

  userToken = app.tokenFor(userCommon);
  adminToken = app.tokenFor(adminUser);
  superAdminToken = app.tokenFor(superAdminUser);
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await app.dataSource.query('DELETE FROM notifications');
  await app.dataSource.query('DELETE FROM lost_reports');
});

async function createLostReportFixture(userId: number, status: LostReportStatus = LostReportStatus.OPEN, desc = 'Relato de teste perdido') {
  const repo = app.dataSource.getRepository(LostReport);
  return await repo.save(
    repo.create({
      userId,
      categoryId: category.id,
      buildingId: building.id,
      description: desc,
      lossDate: '2026-11-01',
      status,
    }),
  );
}

test('ALR01 - autenticação obrigatória: sem token retorna 401', async () => {
  const resList = await app.request('GET', '/api/admin/lost-reports');
  assert.equal(resList.status, 401);

  const resDetail = await app.request('GET', '/api/admin/lost-reports/1');
  assert.equal(resDetail.status, 401);

  const resResolve = await app.request('POST', '/api/admin/lost-reports/1/resolve');
  assert.equal(resResolve.status, 401);
});

test('ALR02 - USER comum recebe 403 em todas as rotas administrativas de lost reports', async () => {
  const report = await createLostReportFixture(userCommon.id);

  const resList = await app.request('GET', '/api/admin/lost-reports', userToken);
  assert.equal(resList.status, 403);

  const resDetail = await app.request('GET', `/api/admin/lost-reports/${report.id}`, userToken);
  assert.equal(resDetail.status, 403);

  const resResolve = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, userToken);
  assert.equal(resResolve.status, 403);
});

test('ALR03 - ADMIN e SUPERADMIN listam perdas com sucesso (200)', async () => {
  await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Celular perdido');
  await createLostReportFixture(userCommon.id, LostReportStatus.RESOLVED, 'Chaves perdidas');

  for (const token of [adminToken, superAdminToken]) {
    const res = await app.request('GET', '/api/admin/lost-reports?page=1&per_page=10', token);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.data.length, 2);
    assert.equal(res.body.data.pagination.total, 2);
  }
});

test('ALR04 - listagem com filtros por status, categoryId e buildingId', async () => {
  await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Relato aberto 1');
  await createLostReportFixture(userCommon.id, LostReportStatus.RESOLVED, 'Relato resolvido 2');

  const resOpen = await app.request('GET', '/api/admin/lost-reports?status=OPEN', adminToken);
  assert.equal(resOpen.status, 200);
  assert.equal(resOpen.body.data.data.length, 1);
  assert.equal(resOpen.body.data.data[0].status, LostReportStatus.OPEN);

  const resCat = await app.request('GET', `/api/admin/lost-reports?categoryId=${category.id}`, adminToken);
  assert.equal(resCat.status, 200);
  assert.equal(resCat.body.data.data.length, 2);

  const resInvalidStatus = await app.request('GET', '/api/admin/lost-reports?status=INVALIDO', adminToken);
  assert.equal(resInvalidStatus.status, 400);
});

test('ALR05 - consulta detalhada de perda por ID', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Relato detalhe');

  const res = await app.request('GET', `/api/admin/lost-reports/${report.id}`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.description, 'Relato detalhe');

  const resNotFound = await app.request('GET', '/api/admin/lost-reports/99999', adminToken);
  assert.equal(resNotFound.status, 404);

  const resInvalidId = await app.request('GET', '/api/admin/lost-reports/abc', adminToken);
  assert.equal(resInvalidId.status, 400);
});

test('ALR06 - encerramento de perda como resolvida gera notificação para o autor', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Relato para resolver');

  const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, LostReportStatus.RESOLVED);

  // Verificar persistência no banco
  const reportRepo = app.dataSource.getRepository(LostReport);
  const updatedReport = await reportRepo.findOneBy({ id: report.id });
  assert.equal(updatedReport?.status, LostReportStatus.RESOLVED);

  // Verificar notificação criada
  const notificationRepo = app.dataSource.getRepository(Notification);
  const notif = await notificationRepo.findOneBy({ userId: userCommon.id });
  assert.ok(notif);
  assert.equal(notif.type, NotificationType.REPORT_RESOLVED);
  assert.equal(notif.linkUrl, `/lost-reports/${report.id}`);
  assert.equal(notif.readAt, null);
});

test('ALR07 - encerramento rejeita relato inexistente (404) ou não aberto (409)', async () => {
  const reportOpen = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN);
  const reportResolved = await createLostReportFixture(userCommon.id, LostReportStatus.RESOLVED);

  const resNotFound = await app.request('POST', '/api/admin/lost-reports/99999/resolve', adminToken);
  assert.equal(resNotFound.status, 404);

  const resAlreadyResolved = await app.request('POST', `/api/admin/lost-reports/${reportResolved.id}/resolve`, adminToken);
  assert.equal(resAlreadyResolved.status, 409);
});
