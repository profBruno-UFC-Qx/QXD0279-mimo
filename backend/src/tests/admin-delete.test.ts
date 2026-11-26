import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-delete-test-'));
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
const { LostReport } = await import('../models/lost-report.js');
const { Notification } = await import('../models/notification.js');
const { Handover } = await import('../models/handover.js');
const { Disposition } = await import('../models/disposition.js');
const { DispositionRule } = await import('../models/disposition-rule.js');
const {
  DispositionType,
  ItemStatus,
  LostReportStatus,
  NotificationType,
  UserRole,
} = await import('../models/enums.js');
const { generateToken } = await import('../shared/token.js');

type ApiBody<T = any> = {
  success: boolean;
  data: T;
  error?: { code: number; details: string } | null;
  message?: string;
};

const FIXTURE_HASH = `scrypt:${'a'.repeat(32)}:${'b'.repeat(64)}`;

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

before(async () => {
  assert.equal(AppDataSource.options.database, dbPath, 'testes nunca devem usar o SQLite de desenvolvimento');
  await AppDataSource.initialize();
  assert.deepEqual(
    await AppDataSource.query('PRAGMA foreign_keys'),
    [{ foreign_keys: 1 }],
    'a integridade referencial depende de foreign_keys habilitado',
  );

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const CLEANUP_ORDER = [
  'item_photos',
  'handovers',
  'dispositions',
  'notifications',
  'lost_reports',
  'items',
  'disposition_rules',
  'users',
  'categories',
  'buildings',
];

beforeEach(async () => {
  for (const table of CLEANUP_ORDER) {
    await AppDataSource.query(`DELETE FROM ${table}`);
  }
});

async function createFixtureUser(
  email: string,
  name: string,
  role: (typeof UserRole)[keyof typeof UserRole] = UserRole.USER,
): Promise<{ user: any; token: string }> {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      name,
      email,
      passwordHash: FIXTURE_HASH,
      phone: null,
      role,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createSuperAdmin(): Promise<{ user: any; token: string }> {
  return createFixtureUser('superadmin@example.com', 'Super Administrador', UserRole.SUPERADMIN);
}

async function createCategory(name = 'Eletronicos'): Promise<any> {
  const repo = AppDataSource.getRepository(Category);
  return repo.save(repo.create({ name }));
}

async function createBuilding(name = 'Predio Central'): Promise<any> {
  const repo = AppDataSource.getRepository(Building);
  return repo.save(
    repo.create({
      name,
      address: 'Rua Central, 100',
      pickupPoint: 'Recepcao',
      serviceHours: '08:00-18:00',
    }),
  );
}

async function createItem(createdBy: number, categoryId: number, buildingId: number): Promise<any> {
  const repo = AppDataSource.getRepository(Item);
  return repo.save(
    repo.create({
      title: 'Notebook encontrado',
      description: null,
      categoryId,
      buildingId,
      foundLocation: null,
      foundDate: '2026-01-10',
      status: ItemStatus.AVAILABLE,
      plannedDestination: null,
      createdBy,
    }),
  );
}

async function createLostReport(userId: number, categoryId: number): Promise<any> {
  const repo = AppDataSource.getRepository(LostReport);
  return repo.save(
    repo.create({
      userId,
      categoryId,
      buildingId: null,
      description: 'Perdi um notebook nesta semana.',
      lossDate: '2026-01-05',
      status: LostReportStatus.OPEN,
    }),
  );
}

async function createNotification(userId: number, itemId: number): Promise<any> {
  const repo = AppDataSource.getRepository(Notification);
  return repo.save(
    repo.create({
      userId,
      type: NotificationType.ITEM_CLAIMED,
      linkUrl: `/admin/items/${itemId}`,
      readAt: null,
    }),
  );
}

async function createHandover(adminId: number, itemId: number): Promise<any> {
  const repo = AppDataSource.getRepository(Handover);
  return repo.save(
    repo.create({
      itemId,
      withdrawnName: 'Fulano de Tal',
      withdrawnCpf: '12345678901',
      withdrawnUserId: null,
      adminId,
    }),
  );
}

async function createDisposition(adminId: number, itemId: number): Promise<any> {
  const repo = AppDataSource.getRepository(Disposition);
  return repo.save(
    repo.create({
      itemId,
      destination: DispositionType.SOLD,
      adminId,
      receiverDocument: '12345678901',
    }),
  );
}

async function createDispositionRule(createdBy: number): Promise<any> {
  const repo = AppDataSource.getRepository(DispositionRule);
  return repo.save(
    repo.create({
      days: 30,
      destination: DispositionType.SOLD,
      active: true,
      locked: false,
      createdBy,
    }),
  );
}

async function deleteAdmin(
  rawId: unknown,
  authHeader?: string,
): Promise<{ status: number; text: string; body: ApiBody | null }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/admins/${String(rawId)}`, {
    method: 'DELETE',
    headers,
  });
  const text = await res.text();
  return { status: res.status, text, body: text ? (JSON.parse(text) as ApiBody) : null };
}

async function getJson(url: string, authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}${url}`, { headers });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function countRows(table: string): Promise<number> {
  const rows = await AppDataSource.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows[0].total);
}

async function userExists(id: number): Promise<boolean> {
  return (await countRowsWhere('users', id)) === 1;
}

async function countRowsWhere(table: string, id: number): Promise<number> {
  const rows = await AppDataSource.query(`SELECT COUNT(*) AS total FROM ${table} WHERE id = ?`, [id]);
  return Number(rows[0].total);
}

async function snapshot(): Promise<Record<string, Record<string, unknown>[]>> {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const table of CLEANUP_ORDER) {
    result[table] = await AppDataSource.query(`SELECT * FROM ${table} ORDER BY id ASC`);
  }
  return result;
}

function assertError(res: { status: number; body: ApiBody | null }, status: number): void {
  assert.equal(res.status, status);
  assert.ok(res.body);
  assert.equal(res.body!.success, false);
  assert.equal(res.body!.data, null);
  assert.equal(res.body!.error?.code, status);
}

test('B01 - SUPERADMIN exclui ADMIN existente com 204 sem corpo e remocao persistida', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  assert.equal(await userExists(admin.id), false);
});

test('B02 - exclusao preserva SUPERADMIN, outros admins e usuarios comuns', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const { user: target } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const { user: otherAdmin } = await createFixtureUser('admin.outro@example.com', 'Admin Outro', UserRole.ADMIN);
  const { user: common } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const res = await deleteAdmin(target.id, `Bearer ${token}`);

  assert.equal(res.status, 204);
  assert.equal(await userExists(target.id), false);
  assert.equal(await userExists(superadmin.id), true);
  assert.equal(await userExists(otherAdmin.id), true);
  assert.equal(await userExists(common.id), true);
});

test('B03 - ADMIN inexistente retorna 404', async () => {
  const { token } = await createSuperAdmin();

  const res = await deleteAdmin(999999, `Bearer ${token}`);

  assertError(res, 404);
});

test('B04 - IDs invalidos retornam 400 sem consulta destrutiva', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const invalidIds = ['0', '-1', 'abc', '1.5', '12abc', '9007199254740992', 'null', 'undefined'];

  for (const rawId of invalidIds) {
    const res = await deleteAdmin(rawId, `Bearer ${token}`);
    assertError(res, 400);
    assert.equal(await userExists(admin.id), true, `ID ${rawId} nao pode alterar o banco`);
  }
});

test('B05 - ID de USER retorna 404 e o usuario permanece', async () => {
  const { token } = await createSuperAdmin();
  const { user: common } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const res = await deleteAdmin(common.id, `Bearer ${token}`);

  assertError(res, 404);
  assert.ok(!JSON.stringify(res.body).includes(common.email));
  assert.equal(await userExists(common.id), true);
});

test('B06 - ID de SUPERADMIN retorna 404 e a conta protegida permanece', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);

  const res = await deleteAdmin(superadmin.id, `Bearer ${token}`);

  assertError(res, 404);
  assert.ok(!JSON.stringify(res.body).includes(superadmin.email));
  assert.equal(await userExists(superadmin.id), true);
});

test('B07 - matriz de identidades: USER 403, ADMIN 403 e SUPERADMIN 204', async () => {
  const { token: superToken } = await createSuperAdmin();
  const { token: commonToken } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const { token: adminToken } = await createFixtureUser('admin.solicitante@example.com', 'Admin Solicitante', UserRole.ADMIN);

  const { user: targetForCommon } = await createFixtureUser('alvo.comum@example.com', 'Alvo Comum', UserRole.ADMIN);
  const commonRes = await deleteAdmin(targetForCommon.id, `Bearer ${commonToken}`);
  assertError(commonRes, 403);
  assert.equal(await userExists(targetForCommon.id), true);

  const { user: targetForAdmin } = await createFixtureUser('alvo.admin@example.com', 'Alvo Admin', UserRole.ADMIN);
  const adminRes = await deleteAdmin(targetForAdmin.id, `Bearer ${adminToken}`);
  assertError(adminRes, 403);
  assert.equal(await userExists(targetForAdmin.id), true);

  const { user: targetForSuper } = await createFixtureUser('alvo.super@example.com', 'Alvo Super', UserRole.ADMIN);
  const superRes = await deleteAdmin(targetForSuper.id, `Bearer ${superToken}`);
  assert.equal(superRes.status, 204);
  assert.equal(await userExists(targetForSuper.id), false);
});

test('B08 - sem autenticacao retorna 401 e nao remove o alvo', async () => {
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);

  const res = await deleteAdmin(admin.id);

  assertError(res, 401);
  assert.ok(!JSON.stringify(res.body).includes(admin.email));
  assert.equal(await userExists(admin.id), true);
});

test('B09 - JWT invalido em suas variacoes retorna 401', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiredToken = generateToken(
    { sub: String(superadmin.id) },
    process.env.JWT_SECRET!,
    { nowSeconds: nowSeconds - 7200, expiresInSeconds: 3600 },
  );
  const tokenParts = token.split('.');
  tokenParts[2] = `${tokenParts[2][0] === 'A' ? 'B' : 'A'}${tokenParts[2].slice(1)}`;
  const tamperedToken = tokenParts.join('.');
  const missingUserToken = generateToken({ sub: '999999' }, process.env.JWT_SECRET!);

  const cases: [string, string][] = [
    ['malformado', 'Bearer token-invalido'],
    ['adulterado', `Bearer ${tamperedToken}`],
    ['expirado', `Bearer ${expiredToken}`],
    ['usuario inexistente', `Bearer ${missingUserToken}`],
  ];

  for (const [label, authHeader] of cases) {
    const res = await deleteAdmin(admin.id, authHeader);
    assertError(res, 401);
    assert.equal(await userExists(admin.id), true, `${label} nao pode excluir o alvo`);
  }
});

test('B10 - manipulacao de papel por query ou body nao altera o alvo', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const { user: common } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const deleteCommon = await fetch(`${baseUrl}/api/admins/${common.id}?role=ADMIN`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: UserRole.ADMIN }),
  });
  assert.equal(deleteCommon.status, 404);
  assert.equal(await userExists(common.id), true);

  const deleteSuper = await fetch(`${baseUrl}/api/admins/${superadmin.id}?role=ADMIN`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: UserRole.ADMIN }),
  });
  assert.equal(deleteSuper.status, 404);
  assert.equal(await userExists(superadmin.id), true);

  const deleteAdminRes = await fetch(`${baseUrl}/api/admins/${admin.id}?role=SUPERADMIN`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: UserRole.SUPERADMIN }),
  });
  assert.equal(deleteAdminRes.status, 204);
  assert.equal(await userExists(admin.id), false);
});

test('B11 - duas exclusoes concorrentes do mesmo ADMIN produzem apenas um efeito', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);

  const [first, second] = await Promise.all([
    deleteAdmin(admin.id, `Bearer ${token}`),
    deleteAdmin(admin.id, `Bearer ${token}`),
  ]);

  assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [204, 404]);
  assert.equal(await userExists(admin.id), false);
});

test('B12 - segunda exclusao apos sucesso retorna 404', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);

  const first = await deleteAdmin(admin.id, `Bearer ${token}`);
  const second = await deleteAdmin(admin.id, `Bearer ${token}`);

  assert.equal(first.status, 204);
  assertError(second, 404);
  assert.equal(await userExists(admin.id), false);
});

test('B13 - item e foto vinculados bloqueiam a exclusao com 409 sem cascade', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const category = await createCategory();
  const building = await createBuilding();
  const item = await createItem(admin.id, category.id, building.id);
  const photoRepo = AppDataSource.getRepository(ItemPhoto);
  await photoRepo.save(photoRepo.create({ itemId: item.id, url: 'https://example.com/foto.jpg' }));

  const before = await snapshot();
  const res = await deleteAdmin(admin.id, `Bearer ${token}`);
  const after = await snapshot();

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.deepEqual(after, before);
});

test('B14 - relato de perda vinculado bloqueia a exclusao com 409', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const category = await createCategory();
  const report = await createLostReport(admin.id, category.id);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.equal(await countRowsWhere('lost_reports', report.id), 1);
});

test('B15 - notificacao vinculada bloqueia a exclusao com 409', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const category = await createCategory();
  const building = await createBuilding();
  const item = await createItem(admin.id, category.id, building.id);
  const notification = await createNotification(admin.id, item.id);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.equal(await countRowsWhere('notifications', notification.id), 1);
});

test('B16 - entrega vinculada bloqueia a exclusao com 409', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const category = await createCategory();
  const building = await createBuilding();
  const item = await createItem(admin.id, category.id, building.id);
  const handover = await createHandover(admin.id, item.id);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.equal(await countRowsWhere('handovers', handover.id), 1);
});

test('B17 - destinacao vinculada bloqueia a exclusao com 409', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const category = await createCategory();
  const building = await createBuilding();
  const item = await createItem(admin.id, category.id, building.id);
  const disposition = await createDisposition(admin.id, item.id);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.equal(await countRowsWhere('dispositions', disposition.id), 1);
});

test('B18 - regra de destinacao vinculada bloqueia a exclusao com 409', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const rule = await createDispositionRule(admin.id);

  const res = await deleteAdmin(admin.id, `Bearer ${token}`);

  assertError(res, 409);
  assert.equal(await userExists(admin.id), true);
  assert.equal(await countRowsWhere('disposition_rules', rule.id), 1);
});

test('B19 - apos exclusao, listagem nao contem o alvo e detalhe retorna 404', async () => {
  const { token } = await createSuperAdmin();
  const { user: target } = await createFixtureUser('admin.alvo@example.com', 'Admin Alvo', UserRole.ADMIN);
  const { user: kept } = await createFixtureUser('admin.kept@example.com', 'Admin Mantido', UserRole.ADMIN);

  const res = await deleteAdmin(target.id, `Bearer ${token}`);
  assert.equal(res.status, 204);

  const list = await getJson('/api/admins', `Bearer ${token}`);
  assert.equal(list.status, 200);
  assert.ok(!list.body.data.some((entry: any) => entry.id === target.id));
  assert.ok(list.body.data.some((entry: any) => entry.id === kept.id));

  const detail = await getJson(`/api/admins/${target.id}`, `Bearer ${token}`);
  assert.equal(detail.status, 404);
  assert.equal(detail.body.data, null);
});
