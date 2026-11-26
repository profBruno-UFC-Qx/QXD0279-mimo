import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-detail-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');
const { User } = await import('../models/user.js');
const { UserRole } = await import('../models/enums.js');
const { generateToken } = await import('../shared/token.js');

type ApiBody<T = any> = {
  success: boolean;
  data: T;
  error?: { code: number; details: string } | null;
  message?: string;
};

const FIXTURE_HASH = `scrypt:${'a'.repeat(32)}:${'b'.repeat(64)}`;
const PUBLIC_USER_KEYS = ['createdAt', 'email', 'id', 'name', 'phone', 'role', 'updatedAt'];

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
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await AppDataSource.query('DELETE FROM users');
});

async function createFixtureUser(
  email: string,
  name: string,
  role: (typeof UserRole)[keyof typeof UserRole] = UserRole.USER,
  phone: string | null = null,
): Promise<{ user: any; token: string }> {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      name,
      email,
      passwordHash: FIXTURE_HASH,
      phone,
      role,
    }),
  );
  const token = generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!);
  return { user, token };
}

async function createSuperAdmin(): Promise<{ user: any; token: string }> {
  return createFixtureUser('superadmin@example.com', 'Super Administrador', UserRole.SUPERADMIN);
}

async function getAdminDetail(
  rawId: unknown,
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/admins/${String(rawId)}`, {
    method: 'GET',
    headers,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function getAdmins(authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/admins`, {
    method: 'GET',
    headers,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function allUsers(): Promise<Record<string, unknown>[]> {
  return AppDataSource.query('SELECT * FROM users ORDER BY id ASC');
}

function assertNoSensitiveData(body: ApiBody): void {
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(FIXTURE_HASH), 'resposta nao deve conter o hash persistido');
  assert.ok(!serialized.includes('passwordHash'), 'resposta nao deve conter passwordHash');
  assert.ok(!serialized.includes('password_hash'), 'resposta nao deve conter password_hash');
  assert.ok(!serialized.includes('initialPassword'), 'resposta nao deve conter initialPassword');
}

test('A01 - SUPERADMIN consulta ADMIN existente e recebe 200', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser(
    'admin@example.com',
    'Admin Comum',
    UserRole.ADMIN,
    '+5511988887777',
  );

  const res = await getAdminDetail(admin.id, `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, admin.id);
  assert.equal(res.body.data.name, 'Admin Comum');
  assert.equal(res.body.data.email, 'admin@example.com');
  assert.equal(res.body.data.phone, '+5511988887777');
  assert.equal(res.body.data.role, UserRole.ADMIN);
  assertNoSensitiveData(res.body);
});

test('A02 - DTO publico completo, sem hash ou campo interno', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser(
    'admin.dto@example.com',
    'Admin DTO',
    UserRole.ADMIN,
    '+5511977776666',
  );

  const res = await getAdminDetail(admin.id, `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data).sort(), PUBLIC_USER_KEYS);
  assert.ok(!Number.isNaN(Date.parse(res.body.data.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(res.body.data.updatedAt)));
  assert.equal(res.body.data.passwordHash, undefined);
  assert.equal(res.body.data.password, undefined);
  assert.equal(res.body.data.initialPassword, undefined);
  assertNoSensitiveData(res.body);
});

test('A03 - ADMIN inexistente retorna 404', async () => {
  const { token } = await createSuperAdmin();

  const res = await getAdminDetail(999999, `Bearer ${token}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 404);
});

test('A04 - ID de USER retorna 404 e nao expoe o usuario', async () => {
  const { token } = await createSuperAdmin();
  const { user: common } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const res = await getAdminDetail(common.id, `Bearer ${token}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 404);
  assert.ok(!JSON.stringify(res.body).includes(common.email));
});

test('A05 - ID de SUPERADMIN retorna 404 e nao expoe a conta protegida', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdminDetail(superadmin.id, `Bearer ${token}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 404);
  assert.ok(!JSON.stringify(res.body).includes(superadmin.email));
});

test('A06 - IDs invalidos retornam 400 sem consulta administrativa', async () => {
  const { token } = await createSuperAdmin();
  const invalidIds = ['0', '-1', 'abc', '1.5', '12abc', '9007199254740992', 'null', 'undefined'];

  for (const rawId of invalidIds) {
    const res = await getAdminDetail(rawId, `Bearer ${token}`);
    assert.equal(res.status, 400, `ID ${rawId} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
  }
});

test('A07 - sem autenticacao retorna 401', async () => {
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdminDetail(admin.id);

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);
  assert.ok(!JSON.stringify(res.body).includes(admin.email));
});

test('A08 - JWT invalido em suas variacoes retorna 401', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
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
    const res = await getAdminDetail(admin.id, authHeader);
    assert.equal(res.status, 401, `${label} deveria retornar 401`);
    assert.equal(res.body.success, false, `${label} deveria falhar`);
    assert.equal(res.body.data, null, `${label} nao deveria retornar dados`);
    assert.equal(res.body.error?.code, 401, `${label} deveria usar codigo 401`);
  }
});

test('A09 - USER autenticado recebe 403 e nenhum dado administrativo', async () => {
  await createSuperAdmin();
  const { user: common, token } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdminDetail(admin.id, `Bearer ${token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.ok(!JSON.stringify(res.body).includes(admin.email));
  assert.ok(!JSON.stringify(res.body).includes(common.email));
});

test('A10 - ADMIN autenticado recebe 403 e nenhum dado administrativo', async () => {
  await createSuperAdmin();
  const { user: requester, token } = await createFixtureUser('requester@example.com', 'Admin Solicitante', UserRole.ADMIN);
  const { user: target } = await createFixtureUser('target@example.com', 'Admin Alvo', UserRole.ADMIN);

  const res = await getAdminDetail(target.id, `Bearer ${token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.ok(!JSON.stringify(res.body).includes(target.email));
  assert.ok(!JSON.stringify(res.body).includes(requester.email));
});

test('A11 - matriz de identidades: USER 403, ADMIN 403 e SUPERADMIN 200', async () => {
  const { token: superToken } = await createSuperAdmin();
  const { token: commonToken } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const { token: adminToken } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  const { user: target } = await createFixtureUser('target@example.com', 'Admin Alvo', UserRole.ADMIN);

  const commonRes = await getAdminDetail(target.id, `Bearer ${commonToken}`);
  const adminRes = await getAdminDetail(target.id, `Bearer ${adminToken}`);
  const superRes = await getAdminDetail(target.id, `Bearer ${superToken}`);

  assert.equal(commonRes.status, 403);
  assert.equal(commonRes.body.data, null);
  assert.equal(adminRes.status, 403);
  assert.equal(adminRes.body.data, null);
  assert.equal(superRes.status, 200);
  assert.equal(superRes.body.data.id, target.id);
  assert.equal(superRes.body.data.role, UserRole.ADMIN);
});

test('A12 - query de escalonamento nao altera autorizacao nem o alvo', async () => {
  const { user: superadmin, token: superToken } = await createSuperAdmin();
  const { token: commonToken } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const { token: adminToken } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  const { user: target } = await createFixtureUser('target@example.com', 'Admin Alvo', UserRole.ADMIN);

  const escalationQuery = `?role=SUPERADMIN&userId=${superadmin.id}&email=${encodeURIComponent(target.email)}`;

  const commonRes = await fetch(`${baseUrl}/api/admins/${target.id}${escalationQuery}`, {
    headers: { Authorization: `Bearer ${commonToken}` },
  });
  assert.equal(commonRes.status, 403);

  const adminRes = await fetch(`${baseUrl}/api/admins/${target.id}${escalationQuery}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminRes.status, 403);

  const superRes = await fetch(`${baseUrl}/api/admins/${target.id}${escalationQuery}`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert.equal(superRes.status, 200);
  const superBody = (await superRes.json()) as ApiBody;
  assert.equal(superBody.data.id, target.id);
  assert.equal(superBody.data.role, UserRole.ADMIN);

  const superAsTarget = await getAdminDetail(superadmin.id, `Bearer ${superToken}`);
  assert.equal(superAsTarget.status, 404);
  assert.equal(superAsTarget.body.data, null);
});

test('A13 - consulta individual e read-only', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const beforeSnapshot = await allUsers();
  const res = await getAdminDetail(admin.id, `Bearer ${token}`);
  const afterSnapshot = await allUsers();

  assert.equal(res.status, 200);
  assert.deepEqual(afterSnapshot, beforeSnapshot);
});

test('A14 - falha de banco controlada retorna 500 generico', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  const failureTable = 'users_admin_detail_failure';

  await AppDataSource.query(`ALTER TABLE users RENAME TO ${failureTable}`);

  try {
    const res = await getAdminDetail(admin.id, `Bearer ${token}`);

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 500);
    assert.equal(res.body.error?.details, 'Ocorreu um erro interno.');

    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('SELECT'));
    assert.ok(!serialized.includes('users'));
    assert.ok(!serialized.includes('password'));
    assert.ok(!serialized.includes(FIXTURE_HASH));
    assert.ok(!serialized.includes('stack'));
    assert.ok(!serialized.includes(admin.email));
  } finally {
    await AppDataSource.query(`ALTER TABLE ${failureTable} RENAME TO users`);
  }
});

test('A15 - detalhe e listagem retornam o mesmo DTO publico', async () => {
  const { token } = await createSuperAdmin();
  const { user: adminA } = await createFixtureUser('admin.a@example.com', 'Admin A', UserRole.ADMIN);
  const { user: adminB } = await createFixtureUser('admin.b@example.com', 'Admin B', UserRole.ADMIN);

  const detail = await getAdminDetail(adminA.id, `Bearer ${token}`);
  const list = await getAdmins(`Bearer ${token}`);

  assert.equal(detail.status, 200);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 2);
  const listEntry = list.body.data.find((entry: any) => entry.id === adminA.id);
  assert.ok(listEntry);
  assert.deepEqual(detail.body.data, listEntry);
  assert.ok(list.body.data.some((entry: any) => entry.id === adminB.id));
});

test('A16 - respostas 404 nao vazam dados de USER nem de SUPERADMIN', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const { user: common } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const userRes = await getAdminDetail(common.id, `Bearer ${token}`);
  const superRes = await getAdminDetail(superadmin.id, `Bearer ${token}`);

  for (const res of [userRes, superRes]) {
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 404);
    assert.ok(!JSON.stringify(res.body).includes(common.email));
    assert.ok(!JSON.stringify(res.body).includes(superadmin.email));
    assertNoSensitiveData(res.body);
  }
});
