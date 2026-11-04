import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-create-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');
const { User } = await import('../models/user.js');
const { UserRole } = await import('../models/enums.js');
const { generateToken } = await import('../shared/token.js');
const { verifyPassword } = await import('../shared/password.js');

type ApiBody<T = any> = {
  success: boolean;
  data: T;
  error?: { code: number; details: string } | null;
  message?: string;
};

const FIXTURE_HASH = `scrypt:${'a'.repeat(32)}:${'b'.repeat(64)}`;
const PUBLIC_USER_KEYS = ['createdAt', 'email', 'id', 'name', 'phone', 'role', 'updatedAt'];
const validAdminPayload = {
  name: 'Ana Silva',
  email: 'ana.admin@example.com',
  initialPassword: 'SenhaInicial123!',
};

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

async function createAdmin(
  payload: unknown,
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/admins`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function getAdmins(
  authHeader?: string,
): Promise<{ status: number; body: ApiBody }> {
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

async function login(body: unknown): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

function usersByEmail(email: string): Promise<Record<string, unknown>[]> {
  return AppDataSource.query('SELECT * FROM users WHERE email = ?', [email]);
}

async function countUsers(): Promise<number> {
  const [row] = await AppDataSource.query('SELECT COUNT(*) AS total FROM users');
  return Number(row.total);
}

async function countUsersByRole(role: (typeof UserRole)[keyof typeof UserRole]): Promise<number> {
  const [row] = await AppDataSource.query('SELECT COUNT(*) AS total FROM users WHERE role = ?', [role]);
  return Number(row.total);
}

async function getUserRowById(id: number): Promise<Record<string, unknown> | null> {
  const rows = await AppDataSource.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

function assertNoSensitiveData(body: ApiBody, knownHash?: string): void {
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('passwordHash'), 'resposta nao deve conter passwordHash');
  assert.ok(!serialized.includes('password_hash'), 'resposta nao deve conter password_hash');
  assert.ok(!serialized.includes('initialPassword'), 'resposta nao deve conter initialPassword');
  assert.ok(!serialized.includes(validAdminPayload.initialPassword), 'resposta nao deve conter a senha inicial');
  if (knownHash) {
    assert.ok(!serialized.includes(knownHash), 'resposta nao deve conter o hash persistido');
  }
}

test('B01 - SUPERADMIN cadastra ADMIN valido com 201 e persistencia correta', async () => {
  const { token } = await createSuperAdmin();

  const res = await createAdmin(validAdminPayload, `Bearer ${token}`);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.name, validAdminPayload.name);
  assert.equal(res.body.data.email, validAdminPayload.email);
  assert.equal(res.body.data.role, UserRole.ADMIN);
  assert.ok(Number.isInteger(res.body.data.id) && res.body.data.id > 0);
  assertNoSensitiveData(res.body);

  const rows = await usersByEmail(validAdminPayload.email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, UserRole.ADMIN);
  assert.equal(rows[0].id, res.body.data.id);
  assert.equal(await countUsers(), 2);
});

test('B02 - o papel ADMIN e atribuido exclusivamente pelo servidor', async () => {
  const { token } = await createSuperAdmin();

  const res = await createAdmin(
    { ...validAdminPayload, role: 'SUPERADMIN', id: 9999 },
    `Bearer ${token}`,
  );

  assert.equal(res.status, 201);
  assert.equal(res.body.data.role, UserRole.ADMIN);
  assert.notEqual(res.body.data.id, 9999);

  const [row] = await usersByEmail(validAdminPayload.email);
  assert.equal(row.role, UserRole.ADMIN);
  assert.notEqual(row.id, 9999);
  assert.equal(await countUsersByRole(UserRole.SUPERADMIN), 1);
  assert.equal(await countUsersByRole(UserRole.ADMIN), 1);
});

test('B03 - a senha inicial e armazenada somente como hash compativel com o login', async () => {
  const { token } = await createSuperAdmin();

  const res = await createAdmin(validAdminPayload, `Bearer ${token}`);
  assert.equal(res.status, 201);

  const [row] = await usersByEmail(validAdminPayload.email);
  assert.equal(typeof row.password_hash, 'string');
  assert.notEqual(row.password_hash, validAdminPayload.initialPassword);
  assert.equal(
    await verifyPassword(validAdminPayload.initialPassword, row.password_hash as string),
    true,
  );
  assert.equal(await verifyPassword('SenhaErrada999!', row.password_hash as string), false);
  assertNoSensitiveData(res.body, row.password_hash as string);
});

test('B04 - o ADMIN recem-criado autentica com a senha inicial e papel ADMIN', async () => {
  const { token } = await createSuperAdmin();
  const created = await createAdmin(validAdminPayload, `Bearer ${token}`);
  assert.equal(created.status, 201);

  const loginRes = await login({
    email: validAdminPayload.email,
    password: validAdminPayload.initialPassword,
  });

  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);
  assert.ok(typeof loginRes.body.data?.token === 'string' && loginRes.body.data.token.length > 0);
  assert.equal(loginRes.body.data?.user?.id, created.body.data.id);
  assert.equal(loginRes.body.data?.user?.role, UserRole.ADMIN);
  assert.ok(!('passwordHash' in (loginRes.body.data?.user ?? {})));
});

test('B05 - sem autenticacao retorna 401 e nao cria usuario', async () => {
  const res = await createAdmin(validAdminPayload);

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 401);
  assert.equal(await countUsers(), 0);
  assert.equal((await usersByEmail(validAdminPayload.email)).length, 0);
});

test('B06 - JWT invalido em suas variacoes retorna 401 sem persistencia', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
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
    const res = await createAdmin(validAdminPayload, authHeader);
    assert.equal(res.status, 401, `${label} deveria retornar 401`);
    assert.equal(res.body.success, false, `${label} deveria falhar`);
    assert.equal(res.body.data, null, `${label} nao deveria retornar dados`);
    assert.equal(res.body.error?.code, 401, `${label} deveria usar codigo 401`);
    assert.equal(await countUsers(), 1, `${label} nao deveria criar usuario`);
    assert.equal((await usersByEmail(validAdminPayload.email)).length, 0);
  }
});

test('B07 - USER autenticado recebe 403 e nao cria ADMIN', async () => {
  const { token: commonToken } = await createFixtureUser('comum@example.com', 'Usuario Comum', UserRole.USER);
  await createSuperAdmin();
  const beforeCount = await countUsers();

  const res = await createAdmin(validAdminPayload, `Bearer ${commonToken}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.equal(await countUsers(), beforeCount);
  assert.equal((await usersByEmail(validAdminPayload.email)).length, 0);
});

test('B08 - ADMIN autenticado recebe 403 e nao cria outro ADMIN', async () => {
  const { token: adminToken } = await createFixtureUser('admin@example.com', 'Admin Comum', UserRole.ADMIN);
  await createSuperAdmin();
  const beforeCount = await countUsers();

  const res = await createAdmin(validAdminPayload, `Bearer ${adminToken}`);

  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, null);
  assert.equal(res.body.error?.code, 403);
  assert.equal(await countUsers(), beforeCount);
  assert.equal((await usersByEmail(validAdminPayload.email)).length, 0);
});

test('B09 - payload com role SUPERADMIN nao cria uma segunda conta protegida', async () => {
  const { token } = await createSuperAdmin();

  const res = await createAdmin(
    {
      ...validAdminPayload,
      role: UserRole.SUPERADMIN,
      id: 12345,
      passwordHash: 'hash-fornecido-pelo-cliente',
      createdAt: '2000-01-01T00:00:00.000Z',
    },
    `Bearer ${token}`,
  );

  assert.equal(res.status, 201);
  assert.equal(res.body.data.role, UserRole.ADMIN);
  assert.notEqual(res.body.data.id, 12345);

  const [row] = await usersByEmail(validAdminPayload.email);
  assert.equal(row.role, UserRole.ADMIN);
  assert.notEqual(row.password_hash, 'hash-fornecido-pelo-cliente');
  assert.equal(await countUsersByRole(UserRole.SUPERADMIN), 1);
  assert.equal(await countUsersByRole(UserRole.ADMIN), 1);
});

test('B10 - e-mail duplicado retorna 409 e nao cria segundo usuario', async () => {
  const { token } = await createSuperAdmin();
  const first = await createAdmin(validAdminPayload, `Bearer ${token}`);
  assert.equal(first.status, 201);

  const second = await createAdmin(
    { ...validAdminPayload, name: 'Outra Pessoa' },
    `Bearer ${token}`,
  );

  assert.equal(second.status, 409);
  assert.equal(second.body.success, false);
  assert.equal(second.body.data, null);
  assert.equal(second.body.error?.code, 409);
  assert.equal(await countUsers(), 2);
  assert.equal((await usersByEmail(validAdminPayload.email)).length, 1);
  assertNoSensitiveData(second.body);
});

test('B11 - e-mail equivalente apos normalizacao tambem retorna 409', async () => {
  const { token } = await createSuperAdmin();
  const first = await createAdmin(
    { ...validAdminPayload, email: '  Ana.Admin@Example.COM  ' },
    `Bearer ${token}`,
  );
  assert.equal(first.status, 201);
  assert.equal(first.body.data.email, 'ana.admin@example.com');

  const second = await createAdmin(
    { ...validAdminPayload, email: 'ANA.ADMIN@example.com' },
    `Bearer ${token}`,
  );

  assert.equal(second.status, 409);
  assert.equal(await countUsers(), 2);
  assert.equal((await usersByEmail('ana.admin@example.com')).length, 1);
});

test('B12 - nome invalido retorna 400 sem criar usuario', async () => {
  const { token } = await createSuperAdmin();
  const cases: [string, unknown][] = [
    ['ausente', undefined],
    ['dois caracteres', 'An'],
    ['151 caracteres', 'a'.repeat(151)],
    ['tipo nao string', 123],
  ];

  for (const [label, name] of cases) {
    const payload = { ...validAdminPayload, email: `nome.${label.replace(/\s+/g, '-')}@example.com`, name };
    const res = await createAdmin(payload, `Bearer ${token}`);
    assert.equal(res.status, 400, `${label} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
    assert.equal(await countUsers(), 1);
    assert.equal((await usersByEmail(payload.email)).length, 0);
  }
});

test('B13 - e-mail invalido retorna 400 sem criar usuario', async () => {
  const { token } = await createSuperAdmin();
  const longEmail = `a@${`${'b'.repeat(60)}.`.repeat(2)}${'c'.repeat(60)}.com`;
  const cases: [string, unknown][] = [
    ['ausente', undefined],
    ['vazio', ''],
    ['formato incorreto', 'email-invalido'],
    ['tipo nao string', 123],
    ['acima de 180 caracteres', longEmail],
  ];

  for (const [label, email] of cases) {
    const res = await createAdmin({ ...validAdminPayload, email }, `Bearer ${token}`);
    assert.equal(res.status, 400, `${label} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
    assert.equal(await countUsers(), 1);
  }
});

test('B14 - initialPassword invalida retorna 400 sem criar usuario', async () => {
  const { token } = await createSuperAdmin();
  const cases: [string, unknown][] = [
    ['ausente', undefined],
    ['null', null],
    ['tipo nao string', 123],
    ['vazia', ''],
    ['acima de 1024 bytes', 'a'.repeat(1025)],
  ];

  for (const [label, initialPassword] of cases) {
    const res = await createAdmin(
      { ...validAdminPayload, email: `senha.${label.replace(/\s+/g, '-')}@example.com`, initialPassword },
      `Bearer ${token}`,
    );
    assert.equal(res.status, 400, `${label} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 400);
    assert.equal(await countUsers(), 1);
  }
});

test('B15 - payload invalido nao cria usuario', async () => {
  const { token } = await createSuperAdmin();
  const arrayPayload = [{ ...validAdminPayload, email: 'array@example.com' }];
  const cases: [string, unknown, number][] = [
    ['array vazio', [], 400],
    ['array de objetos', arrayPayload, 400],
    ['objeto vazio', {}, 400],
    ['campos obrigatorios ausentes', { name: 'Admin Incompleto' }, 400],
    ['JSON null', null, 500],
    ['JSON string', 'texto', 500],
  ];

  for (const [label, payload, expectedStatus] of cases) {
    const beforeCount = await countUsers();
    const res = await createAdmin(payload, `Bearer ${token}`);
    assert.equal(res.status, expectedStatus, `${label} deveria retornar ${expectedStatus}`);
    assert.equal(res.body.success, false, `${label} deveria falhar`);
    assert.equal(res.body.data, null, `${label} nao deveria retornar dados`);
    assert.equal(res.body.error?.code, expectedStatus);
    assert.equal(await countUsers(), beforeCount, `${label} nao deveria criar usuario`);
  }
});

test('B16 - whitelist publica: resposta nao contem senha, hash ou campo interno', async () => {
  const { token } = await createSuperAdmin();

  const res = await createAdmin(validAdminPayload, `Bearer ${token}`);

  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body.data).sort(), PUBLIC_USER_KEYS);
  assert.equal(res.body.data.passwordHash, undefined);
  assert.equal(res.body.data.password, undefined);
  assert.equal(res.body.data.initialPassword, undefined);
  assertNoSensitiveData(res.body);

  const [row] = await usersByEmail(validAdminPayload.email);
  assert.ok(!JSON.stringify(res.body).includes(row.password_hash as string));
});

test('B17 - falha de persistencia retorna 500 controlado sem criacao parcial', async () => {
  const { token } = await createSuperAdmin();
  const failureTrigger = 'trg_test_fail_admin_create';
  await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  await AppDataSource.query(
    `CREATE TRIGGER ${failureTrigger}
       BEFORE INSERT ON users
       WHEN NEW.email = '${validAdminPayload.email}'
       BEGIN
         SELECT RAISE(ABORT, 'Falha simulada de persistencia no SQLite temporario');
       END`,
  );

  try {
    const res = await createAdmin(validAdminPayload, `Bearer ${token}`);

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error?.code, 500);
    assert.equal(res.body.error?.details, 'Ocorreu um erro interno.');
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('Falha simulada'));
    assert.ok(!serialized.includes('SQL'));
    assert.ok(!serialized.includes('stack'));
    assert.equal(await countUsers(), 1);
    assert.equal((await usersByEmail(validAdminPayload.email)).length, 0);
  } finally {
    await AppDataSource.query(`DROP TRIGGER IF EXISTS ${failureTrigger}`);
  }
});

test('B18 - concorrencia com o mesmo e-mail produz exatamente um 201 e um 409', async () => {
  const { token } = await createSuperAdmin();

  const results = await Promise.all([
    createAdmin(validAdminPayload, `Bearer ${token}`),
    createAdmin(
      { ...validAdminPayload, name: 'Outro Admin', email: 'ANA.ADMIN@EXAMPLE.COM' },
      `Bearer ${token}`,
    ),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await countUsers(), 2);
  assert.equal((await usersByEmail('ana.admin@example.com')).length, 1);
});

test('B19 - a conta SUPERADMIN permanece inalterada apos os cadastros', async () => {
  const { user: superadmin, token } = await createSuperAdmin();
  const before = await getUserRowById(superadmin.id);
  assert.ok(before);

  const res = await createAdmin(validAdminPayload, `Bearer ${token}`);
  assert.equal(res.status, 201);

  const after = await getUserRowById(superadmin.id);
  assert.deepEqual(after, before);
  assert.equal(await countUsersByRole(UserRole.SUPERADMIN), 1);
});

test('B20 - o ADMIN recem-criado aparece na listagem do SUPERADMIN', async () => {
  const { token } = await createSuperAdmin();
  const created = await createAdmin(validAdminPayload, `Bearer ${token}`);
  assert.equal(created.status, 201);

  const list = await getAdmins(`Bearer ${token}`);

  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((entry: any) => entry.id === created.body.data.id));
  assert.ok(list.body.data.some((entry: any) => entry.email === validAdminPayload.email));
});

test('B21 - o ADMIN recem-criado nao acessa operacoes exclusivas de SUPERADMIN', async () => {
  const { token: superToken } = await createSuperAdmin();
  const created = await createAdmin(validAdminPayload, `Bearer ${superToken}`);
  assert.equal(created.status, 201);

  const loginRes = await login({
    email: validAdminPayload.email,
    password: validAdminPayload.initialPassword,
  });
  assert.equal(loginRes.status, 200);
  const adminToken = loginRes.body.data.token as string;

  const listRes = await getAdmins(`Bearer ${adminToken}`);
  assert.equal(listRes.status, 403);
  assert.equal(listRes.body.data, null);

  const createRes = await createAdmin(
    { ...validAdminPayload, email: 'outro.admin@example.com' },
    `Bearer ${adminToken}`,
  );
  assert.equal(createRes.status, 403);
  assert.equal(createRes.body.data, null);
  assert.equal(await countUsers(), 2);
  assert.equal((await usersByEmail('outro.admin@example.com')).length, 0);
});

test('B22 - payload misto com um obrigatorio invalido nao cria conta', async () => {
  const { token } = await createSuperAdmin();
  const cases: [string, unknown][] = [
    ['sem initialPassword', { name: 'Admin Valido', email: 'misto1@example.com' }],
    ['nome invalido', { name: 'A', email: 'misto2@example.com', initialPassword: 'SenhaInicial123!' }],
    ['email invalido', { name: 'Admin Valido', email: 'email-invalido', initialPassword: 'SenhaInicial123!' }],
    ['senha vazia', { name: 'Admin Valido', email: 'misto4@example.com', initialPassword: '' }],
  ];

  for (const [label, payload] of cases) {
    const beforeCount = await countUsers();
    const res = await createAdmin(payload, `Bearer ${token}`);
    assert.equal(res.status, 400, `${label} deveria retornar 400`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data, null);
    assert.equal(await countUsers(), beforeCount, `${label} nao deveria criar usuario`);
  }

  const emails = ['misto1@example.com', 'misto2@example.com', 'misto4@example.com'];
  for (const email of emails) {
    assert.equal((await usersByEmail(email)).length, 0);
  }
});
