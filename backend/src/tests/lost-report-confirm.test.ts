import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-lost-report-confirm-test-'));
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
const { Notification } = await import('../models/notification.js');
const { UserRole, LostReportStatus, ItemStatus, NotificationType } = await import('../models/enums.js');
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
  assert.equal(AppDataSource.options.database, dbPath);
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
  await AppDataSource.query('DELETE FROM notifications');
  await AppDataSource.query('DELETE FROM lost_reports');
  await AppDataSource.query('DELETE FROM items');
  await AppDataSource.query('DELETE FROM categories');
  await AppDataSource.query('DELETE FROM buildings');
  await AppDataSource.query('DELETE FROM users');
});

async function createFixtureUser(email: string, name: string, role = UserRole.USER): Promise<{ user: any; token: string }> {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      name,
      email,
      passwordHash: 'dummy-hash',
      role,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createFixtureCategory(name = 'Eletrônicos'): Promise<any> {
  const repo = AppDataSource.getRepository(Category);
  return await repo.save(repo.create({ name }));
}

async function createFixtureBuilding(): Promise<any> {
  const repo = AppDataSource.getRepository(Building);
  return await repo.save(
    repo.create({
      name: 'Bloco 1',
      address: 'Rua A',
      pickupPoint: 'Recepção',
      serviceHours: '08h-18h',
    }),
  );
}

async function confirmSuggestion(
  reportId: number | string,
  itemId: number | string,
  token: string,
): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}/api/lost-reports/${reportId}/suggestions/${itemId}/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return {
    status: res.status,
    body: (await res.json()) as ApiBody,
  };
}

test('CONFIRM01 — confirmação bem-sucedida de item sugerido para relato OPEN', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Test');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Test', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const reportRepo = AppDataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi meu celular preto',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const item = await itemRepo.save(
    itemRepo.create({
      title: 'Celular Preto',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const res = await confirmSuggestion(report.id, item.id, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.confirmedItemId, item.id);

  // Verificar se notificação ITEM_CLAIMED foi gerada para o admin
  const notificationRepo = AppDataSource.getRepository(Notification);
  const notifications = await notificationRepo.find({ where: { userId: admin.user.id } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, NotificationType.ITEM_CLAIMED);
  assert.equal(notifications[0].linkUrl, `/admin/items/${item.id}`);
});

test('CONFIRM02 — rejeita segunda confirmação (409 Conflict) para o mesmo relato', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Test');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Test', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const reportRepo = AppDataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi meu relógio',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const item1 = await itemRepo.save(
    itemRepo.create({
      title: 'Relógio 1',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );
  const item2 = await itemRepo.save(
    itemRepo.create({
      title: 'Relógio 2',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  // Primeira confirmação
  const res1 = await confirmSuggestion(report.id, item1.id, token);
  assert.equal(res1.status, 200);

  // Segunda confirmação na mesma perda
  const res2 = await confirmSuggestion(report.id, item2.id, token);
  assert.equal(res2.status, 409);
  assert.equal(res2.body.success, false);
});

test('CONFIRM03 — rejeita confirmação (409 Conflict) se o relato não estiver em status OPEN', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Test');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Test', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const reportRepo = AppDataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi minha carteira',
      lossDate: '2026-10-23',
      status: LostReportStatus.CANCELLED,
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const item = await itemRepo.save(
    itemRepo.create({
      title: 'Carteira Couro',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const res = await confirmSuggestion(report.id, item.id, token);
  assert.equal(res.status, 409);
});

test('CONFIRM04 — rejeita confirmação (404) para relato inexistente ou de outro usuário', async () => {
  const { user, token } = await createFixtureUser('user1@ufc.br', 'User 1');
  const { user: user2 } = await createFixtureUser('user2@ufc.br', 'User 2');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Test', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const reportRepo = AppDataSource.getRepository(LostReport);
  const report = await reportRepo.save(
    reportRepo.create({
      userId: user2.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi minha chave',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const itemRepo = AppDataSource.getRepository(Item);
  const item = await itemRepo.save(
    itemRepo.create({
      title: 'Chave Casa',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const res = await confirmSuggestion(report.id, item.id, token);
  assert.equal(res.status, 404);
});

test('B01 & B06 & B07 — rejeita confirmação (404) para item de categoria incompatível sem vazar dados nem mutar', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Cat');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Cat', UserRole.ADMIN);
  const catA = await createFixtureCategory('Documentos');
  const catB = await createFixtureCategory('Eletrônicos');
  const building = await createFixtureBuilding();

  const report = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: catA.id,
      buildingId: building.id,
      description: 'Perdi minha carteira de identidade',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const foreignItem = await AppDataSource.getRepository(Item).save(
    AppDataSource.getRepository(Item).create({
      title: 'Notebook Secreto Categoria B',
      foundLocation: 'Sala Restrita 999',
      categoryId: catB.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const res = await confirmSuggestion(report.id, foreignItem.id, token);
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes('Notebook Secreto'), false);
  assert.equal(serialized.includes('Sala Restrita'), false);
  assert.equal(serialized.includes('Eletrônicos'), false);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.confirmedItemId, null);
  assert.equal(inDb.status, LostReportStatus.OPEN);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
});

test('B02, B03, B06 & B07 — rejeita confirmação (404) para itens HANDED_OVER, SOLD, AUCTIONED, DONATED e DISCARDED', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Status');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Status', UserRole.ADMIN);
  const category = await createFixtureCategory('Acessórios');
  const building = await createFixtureBuilding();

  const report = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi meus óculos escuros',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const forbiddenStatuses = [
    ItemStatus.HANDED_OVER,
    ItemStatus.SOLD,
    ItemStatus.AUCTIONED,
    ItemStatus.DONATED,
    ItemStatus.DISCARDED,
  ];

  for (const forbiddenStatus of forbiddenStatuses) {
    const privateItem = await AppDataSource.getRepository(Item).save(
      AppDataSource.getRepository(Item).create({
        title: `Item Privado ${forbiddenStatus}`,
        categoryId: category.id,
        buildingId: building.id,
        foundDate: '2026-10-23',
        status: forbiddenStatus,
        createdBy: admin.user.id,
      }),
    );

    const res = await confirmSuggestion(report.id, privateItem.id, token);
    assert.equal(res.status, 404, `Expected 404 for item status ${forbiddenStatus}, got ${res.status}`);
    assert.equal(res.body.success, false);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(forbiddenStatus), false);
    assert.equal(serialized.includes('Item Privado'), false);

    const freshReport = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
    assert.equal(freshReport.confirmedItemId, null);
    assert.equal(freshReport.status, LostReportStatus.OPEN);
    const freshItem = await AppDataSource.getRepository(Item).findOneByOrFail({ id: privateItem.id });
    assert.equal(freshItem.status, forbiddenStatus);
    assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
  }
});

test('B04 — itens públicos AVAILABLE e ELIGIBLE da mesma categoria continuam confirmáveis e preservam status', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Eligible');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Eligible', UserRole.ADMIN);
  const category = await createFixtureCategory('Livros');
  const building = await createFixtureBuilding();

  const report = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: category.id,
      buildingId: null,
      description: 'Perdi um livro de algoritmos',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const eligibleItem = await AppDataSource.getRepository(Item).save(
    AppDataSource.getRepository(Item).create({
      title: 'Livro Algoritmos',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-24',
      status: ItemStatus.ELIGIBLE,
      createdBy: admin.user.id,
    }),
  );

  const res = await confirmSuggestion(report.id, eligibleItem.id, token);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.confirmedItemId, eligibleItem.id);
  assert.equal(res.body.data.status, LostReportStatus.OPEN);

  const freshItem = await AppDataSource.getRepository(Item).findOneByOrFail({ id: eligibleItem.id });
  assert.equal(freshItem.status, ItemStatus.ELIGIBLE);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 1);
});

test('B05 — rejeita item inexistente (404) sem mutação nem notificações', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Missing');
  await createFixtureUser('admin@ufc.br', 'Admin Missing', UserRole.ADMIN);
  const category = await createFixtureCategory();

  const report = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: category.id,
      buildingId: null,
      description: 'Perdi um carregador branco',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const res = await confirmSuggestion(report.id, 99999, token);
  assert.equal(res.status, 404);
  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.equal(inDb.confirmedItemId, null);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
});

test('B08 — duas confirmações concorrentes para itens diferentes do mesmo relato efetivam no máximo uma', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Race');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Race', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const report = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Perdi minha garrafa térmica',
      lossDate: '2026-10-23',
      status: LostReportStatus.OPEN,
    }),
  );

  const itemA = await AppDataSource.getRepository(Item).save(
    AppDataSource.getRepository(Item).create({
      title: 'Garrafa A',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );
  const itemB = await AppDataSource.getRepository(Item).save(
    AppDataSource.getRepository(Item).create({
      title: 'Garrafa B',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const [resA, resB] = await Promise.all([
    confirmSuggestion(report.id, itemA.id, token),
    confirmSuggestion(report.id, itemB.id, token),
  ]);

  const okResponses = [resA, resB].filter((r) => r.status === 200);
  const nonOkResponses = [resA, resB].filter((r) => r.status !== 200);
  assert.equal(okResponses.length, 1);
  assert.equal(nonOkResponses.length, 1);
  assert.ok(nonOkResponses[0].status >= 400);
  assert.equal(nonOkResponses[0].body.success, false);

  const inDb = await AppDataSource.getRepository(LostReport).findOneByOrFail({ id: report.id });
  assert.ok(inDb.confirmedItemId === itemA.id || inDb.confirmedItemId === itemB.id);
  assert.equal(okResponses[0].body.data.confirmedItemId, inDb.confirmedItemId);

  const notifications = await AppDataSource.getRepository(Notification).find({
    where: { userId: admin.user.id },
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].linkUrl, `/admin/items/${inDb.confirmedItemId}`);
});

test('B09 — regressões de 401 sem autenticação, 400 ID inválido e 409 em relato RESOLVED', async () => {
  const { user, token } = await createFixtureUser('user@ufc.br', 'User Reg');
  const admin = await createFixtureUser('admin@ufc.br', 'Admin Reg', UserRole.ADMIN);
  const category = await createFixtureCategory();
  const building = await createFixtureBuilding();

  const item = await AppDataSource.getRepository(Item).save(
    AppDataSource.getRepository(Item).create({
      title: 'Item Regressão',
      categoryId: category.id,
      buildingId: building.id,
      foundDate: '2026-10-23',
      status: ItemStatus.AVAILABLE,
      createdBy: admin.user.id,
    }),
  );

  const resolvedReport = await AppDataSource.getRepository(LostReport).save(
    AppDataSource.getRepository(LostReport).create({
      userId: user.id,
      categoryId: category.id,
      buildingId: building.id,
      description: 'Relato já resolvido anteriormente',
      lossDate: '2026-10-23',
      status: LostReportStatus.RESOLVED,
    }),
  );

  const noAuth = await fetch(`${baseUrl}/api/lost-reports/${resolvedReport.id}/suggestions/${item.id}/confirm`, {
    method: 'POST',
  });
  assert.equal(noAuth.status, 401);

  const badReportId = await confirmSuggestion('abc', item.id, token);
  assert.equal(badReportId.status, 400);

  const badItemId = await confirmSuggestion(resolvedReport.id, '0', token);
  assert.equal(badItemId.status, 400);

  const resolvedRes = await confirmSuggestion(resolvedReport.id, item.id, token);
  assert.equal(resolvedRes.status, 409);
  assert.equal(await AppDataSource.getRepository(Notification).count(), 0);
});
