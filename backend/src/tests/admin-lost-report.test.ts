import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { QueryFailedError } from 'typeorm';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';
import { UserRole, LostReportStatus, NotificationType, ItemStatus } from '../models/enums.js';
import { LostReport } from '../models/lost-report.js';
import { Notification } from '../models/notification.js';
import { Item } from '../models/item.js';
import { Handover } from '../models/handover.js';
import { Disposition } from '../models/disposition.js';

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
  await app.dataSource.query('DELETE FROM handovers');
  await app.dataSource.query('DELETE FROM dispositions');
  await app.dataSource.query('DELETE FROM lost_reports');
  await app.dataSource.query('DELETE FROM items');
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

test('B01 - resolução comum muda relato OPEN para RESOLVED e gera uma notificação correta', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Mochila preta na biblioteca');

  const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.userId, userCommon.id);
  assert.equal(res.body.data.status, LostReportStatus.RESOLVED);

  const inDb = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.RESOLVED);

  const notifications = await app.dataSource.getRepository(Notification).find();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, userCommon.id);
  assert.equal(notifications[0].type, NotificationType.REPORT_RESOLVED);
  assert.equal(notifications[0].linkUrl, `/lost-reports/${report.id}`);
  assert.equal(notifications[0].readAt, null);
});

test('B02 - dupla resolução sequencial retorna 200 na primeira e 409 na segunda com 1 notificação', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Carteira de estudante azul');

  const first = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  const second = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);

  assert.equal(first.status, 200);
  assert.equal(first.body.data.status, LostReportStatus.RESOLVED);
  assert.equal(second.status, 409);
  assert.equal(second.body.success, false);

  const inDb = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.RESOLVED);

  const notifications = await app.dataSource.getRepository(Notification).find();
  assert.equal(notifications.length, 1);
});

test('B03 - dupla resolução concorrente produz exatamente 1 sucesso 200, 1 conflito 409 e 1 notificação', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Caderno universitário verde');

  const [resA, resB] = await Promise.all([
    app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken),
    app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken),
  ]);

  const statuses = [resA.status, resB.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409]);

  const inDb = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.RESOLVED);

  const notifications = await app.dataSource.getRepository(Notification).find({
    where: { userId: userCommon.id, type: NotificationType.REPORT_RESOLVED },
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].linkUrl, `/lost-reports/${report.id}`);
});

test('B04 - ADMIN e SUPERADMIN concorrentes: somente um vence com 200 e outro recebe 409', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Fone Bluetooth branco');

  const [resAdmin, resSuper] = await Promise.all([
    app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken),
    app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, superAdminToken),
  ]);

  assert.deepEqual([resAdmin.status, resSuper.status].sort((a, b) => a - b), [200, 409]);

  const notifications = await app.dataSource.getRepository(Notification).find();
  assert.equal(notifications.length, 1);
});

test('B05 - relato CANCELLED retorna 409, mantém CANCELLED e não gera notificação', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.CANCELLED, 'Relato já cancelado pelo autor');

  const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);

  const inDb = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.status, LostReportStatus.CANCELLED);
  assert.equal(await app.dataSource.getRepository(Notification).count(), 0);
});

test('B06 - relato inexistente retorna 404 sem notificações', async () => {
  const res = await app.request('POST', '/api/admin/lost-reports/888888/resolve', adminToken);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(await app.dataSource.getRepository(Notification).count(), 0);
});

test('B07 - IDs inválidos são rejeitados com 400 em detalhes e resolução', async () => {
  const invalidIds = ['0', '-1', '1.5', '12abc', '01', '9007199254740992'];

  for (const invalidId of invalidIds) {
    const resResolve = await app.request('POST', `/api/admin/lost-reports/${invalidId}/resolve`, adminToken);
    assert.equal(resResolve.status, 400, `esperado 400 para POST resolve id=${invalidId}`);
    assert.equal(resResolve.body.success, false);

    const resDetail = await app.request('GET', `/api/admin/lost-reports/${invalidId}`, adminToken);
    assert.equal(resDetail.status, 400, `esperado 400 para GET detalhe id=${invalidId}`);
    assert.equal(resDetail.body.success, false);
  }
});

test('B08 - falha ao gravar notificação executa rollback completo da resolução', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Guarda-chuva perdido no bloco A');
  const triggerName = 'trg_test_fail_report_resolved_notif';

  await app.dataSource.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
  await app.dataSource.query(
    `CREATE TRIGGER ${triggerName}
       BEFORE INSERT ON notifications
       WHEN NEW.type = '${NotificationType.REPORT_RESOLVED}'
       BEGIN
         SELECT RAISE(ABORT, 'Falha simulada ao gravar notificacao');
       END`,
  );

  try {
    const failedRes = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
    assert.equal(failedRes.status, 500);
    assert.equal(failedRes.body.success, false);
    assert.ok(!JSON.stringify(failedRes.body).includes('RAISE'));
    assert.ok(!JSON.stringify(failedRes.body).includes('notifications'));

    const inDbAfterFail = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
    assert.equal(inDbAfterFail.status, LostReportStatus.OPEN);
    assert.equal(await app.dataSource.getRepository(Notification).count(), 0);
  } finally {
    await app.dataSource.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  // Após remover falha simulada, o relato permanece elegível e resolve normalmente uma vez
  const recoveryRes = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(recoveryRes.status, 200);
  assert.equal(recoveryRes.body.data.status, LostReportStatus.RESOLVED);
  assert.equal(await app.dataSource.getRepository(Notification).count(), 1);
});

test('B09 - autorização: USER recebe 403 e ADMIN/SUPERADMIN recebem 200 em listagem, detalhe e resolução', async () => {
  const reportA = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Óculos de grau escuro');
  const reportB = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Casaco cinza de frio');

  const userList = await app.request('GET', '/api/admin/lost-reports', userToken);
  const userDetail = await app.request('GET', `/api/admin/lost-reports/${reportA.id}`, userToken);
  const userResolve = await app.request('POST', `/api/admin/lost-reports/${reportA.id}/resolve`, userToken);
  assert.equal(userList.status, 403);
  assert.equal(userDetail.status, 403);
  assert.equal(userResolve.status, 403);

  const unchanged = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: reportA.id });
  assert.equal(unchanged.status, LostReportStatus.OPEN);
  assert.equal(await app.dataSource.getRepository(Notification).count(), 0);

  const adminList = await app.request('GET', '/api/admin/lost-reports', adminToken);
  const adminDetail = await app.request('GET', `/api/admin/lost-reports/${reportA.id}`, adminToken);
  const adminResolve = await app.request('POST', `/api/admin/lost-reports/${reportA.id}/resolve`, adminToken);
  assert.equal(adminList.status, 200);
  assert.equal(adminDetail.status, 200);
  assert.equal(adminResolve.status, 200);

  const superList = await app.request('GET', '/api/admin/lost-reports', superAdminToken);
  const superDetail = await app.request('GET', `/api/admin/lost-reports/${reportB.id}`, superAdminToken);
  const superResolve = await app.request('POST', `/api/admin/lost-reports/${reportB.id}/resolve`, superAdminToken);
  assert.equal(superList.status, 200);
  assert.equal(superDetail.status, 200);
  assert.equal(superResolve.status, 200);
});

test('B10 - resolução preserva confirmedItemId, descrição, categoria, prédio, data da perda e criação', async () => {
  const itemRepo = app.dataSource.getRepository(Item);
  const item = await itemRepo.save(
    itemRepo.create({
      title: 'Tablet prateado',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-11-05',
      status: ItemStatus.AVAILABLE,
      createdBy: adminUser.id,
    }),
  );

  const reportRepo = app.dataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: userCommon.id,
      categoryId: category.id,
      buildingId: null,
      confirmedItemId: item.id,
      description: 'Tablet perdido próximo à cantina',
      lossDate: '2026-11-04',
      status: LostReportStatus.OPEN,
    }),
  );

  const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, LostReportStatus.RESOLVED);
  assert.equal(res.body.data.id, report.id);
  assert.equal(res.body.data.userId, userCommon.id);
  assert.equal(res.body.data.categoryId, category.id);
  assert.equal(res.body.data.buildingId, null);
  assert.equal(res.body.data.confirmedItemId, item.id);
  assert.equal(res.body.data.description, 'Tablet perdido próximo à cantina');
  assert.equal(res.body.data.lossDate, '2026-11-04');
  assert.equal(
    new Date(res.body.data.createdAt).toISOString(),
    new Date(report.createdAt).toISOString(),
  );
});

test('B11 - resolução não altera status de itens encontrados nem cria entregas ou destinações', async () => {
  const itemRepo = app.dataSource.getRepository(Item);
  const itemAvailable = await itemRepo.save(
    itemRepo.create({
      title: 'Pendrive 64GB',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-11-05',
      status: ItemStatus.AVAILABLE,
      createdBy: adminUser.id,
    }),
  );
  const itemEligible = await itemRepo.save(
    itemRepo.create({
      title: 'Calculadora científica',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-08-01',
      status: ItemStatus.ELIGIBLE,
      createdBy: adminUser.id,
    }),
  );

  const reportRepo = app.dataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: userCommon.id,
      categoryId: category.id,
      buildingId: building.id,
      confirmedItemId: itemAvailable.id,
      description: 'Pendrive preto com chaveiro azul',
      lossDate: '2026-11-04',
      status: LostReportStatus.OPEN,
    }),
  );

  const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
  assert.equal(res.status, 200);

  const reloadedAvail = await itemRepo.findOneByOrFail({ id: itemAvailable.id });
  const reloadedElig = await itemRepo.findOneByOrFail({ id: itemEligible.id });
  assert.equal(reloadedAvail.status, ItemStatus.AVAILABLE);
  assert.equal(reloadedElig.status, ItemStatus.ELIGIBLE);
  assert.equal(await app.dataSource.getRepository(Handover).count(), 0);
  assert.equal(await app.dataSource.getRepository(Disposition).count(), 0);
});

test('B12 - conflito SQLITE_BUSY retorna 409 seguro sem vazar SQL ou stack nem gerar notificações', async () => {
  const report = await createLostReportFixture(userCommon.id, LostReportStatus.OPEN, 'Carregador USB-C branco');

  const originalTransaction = app.dataSource.transaction.bind(app.dataSource);
  (app.dataSource as { transaction: unknown }).transaction = async () => {
    const driverErr = Object.assign(new Error('SQLITE_BUSY: database is locked'), {
      code: 'SQLITE_BUSY',
    });
    throw new QueryFailedError('UPDATE lost_reports SET status = ? WHERE id = ? AND status = ?', ['RESOLVED', report.id, 'OPEN'], driverErr);
  };

  try {
    const res = await app.request('POST', `/api/admin/lost-reports/${report.id}/resolve`, adminToken);
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 409);

    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('SQLITE_BUSY'));
    assert.ok(!serialized.includes('UPDATE lost_reports'));
    assert.ok(!serialized.includes('QueryFailedError'));

    const inDb = await app.dataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
    assert.equal(inDb.status, LostReportStatus.OPEN);
    assert.equal(await app.dataSource.getRepository(Notification).count(), 0);
  } finally {
    (app.dataSource as { transaction: unknown }).transaction = originalTransaction;
  }
});
