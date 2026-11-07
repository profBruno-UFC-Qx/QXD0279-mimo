import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-list-test-'));
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

async function getAdmins(
  queryString = '',
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const suffix = queryString ? `?${queryString}` : '';
  const res = await fetch(`${baseUrl}/api/admins${suffix}`, {
    method: 'GET',
    headers,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

function usersByEmail(email: string): Promise<Record<string, unknown>[]> {
  return AppDataSource.query('SELECT * FROM users WHERE email = ?', [email]);
}

async function allUsers(): Promise<Record<string, unknown>[]> {
  return AppDataSource.query('SELECT * FROM users ORDER BY id ASC');
}

function assertNoSensitiveData(body: ApiBody, knownHash = FIXTURE_HASH): void {
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(knownHash), 'resposta nao deve conter o hash persistido');
  assert.ok(!serialized.includes('passwordHash'), 'resposta nao deve conter passwordHash');
  assert.ok(!serialized.includes('password_hash'), 'resposta nao deve conter password_hash');
  assert.ok(!serialized.includes('initialPassword'), 'resposta nao deve conter initialPassword');
}

test('A01 - SUPERADMIN lista os administradores comuns com 200', async () => {
  const { token } = await createSuperAdmin();
  const adminA = await createFixtureUser('admin.a@example.com', 'Admin A', UserRole.ADMIN);
  const adminB = await createFixtureUser('admin.b@example.com', 'Admin B', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  assert.deepEqual(
    res.body.data.map((admin: any) => admin.id).sort((a: number, b: number) => a - b),
    [adminA.user.id, adminB.user.id].sort((a, b) => a - b),
  );
  assertNoSensitiveData(res.body);
});

test('A02 - SUPERADMIN sem administradores recebe 200 com array vazio', async () => {
  const { token } = await createSuperAdmin();

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, []);
});

test('A03 - usuarios comuns nao aparecem na listagem administrativa', async () => {
  const { token } = await createSuperAdmin();
  const common = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const admin = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, admin.user.id);
  assert.ok(!res.body.data.some((entry: any) => entry.id === common.user.id));
  assert.ok(!res.body.data.some((entry: any) => entry.email === common.user.email));
});

test('A04 - a conta protegida SUPERADMIN nao aparece na listagem', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const admin = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, admin.user.id);
  assert.ok(!res.body.data.some((entry: any) => entry.id === superadmin.id));
  assert.ok(!res.body.data.some((entry: any) => entry.role === UserRole.SUPERADMIN));
});

test('A05 - sem autenticacao retorna 401 sem dados administrativos', async () => {
  await createSuperAdmin();
  const admin = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdmins();

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);
  assert.ok(!JSON.stringify(res.body).includes(admin.user.email));
});

test('A06 - JWT invalido em suas variacoes retorna 401', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

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
    const res = await getAdmins('', authHeader);
    assert.equal(res.status, 401, `${label} deveria retornar 401`);
    assert.equal(res.body.success, false, `${label} deveria falhar`);
    assert.equal(res.body.data, null, `${label} nao deveria retornar dados`);
    assert.equal(res.body.error?.code, 401, `${label} deveria usar codigo 401`);
  }
});

test('A07 - USER autenticado recebe 403 e nenhum dado administrativo', async () => {
  await createSuperAdmin();
  const { user: common, token } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const admin = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.ok(!JSON.stringify(res.body).includes(admin.user.email));
  assert.ok(!JSON.stringify(res.body).includes(common.email));
});

test('A08 - ADMIN autenticado recebe 403 e nenhum dado administrativo', async () => {
  await createSuperAdmin();
  const { user: admin, token } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  const otherAdmin = await createFixtureUser('outro.admin@example.com', 'Outro Admin', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.ok(!JSON.stringify(res.body).includes(admin.email));
  assert.ok(!JSON.stringify(res.body).includes(otherAdmin.user.email));
});

test('A09 - parametros de query nao ampliam a autorizacao nem alteram o filtro de papel', async () => {
  const { user: superadmin, token: superToken } = await createSuperAdmin();
  const { user: common, token: commonToken } = await createFixtureUser(
    'comum@example.com',
    'Usuario Comum',
    UserRole.USER,
  );
  const { user: admin, token: adminToken } = await createFixtureUser(
    'admin@example.com',
    'Admin Comum',
    UserRole.ADMIN,
  );
  const otherAdmin = await createFixtureUser('outro.admin@example.com', 'Outro Admin', UserRole.ADMIN);

  const escalationQuery = `role=SUPERADMIN&userId=${superadmin.id}&email=${encodeURIComponent(admin.email)}`;

  const commonRes = await getAdmins(escalationQuery, `Bearer ${commonToken}`);
  assert.equal(commonRes.status, 403);
  assert.equal(commonRes.body.data, null);

  const adminRes = await getAdmins(escalationQuery, `Bearer ${adminToken}`);
  assert.equal(adminRes.status, 403);
  assert.equal(adminRes.body.data, null);

  const superRes = await getAdmins(escalationQuery, `Bearer ${superToken}`);
  assert.equal(superRes.status, 200);
  assert.equal(superRes.body.data.length, 2);
  assert.ok(superRes.body.data.every((entry: any) => entry.role === UserRole.ADMIN));
  assert.ok(!superRes.body.data.some((entry: any) => entry.id === superadmin.id));
  assert.ok(!superRes.body.data.some((entry: any) => entry.id === common.id));
  assert.ok(superRes.body.data.some((entry: any) => entry.id === otherAdmin.user.id));
});

test('A10 - whitelist publica: nenhum hash ou campo interno e retornado', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.deepEqual(Object.keys(res.body.data[0]).sort(), PUBLIC_USER_KEYS);
  assert.equal(res.body.data[0].passwordHash, undefined);
  assert.equal(res.body.data[0].password, undefined);
  assert.equal(res.body.data[0].initialPassword, undefined);
  assertNoSensitiveData(res.body);

  const [row] = await usersByEmail(admin.email);
  assert.ok(!JSON.stringify(res.body).includes(row.password_hash as string));
});

test('A11 - administrador com atributos distintos e retornado integralmente no DTO publico', async () => {
  const { token } = await createSuperAdmin();
  const { user: admin } = await createFixtureUser(
    'admin.completo@example.com',
    'Admin Completo',
    UserRole.ADMIN,
    '+5511988887777',
  );

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  const entry = res.body.data[0];
  assert.equal(entry.id, admin.id);
  assert.equal(entry.name, 'Admin Completo');
  assert.equal(entry.email, 'admin.completo@example.com');
  assert.equal(entry.phone, '+5511988887777');
  assert.equal(entry.role, UserRole.ADMIN);
  assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(entry.updatedAt)));
});

test('A12 - ordenacao estavel por id crescente', async () => {
  const { token } = await createSuperAdmin();
  const first = await createFixtureUser('admin1@example.com', 'Admin Um', UserRole.ADMIN);
  const second = await createFixtureUser('admin2@example.com', 'Admin Dois', UserRole.ADMIN);
  const third = await createFixtureUser('admin3@example.com', 'Admin Tres', UserRole.ADMIN);

  const res = await getAdmins('', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.data.map((entry: any) => entry.id),
    [first.user.id, second.user.id, third.user.id],
  );
});

test('A13 - operacao read-only: a listagem nao altera nenhuma linha de users', async () => {
  const { token } = await createSuperAdmin();
  await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);

  const beforeSnapshot = await allUsers();
  const res = await getAdmins('', `Bearer ${token}`);
  const afterSnapshot = await allUsers();

  assert.equal(res.status, 200);
  assert.deepEqual(afterSnapshot, beforeSnapshot);
});

test('A14 - falha de banco retorna 500 generico sem vazar SQL, hash ou stack', async () => {
  const { token } = await createSuperAdmin();
  const admin = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  const failureTable = 'users_admin_list_failure';

  await AppDataSource.query(`ALTER TABLE users RENAME TO ${failureTable}`);

  try {
    const res = await getAdmins('', `Bearer ${token}`);

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
    assert.ok(!serialized.includes(admin.user.email));
  } finally {
    await AppDataSource.query(`ALTER TABLE ${failureTable} RENAME TO users`);
  }
});

test('A15 - matriz completa de identidades: USER 403, ADMIN 403 e SUPERADMIN 200', async () => {
  const { token: superToken } = await createSuperAdmin();
  const { token: commonToken } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  const { token: adminToken } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);

  const commonRes = await getAdmins('', `Bearer ${commonToken}`);
  const adminRes = await getAdmins('', `Bearer ${adminToken}`);
  const superRes = await getAdmins('', `Bearer ${superToken}`);

  assert.equal(commonRes.status, 403);
  assert.equal(commonRes.body.data, null);
  assert.equal(adminRes.status, 403);
  assert.equal(adminRes.body.data, null);
  assert.equal(superRes.status, 200);
  assert.ok(Array.isArray(superRes.body.data));
  assert.equal(superRes.body.data.length, 1);
  assert.equal(superRes.body.data[0].role, UserRole.ADMIN);
});
