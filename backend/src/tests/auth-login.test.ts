import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

// Isolamento estrito do banco SQLite em diretório temporário
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-login-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { registerUser } = await import('../services/auth.service.js');
const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');

type ApiBody = {
  success: boolean;
  data: any;
  error?: { code: number; details: string } | null;
};

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

test('RED01 / RED06 — login com credenciais válidas retorna 200, token e usuário público sem hash', async () => {
  const created = await registerUser(validUser);

  const { status, body } = await login({
    email: validUser.email,
    password: validUser.password,
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(typeof body.data?.token === 'string' && body.data.token.length > 0);
  assert.equal(body.data?.user?.id, created.id);
  assert.equal(body.data?.user?.name, validUser.name);
  assert.equal(body.data?.user?.email, validUser.email);
  assert.equal(body.data?.user?.role, 'USER');

  // Proteção de dados sensíveis na resposta (RED06)
  assert.ok(!('password' in (body.data?.user ?? {})));
  assert.ok(!('passwordHash' in (body.data?.user ?? {})));
  assert.ok(!('password_hash' in (body.data?.user ?? {})));
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(validUser.password));
  const [row] = await usersByEmail(validUser.email);
  assert.ok(!serialized.includes(row.password_hash as string));
});

test('login com senha de exatamente 1024 bytes é aceito quando cadastrada', async () => {
  const pwd1024 = 'k'.repeat(1024);
  await registerUser({ ...validUser, email: 'user1024@example.com', password: pwd1024 });

  const { status, body } = await login({
    email: 'user1024@example.com',
    password: pwd1024,
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(typeof body.data?.token === 'string');
});

test('login rejeita hash corrompido no banco com 401 sem vazar detalhes', async () => {
  await registerUser(validUser);
  // Corrompe o hash no banco mantendo o tamanho permitido da coluna (ex.: 80 caracteres 'x')
  await AppDataSource.query('UPDATE users SET password_hash = ? WHERE email = ?', ['x'.repeat(80), validUser.email]);

  const { status, body } = await login({
    email: validUser.email,
    password: validUser.password,
  });

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('x'.repeat(20)));
});

test('login falha explicitamente se JWT_SECRET estiver ausente', async () => {
  await registerUser(validUser);
  const originalSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    const { status, body } = await login({
      email: validUser.email,
      password: validUser.password,
    });

    // Sem segredo, deve falhar sem emitir token
    assert.notEqual(status, 200);
    assert.equal(body.data, null);
  } finally {
    process.env.JWT_SECRET = originalSecret;
  }
});

test('RED02 — senha incorreta retorna 401 sem vazar dados', async () => {
  await registerUser(validUser);

  const { status, body } = await login({
    email: validUser.email,
    password: 'SenhaIncorreta999!',
  });

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
  assert.ok(typeof body.error?.details === 'string' && body.error.details.length > 0);
});

test('RED03 — usuário inexistente retorna 401 com mesmo formato sem revelar existência', async () => {
  const { status, body } = await login({
    email: 'naoexiste@example.com',
    password: 'QualquerSenha123!',
  });

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
  assert.ok(typeof body.error?.details === 'string' && body.error.details.length > 0);
});

test('RED04 — login com e-mail não normalizado autentica e retorna e-mail limpo', async () => {
  await registerUser(validUser);

  const { status, body } = await login({
    email: '  ANA@EXAMPLE.COM  ',
    password: validUser.password,
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.user?.email, 'ana@example.com');
});

const invalidLoginCases: [string, unknown][] = [
  ['payload vazio', {}],
  ['e-mail ausente', { password: validUser.password }],
  ['e-mail inválido', { email: 'email-invalido', password: validUser.password }],
  ['e-mail não string', { email: 12345, password: validUser.password }],
  ['senha ausente', { email: validUser.email }],
  ['senha vazia', { email: validUser.email, password: '' }],
  ['senha não string', { email: validUser.email, password: true }],
  ['senha com 1025 bytes', { email: validUser.email, password: 'a'.repeat(1025) }],
  ['senha unicode excedendo 1024 bytes', { email: validUser.email, password: 'ç'.repeat(513) }],
];

for (const [label, payload] of invalidLoginCases) {
  test(`RED05 — payload inválido (${label}) retorna 400 e nenhum token`, async () => {
    const { status, body } = await login(payload);

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 400);
    assert.ok(typeof body.error?.details === 'string' && body.error.details.length > 0);
  });
}

test('RED07 — papel enviado pelo cliente no login é ignorado e reflete o banco', async () => {
  await registerUser(validUser);

  const { status, body } = await login({
    email: validUser.email,
    password: validUser.password,
    role: 'SUPERADMIN',
  });

  assert.equal(status, 200);
  assert.equal(body.data?.user?.role, 'USER');
});

test('RED08 — tentativas de login mantêm integridade read-only de credenciais e usuários no banco', async () => {
  const created = await registerUser(validUser);
  const [initialUser] = await usersByEmail(validUser.email);
  const initialCount = (await AppDataSource.query('SELECT COUNT(*) as total FROM users'))[0].total;

  // Tentativa com dados válidos
  await login({ email: validUser.email, password: validUser.password });
  // Tentativa com senha errada
  await login({ email: validUser.email, password: 'errada' });
  // Tentativa inválida
  await login({});
  // Tentativa inexistente
  await login({ email: 'inexistente@example.com', password: 'xyz' });

  const currentCount = (await AppDataSource.query('SELECT COUNT(*) as total FROM users'))[0].total;
  assert.equal(currentCount, initialCount, 'Nenhum usuário deve ser inserido ou removido pelo login');

  const [afterUser] = await usersByEmail(validUser.email);
  assert.equal(afterUser.password_hash, initialUser.password_hash, 'Hash de senha não pode ser alterado');
  assert.equal(afterUser.role, initialUser.role, 'Papel não pode ser alterado');
  assert.equal(afterUser.id, created.id);
});
