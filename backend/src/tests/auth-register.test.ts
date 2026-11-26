import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
// Must run before data-source.ts is imported: dotenv does not override an existing var.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { registerUser, validateRegistrationInput } = await import('../services/auth.service.js');
const { verifyPassword } = await import('../shared/password.js');
const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');

type ApiBody = { success: boolean; data: any; error?: { code: number; details: string } | null };

const validUser = {
  name: 'Ana Silva',
  email: 'ana@example.com',
  password: 'SenhaForte123!',
  phone: '+5511999999999',
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

async function register(body: unknown): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
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

test('RED01 — cadastro válido retorna 201 e persiste usuário USER', async () => {
  const { status, body } = await register(validUser);

  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.name, validUser.name);
  assert.equal(body.data.email, validUser.email);
  assert.equal(body.data.phone, validUser.phone);
  assert.equal(body.data.role, 'USER');
  assert.ok(Number.isInteger(body.data.id) && body.data.id > 0);
  assert.ok(!Number.isNaN(Date.parse(body.data.createdAt)));

  const rows = await usersByEmail(validUser.email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, body.data.id);
  assert.equal(rows[0].role, 'USER');
});

test('RED02 — senha armazenada como hash e ausente da resposta', async () => {
  const { status, body } = await register(validUser);

  assert.equal(status, 201);
  assert.ok(!('passwordHash' in body.data));
  assert.ok(!('password' in body.data));

  const [row] = await usersByEmail(validUser.email);
  assert.equal(typeof row.password_hash, 'string');
  assert.notEqual(row.password_hash, validUser.password);
  assert.ok(!Object.values(row).some((v) => typeof v === 'string' && v.includes(validUser.password)));
  assert.equal(await verifyPassword(validUser.password, row.password_hash as string), true);
  assert.equal(await verifyPassword('senha-errada', row.password_hash as string), false);

  const raw = JSON.stringify(body);
  assert.ok(!raw.includes(row.password_hash as string));
  assert.ok(!raw.includes(validUser.password));
});

test('RED03 — e-mail duplicado retorna 409 sem segundo registro', async () => {
  const first = await register(validUser);
  assert.equal(first.status, 201);

  const second = await register({ ...validUser, name: 'Outra Pessoa' });
  assert.equal(second.status, 409);
  assert.equal(second.body.success, false);
  assert.equal(second.body.data, null);
  assert.equal(second.body.error?.code, 409);
  assert.equal(typeof second.body.error?.details, 'string');

  assert.equal((await usersByEmail(validUser.email)).length, 1);
});

test('e-mail é normalizado e duplicata com outra caixa retorna 409', async () => {
  const first = await register({ ...validUser, email: '  Ana@Example.COM ' });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.email, 'ana@example.com');

  const second = await register({ ...validUser, email: 'ANA@example.com' });
  assert.equal(second.status, 409);

  const rows = await usersByEmail('ana@example.com');
  assert.equal(rows.length, 1);
  assert.equal(await countUsers(), 1);
});

test('cadastros simultâneos com o mesmo e-mail: um 201, um 409', async () => {
  const results = await Promise.all([register(validUser), register({ ...validUser, email: 'ANA@example.com' })]);

  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await usersByEmail(validUser.email)).length, 1);
});

test('7.1 — validateRegistrationInput rejeita entradas inválidas com 400', () => {
  const invalidInputs = [
    ['nome muito curto', { ...validUser, name: 'An' }],
    ['nome muito longo', { ...validUser, name: 'a'.repeat(151) }],
    ['e-mail inválido', { ...validUser, email: 'email-invalido' }],
    ['telefone inválido', { ...validUser, phone: 'abc' }],
    ['senha acima de 1024 bytes', { ...validUser, password: 'a'.repeat(1025) }],
    ['payload vazio', {}],
  ];

  for (const [desc, input] of invalidInputs) {
    assert.throws(
      () => validateRegistrationInput(input),
      (err: any) => err.statusCode === 400,
      `Deveria ter lançado 400 para: ${desc}`,
    );
  }
});

test('7.1 — validateRegistrationInput normaliza e extrai apenas campos permitidos sem mutar original', () => {
  const original = {
    ...validUser,
    email: '  Usuario.Teste@EXAMPLE.COM  ',
    phone: undefined,
    role: 'SUPERADMIN',
    id: 9999,
  };
  const snapshot = JSON.stringify(original);

  const clean = validateRegistrationInput(original);

  assert.equal(clean.name, validUser.name);
  assert.equal(clean.email, 'usuario.teste@example.com');
  assert.equal(clean.password, validUser.password);
  assert.equal(clean.phone, null);
  assert.ok(!('role' in clean));
  assert.ok(!('id' in clean));
  assert.equal(JSON.stringify(original), snapshot, 'O objeto original não deve ser modificado');
});

test('7.2 — hashFn injetada não é chamada quando a entrada é inválida', async () => {
  let hashCalled = 0;
  const mockHashFn = async () => {
    hashCalled++;
    return 'scrypt:dummy:hash';
  };

  await assert.rejects(
    () => registerUser({ ...validUser, name: 'A' }, mockHashFn),
    (err: any) => err.statusCode === 400,
  );

  assert.equal(hashCalled, 0, 'A função de hash não deve ser executada se a entrada for inválida');
  assert.equal(await countUsers(), 0, 'Nenhum usuário deve ser persistido');
});


test('nome com exatamente 3 caracteres e phone ausente são aceitos', async () => {

  const { status, body } = await register({ name: 'Ana', email: 'ana3@example.com', password: 'x' });

  assert.equal(status, 201);
  assert.equal(body.data.name, 'Ana');
  assert.equal(body.data.phone, null);
  const [row] = await usersByEmail('ana3@example.com');
  assert.equal(row.phone, null);
});

test('senha com exatamente 1024 bytes UTF-8 é aceita e verificável', async () => {
  const pwd1024 = 'k'.repeat(1024);
  const { status, body } = await register({ ...validUser, email: 'pwd1024@example.com', password: pwd1024 });

  assert.equal(status, 201);
  const [row] = await usersByEmail('pwd1024@example.com');
  assert.equal(await verifyPassword(pwd1024, row.password_hash as string), true);
});

test('senha com caracteres Unicode dentro do limite de 1024 bytes é aceita', async () => {
  // 512 caracteres 'ç' = 1024 bytes UTF-8
  const unicodePwd = 'ç'.repeat(512);
  assert.equal(Buffer.byteLength(unicodePwd, 'utf8'), 1024);
  const { status, body } = await register({ ...validUser, email: 'unicode@example.com', password: unicodePwd });

  assert.equal(status, 201);
  const [row] = await usersByEmail('unicode@example.com');
  assert.equal(await verifyPassword(unicodePwd, row.password_hash as string), true);
});

test('POST /api/auth/login responde 200 após cadastro com credenciais válidas', async () => {
  await registerUser(validUser);

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: validUser.email, password: validUser.password }),
  });
  assert.equal(res.status, 200);
});

const { password: _omit, ...withoutPassword } = validUser;
// Valid per isEmail (labels <= 63, local part <= 64) but 188 chars > 180.
const longEmail = `a@${`${'b'.repeat(60)}.`.repeat(2)}${'c'.repeat(60)}.com`;
const invalidCases: [string, unknown][] = [
  ['nome vazio', { ...validUser, name: '' }],
  ['nome com 2 caracteres', { ...validUser, name: 'An' }],
  ['nome com 151 caracteres', { ...validUser, name: 'a'.repeat(151) }],
  ['e-mail inválido', { ...validUser, email: 'email-invalido' }],
  ['e-mail não string', { ...validUser, email: 123 }],
  ['e-mail com mais de 180 caracteres', { ...validUser, email: longEmail }],
  ['senha ausente', withoutPassword],
  ['senha vazia', { ...validUser, password: '' }],
  ['senha não string', { ...validUser, password: 12345678 }],
  ['senha com 1025 bytes UTF-8', { ...validUser, password: 'a'.repeat(1025) }],
  ['senha com caracteres Unicode excedendo 1024 bytes', { ...validUser, password: 'ç'.repeat(513) }], // 513 * 2 = 1026 bytes
  ['phone inválido', { ...validUser, phone: 'abc' }],
  ['payload vazio', {}],
];

for (const [label, payload] of invalidCases) {
  test(`RED04/RED06 — ${label} retorna 400 com envelope de erro e não persiste`, async () => {
    const { status, body } = await register(payload);

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 400);
    assert.equal(typeof body.error?.details, 'string');
    assert.notEqual(body.error?.details, '');
    assert.equal(await countUsers(), 0);
  });
}

test('RED05 — cliente não controla role, id nem passwordHash', async () => {
  const { status, body } = await register({
    name: 'Usuario Teste',
    email: 'teste@example.com',
    password: 'SenhaForte123!',
    role: 'SUPERADMIN',
    id: 9999,
    passwordHash: 'hash-do-cliente',
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  });

  assert.equal(status, 201);
  assert.equal(body.data.role, 'USER');
  assert.notEqual(body.data.id, 9999);

  const [row] = await usersByEmail('teste@example.com');
  assert.equal(row.role, 'USER');
  assert.notEqual(row.id, 9999);
  assert.notEqual(row.password_hash, 'hash-do-cliente');
  assert.equal(await verifyPassword('SenhaForte123!', row.password_hash as string), true);
  assert.ok(!String(row.createdAt).startsWith('2000'));
  assert.ok(!String(row.updatedAt).startsWith('2000'));
});
