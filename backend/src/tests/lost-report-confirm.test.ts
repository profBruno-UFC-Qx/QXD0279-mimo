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
