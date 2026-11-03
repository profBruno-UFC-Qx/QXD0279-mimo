import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

// Isolamento estrito do banco SQLite em diretório temporário
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-user-update-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
const TEST_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

const { registerUser } = await import('../services/auth.service.js');
const { generateToken } = await import('../shared/token.js');
const { verifyPassword } = await import('../shared/password.js');
const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');

type ApiBody = {
  success: boolean;
  data: any;
  error?: { code: number; details: string } | null;
};

const userA = {
  name: 'Ana Silva',
  email: 'ana@example.com',
  password: 'SenhaForte123!',
  phone: '+5511999999999',
};

const userB = {
  name: 'Carlos Souza',
  email: 'carlos@example.com',
  password: 'SenhaForte456!',
  phone: '+5511888888888',
};

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

before(async () => {
  assert.equal(AppDataSource.options.database, dbPath, 'testes nunca devem usar o SQLite de desenvolvimento');
  await AppDataSource.initialize();

  const app = express();
  app.use(express.json({ strict: false }));
  app.use('/api', apiRouter);
  app.use(errorHandler);

  server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
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

async function patchMe(body: unknown, authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/users/me`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

async function getMe(authHeader?: string): Promise<{ status: number; body: ApiBody }> {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  const res = await fetch(`${baseUrl}/api/users/me`, {
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

function userById(id: number): Promise<Record<string, unknown> | undefined> {
  return AppDataSource.query('SELECT * FROM users WHERE id = ?', [id]).then((rows) => rows[0]);
}

test('RED01 — atualização de nome altera banco e retorna perfil sem credenciais', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({ name: 'Ana Maria Silva' }, `Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.id, created.id);
  assert.equal(body.data?.name, 'Ana Maria Silva');
  assert.equal(body.data?.email, userA.email);
  assert.equal(body.data?.phone, userA.phone);
  assert.equal(body.data?.role, 'USER');

  // Nenhuma credencial ou hash vazado na resposta
  assert.ok(!('password' in (body.data ?? {})));
  assert.ok(!('passwordHash' in (body.data ?? {})));
  assert.ok(!('password_hash' in (body.data ?? {})));

  // Verificação no banco de dados
  const row = await userById(created.id);
  assert.equal(row?.name, 'Ana Maria Silva');
  assert.equal(row?.email, userA.email);
  assert.equal(row?.phone, userA.phone);
  assert.equal(row?.role, 'USER');
});

test('RED02 — atualização segura de senha altera hash scrypt e atualiza autenticação', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);
  const originalHash = initialRow?.password_hash as string;
  assert.ok(typeof originalHash === 'string' && originalHash.length > 0);

  const newPassword = 'NovaSenhaSegura456!';
  const { status, body } = await patchMe({ password: newPassword }, `Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.id, created.id);
  assert.equal(body.data?.name, userA.name);
  assert.equal(body.data?.email, userA.email);

  // Nenhuma senha ou hash no corpo da resposta
  assert.ok(!('password' in (body.data ?? {})));
  assert.ok(!('passwordHash' in (body.data ?? {})));
  assert.ok(!('password_hash' in (body.data ?? {})));
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(newPassword));
  assert.ok(!serialized.includes(userA.password));

  // Verificação no banco
  const updatedRow = await userById(created.id);
  const updatedHash = updatedRow?.password_hash as string;
  assert.notEqual(updatedHash, originalHash, 'Hash no banco deve ter sido alterado');
  assert.notEqual(updatedHash, newPassword, 'Senha não pode ser armazenada em texto puro');
  assert.match(updatedHash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/, 'Hash deve seguir formato scrypt do projeto');

  // Validação criptográfica com verifyPassword
  assert.equal(await verifyPassword(newPassword, updatedHash), true, 'Nova senha deve ser verificada pelo hash');
  assert.equal(await verifyPassword(userA.password, updatedHash), false, 'Senha antiga não deve mais conferir');

  // Login posterior com a nova senha deve funcionar
  const newLoginRes = await login({ email: userA.email, password: newPassword });
  assert.equal(newLoginRes.status, 200);
  assert.equal(newLoginRes.body.success, true);

  // Login posterior com a senha antiga deve falhar com 401
  const oldLoginRes = await login({ email: userA.email, password: userA.password });
  assert.equal(oldLoginRes.status, 401);
  assert.equal(oldLoginRes.body.success, false);
});

test('RED03 — tentativa de alterar e-mail retorna 400 e preserva e-mail original', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({ email: 'novo@example.com' }, `Bearer ${token}`);

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);

  const row = await userById(created.id);
  assert.equal(row?.email, userA.email, 'E-mail não pode ser modificado por PATCH /api/users/me');

  // Login com e-mail original continua funcionando
  const loginOriginal = await login({ email: userA.email, password: userA.password });
  assert.equal(loginOriginal.status, 200);

  // Login com e-mail não autorizado não autentica
  const loginNovo = await login({ email: 'novo@example.com', password: userA.password });
  assert.equal(loginNovo.status, 401);
});

test('RED04 — atualização de telefone altera banco e preserva outros campos', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({ phone: '+5588999998888' }, `Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.data?.phone, '+5588999998888');
  assert.equal(body.data?.name, userA.name);
  assert.equal(body.data?.email, userA.email);

  const row = await userById(created.id);
  assert.equal(row?.phone, '+5588999998888');
  assert.equal(row?.name, userA.name);
  assert.equal(row?.email, userA.email);
});

test('RED05 — remoção opcional de telefone aceita null e atualiza no banco', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({ phone: null }, `Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.data?.phone, null);
  assert.equal(body.data?.name, userA.name);
  assert.equal(body.data?.email, userA.email);

  const row = await userById(created.id);
  assert.equal(row?.phone, null);
  assert.equal(row?.name, userA.name);
});

test('RED06 — atualização atômica de múltiplos campos válidos (name, phone, password)', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const newPassword = 'NovaSenhaMultipla123!';
  const { status, body } = await patchMe(
    { name: 'Ana Beatriz Silva', phone: '+5588777777777', password: newPassword },
    `Bearer ${token}`,
  );

  assert.equal(status, 200);
  assert.equal(body.data?.name, 'Ana Beatriz Silva');
  assert.equal(body.data?.phone, '+5588777777777');
  assert.equal(body.data?.email, userA.email);
  assert.equal(body.data?.role, 'USER');

  assert.ok(!('password' in (body.data ?? {})));
  assert.ok(!('passwordHash' in (body.data ?? {})));

  const row = await userById(created.id);
  assert.equal(row?.name, 'Ana Beatriz Silva');
  assert.equal(row?.phone, '+5588777777777');
  assert.equal(row?.email, userA.email);
  assert.equal(await verifyPassword(newPassword, row?.password_hash as string), true);

  // Login com a nova senha funciona
  const loginCheck = await login({ email: userA.email, password: newPassword });
  assert.equal(loginCheck.status, 200);
});

test('RED07 — ausência de header Authorization retorna 401 e não altera banco', async () => {
  const created = await registerUser(userA);

  const { status, body } = await patchMe({ name: 'Nome Sem Autenticação' });

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);

  const row = await userById(created.id);
  assert.equal(row?.name, userA.name);
});

test('RED08 — token inválido, expirado, adulterado ou de usuário excluído retorna 401', async () => {
  const created = await registerUser(userA);
  const validToken = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);
  const [h, p, s] = validToken.split('.');
  const tamperedSig = s.slice(0, 5) + (s[5] === 'x' ? 'y' : 'x') + s.slice(6);
  const tamperedToken = `${h}.${p}.${tamperedSig}`;

  const past = Math.floor(Date.now() / 1000) - 7200;
  const expiredToken = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET, {
    nowSeconds: past,
    expiresInSeconds: 3600,
  });

  const resTampered = await patchMe({ name: 'Hack 1' }, `Bearer ${tamperedToken}`);
  assert.equal(resTampered.status, 401);
  assert.equal(resTampered.body.data, null);

  const resExpired = await patchMe({ name: 'Hack 2' }, `Bearer ${expiredToken}`);
  assert.equal(resExpired.status, 401);
  assert.equal(resExpired.body.data, null);

  const resMalformed = await patchMe({ name: 'Hack 3' }, 'Bearer token.invalido.aleatorio');
  assert.equal(resMalformed.status, 401);
  assert.equal(resMalformed.body.data, null);

  const nonExistentToken = generateToken({ sub: '999999' }, TEST_JWT_SECRET);
  const resNonExistent = await patchMe({ name: 'Hack 4' }, `Bearer ${nonExistentToken}`);
  assert.equal(resNonExistent.status, 401);
  assert.equal(resNonExistent.body.data, null);

  // Usuário excluído do banco após emissão do token
  const userToDelete = await registerUser(userB);
  const tokenDeletedUser = generateToken({ sub: String(userToDelete.id) }, TEST_JWT_SECRET);
  await AppDataSource.query('DELETE FROM users WHERE id = ?', [userToDelete.id]);
  const resDeleted = await patchMe({ name: 'Hack 5' }, `Bearer ${tokenDeletedUser}`);
  assert.equal(resDeleted.status, 401);
  assert.equal(resDeleted.body.data, null);

  const row = await userById(created.id);
  assert.equal(row?.name, userA.name);
});

test('RED09 — isolamento de contas: envio de id de outro usuário retorna 400 e não altera nenhuma conta', async () => {
  const createdA = await registerUser(userA);
  const createdB = await registerUser(userB);

  const loginA = await login({ email: userA.email, password: userA.password });
  const tokenA = loginA.body.data.token;

  const { status, body } = await patchMe({ id: createdB.id, name: 'Tentativa de Hack em B' }, `Bearer ${tokenA}`);

  assert.equal(status, 400, 'Envio de id deve ser rejeitado como campo proibido com HTTP 400');
  assert.equal(body.success, false);
  assert.equal(body.data, null);

  // Nenhuma das contas pode ter sido alterada
  const rowA = await userById(createdA.id);
  assert.equal(rowA?.name, userA.name, 'Conta A não deve ser alterada por requisição inválida');

  const rowB = await userById(createdB.id);
  assert.equal(rowB?.name, userB.name, 'Conta B não pode ser alterada por A');
  assert.equal(rowB?.email, userB.email);
});

test('RED10 — tentativa de modificar papel retorna 400 e preserva USER no banco', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({ role: 'SUPERADMIN' }, `Bearer ${token}`);

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);

  const row = await userById(created.id);
  assert.equal(row?.role, 'USER');
});

test('RED11 — tentativa de modificar campos protegidos/internos retorna 400', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);

  const payloads = [
    { id: 999 },
    { role: 'ADMIN' },
    { email: 'hack@example.com' },
    { passwordHash: 'scrypt:salt:hash-forjado-manual' },
    { password_hash: 'scrypt:salt:hash-forjado-manual' },
    { createdAt: '2000-01-01T00:00:00Z' },
    { updatedAt: '2000-01-01T00:00:00Z' },
    { userId: 999 },
  ];

  for (const payload of payloads) {
    const { status, body } = await patchMe(payload, `Bearer ${token}`);
    assert.equal(status, 400, `Payload ${JSON.stringify(payload)} deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  }

  const finalRow = await userById(created.id);
  assert.equal(finalRow?.id, initialRow?.id);
  assert.equal(finalRow?.email, initialRow?.email);
  assert.equal(finalRow?.password_hash, initialRow?.password_hash);
  assert.equal(finalRow?.created_at, initialRow?.created_at);
});

test('RED12 — validação de nome inválido retorna 400 e preserva banco', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const invalidNames = [
    ['vazio', ''],
    ['apenas espaços', '   '],
    ['2 caracteres (abaixo de 3)', 'Ab'],
    ['151 caracteres (acima de 150)', 'A'.repeat(151)],
    ['tipo número', 12345],
    ['valor nulo', null],
  ];

  for (const [desc, nameVal] of invalidNames) {
    const { status, body } = await patchMe({ name: nameVal }, `Bearer ${token}`);
    assert.equal(status, 400, `Nome "${desc}" deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  }

  const row = await userById(created.id);
  assert.equal(row?.name, userA.name);
});

test('RED13 — rejeição de qualquer tentativa de envio de e-mail retorna 400', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const emailPayloads = [
    ['e-mail válido', { email: 'novo@example.com' }],
    ['e-mail inválido', { email: 'invalido' }],
    ['e-mail igual ao atual', { email: userA.email }],
    ['e-mail nulo', { email: null }],
  ];

  for (const [desc, payload] of emailPayloads) {
    const { status, body } = await patchMe(payload, `Bearer ${token}`);
    assert.equal(status, 400, `Tentativa "${desc}" deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  }

  const row = await userById(created.id);
  assert.equal(row?.email, userA.email);
});

test('RED14 — validação de telefone inválido retorna 400 e preserva banco', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const invalidPhones = [
    ['abaixo de 8 caracteres', '+551199'],
    ['acima de 20 caracteres', '+55119999999999999999999'],
    ['letras no telefone', '+55119999ABCD'],
    ['tipo número', 11999999999],
  ];

  for (const [desc, phoneVal] of invalidPhones) {
    const { status, body } = await patchMe({ phone: phoneVal }, `Bearer ${token}`);
    assert.equal(status, 400, `Telefone "${desc}" deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  }

  const row = await userById(created.id);
  assert.equal(row?.phone, userA.phone);
});

test('RED15 — preservação estrita do e-mail após atualizações de nome, telefone e senha', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const res1 = await patchMe({ name: 'Nome Alterado' }, `Bearer ${token}`);
  assert.equal(res1.status, 200);
  const res2 = await patchMe({ phone: '+5588999991111' }, `Bearer ${token}`);
  assert.equal(res2.status, 200);
  const res3 = await patchMe({ password: 'NovaSenhaSegura123!' }, `Bearer ${token}`);
  assert.equal(res3.status, 200);

  const row = await userById(created.id);
  assert.equal(row?.email, userA.email, 'E-mail deve permanecer rigorosamente inalterado');
});

test('RED16 — rejeição de campos desconhecidos com HTTP 400 sem mutação parcial', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe(
    { name: 'Ana Atualizada', unknownField: 'valorInesperado' },
    `Bearer ${token}`,
  );

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);

  const row = await userById(created.id);
  assert.equal(row?.name, userA.name, 'Nome não pode ser atualizado quando campo desconhecido estiver presente');
});

test('RED17 — atomicidade: payload com campo válido e senha ou telefone inválido é totalmente rejeitado', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);

  // Cenário 1: Nome válido com senha vazia
  const res1 = await patchMe({ name: 'Nome Nao Persistente', password: '' }, `Bearer ${token}`);
  assert.equal(res1.status, 400);

  // Cenário 2: Telefone inválido com senha válida
  const res2 = await patchMe({ phone: 'invalido', password: 'NovaSenha123!' }, `Bearer ${token}`);
  assert.equal(res2.status, 400);

  const finalRow = await userById(created.id);
  assert.equal(finalRow?.name, initialRow?.name);
  assert.equal(finalRow?.phone, initialRow?.phone);
  assert.equal(finalRow?.password_hash, initialRow?.password_hash);
  assert.equal(await verifyPassword(userA.password, finalRow?.password_hash as string), true);
});

test('RED18 — concorrência: atualizações simultâneas de campos distintos (name e phone) preservam ambos', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const [resName, resPhone] = await Promise.all([
    patchMe({ name: 'Ana Concorrente' }, `Bearer ${token}`),
    patchMe({ phone: '+5588999990000' }, `Bearer ${token}`),
  ]);

  assert.equal(resName.status, 200);
  assert.equal(resPhone.status, 200);

  const row = await userById(created.id);
  assert.equal(row?.name, 'Ana Concorrente');
  assert.equal(row?.phone, '+5588999990000');
  assert.equal(row?.email, userA.email);
});

test('RED19 — concorrência: atualização simultânea de senha e nome preserva ambos', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const newPassword = 'SenhaConcorrente123!';
  const [resPass, resName] = await Promise.all([
    patchMe({ password: newPassword }, `Bearer ${token}`),
    patchMe({ name: 'Ana Simultanea' }, `Bearer ${token}`),
  ]);

  assert.equal(resPass.status, 200);
  assert.equal(resName.status, 200);

  const row = await userById(created.id);
  assert.equal(row?.name, 'Ana Simultanea');
  assert.equal(row?.email, userA.email);
  assert.equal(await verifyPassword(newPassword, row?.password_hash as string), true);
  assert.equal(await verifyPassword(userA.password, row?.password_hash as string), false);
});

test('RED20 — payload vazio retorna 400 sem mutação no banco', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const { status, body } = await patchMe({}, `Bearer ${token}`);

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);

  const row = await userById(created.id);
  assert.equal(row?.name, userA.name);
  assert.equal(row?.email, userA.email);
});

test('RED21 — integridade geral: rejeição de payload inválido seguida de sucesso em atualização válida', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);

  // 1. Envio de payload inválido deve retornar 400
  const invalidRes = await patchMe({ name: 'Ab' }, `Bearer ${token}`);
  assert.equal(invalidRes.status, 400);

  // 2. Envio de PATCH válido deve retornar 200
  const validRes = await patchMe({ name: 'Ana Silva Santos' }, `Bearer ${token}`);
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.success, true);
  assert.equal(validRes.body.data?.name, 'Ana Silva Santos');
  assert.ok(!('password' in (validRes.body.data ?? {})));
  assert.ok(!('passwordHash' in (validRes.body.data ?? {})));

  // 3. Verificações de integridade no banco
  const finalRow = await userById(created.id);
  assert.equal(finalRow?.name, 'Ana Silva Santos');
  assert.equal(finalRow?.id, initialRow?.id);
  assert.equal(finalRow?.email, initialRow?.email);
  assert.equal(finalRow?.password_hash, initialRow?.password_hash);
  assert.equal(finalRow?.role, initialRow?.role);

  // 4. Usuário continua autenticável com a senha original
  const checkLogin = await login({ email: userA.email, password: userA.password });
  assert.equal(checkLogin.status, 200);
});

test('RED22 — consulta GET /api/users/me reflete alterações após PATCH bem-sucedido', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const patchRes = await patchMe({ name: 'Ana Atualizada' }, `Bearer ${token}`);
  assert.equal(patchRes.status, 200);

  const getRes = await getMe(`Bearer ${token}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data?.id, created.id);
  assert.equal(getRes.body.data?.name, 'Ana Atualizada');
  assert.equal(getRes.body.data?.email, userA.email);
  assert.equal(getRes.body.data?.role, 'USER');
});

test('RED23 — validação de senha: tipos incorretos, limites UTF-8 (1 a 1024 bytes) e caracteres Unicode', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);

  // Casos inválidos (devem retornar 400)
  const invalidPasswords = [
    ['vazia', ''],
    ['valor nulo', null],
    ['tipo número', 123456],
    ['excedendo 1024 bytes ASCII', 'a'.repeat(1025)],
    ['unicode excedendo 1024 bytes', '🔥'.repeat(257)], // 257 * 4 bytes = 1028 bytes UTF-8
  ];

  for (const [desc, pwd] of invalidPasswords) {
    const { status, body } = await patchMe({ password: pwd }, `Bearer ${token}`);
    assert.equal(status, 400, `Senha "${desc}" deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  }

  // Banco e autenticação continuam intactos após tentativas inválidas
  const midRow = await userById(created.id);
  assert.equal(midRow?.password_hash, initialRow?.password_hash);
  assert.equal(await verifyPassword(userA.password, midRow?.password_hash as string), true);

  // Caso válido de 1 byte
  const res1Byte = await patchMe({ password: 'x' }, `Bearer ${token}`);
  assert.equal(res1Byte.status, 200);

  // Caso válido de exatamente 1024 bytes UTF-8
  const valid1024Bytes = 'k'.repeat(1024);
  const res1024 = await patchMe({ password: valid1024Bytes }, `Bearer ${token}`);
  assert.equal(res1024.status, 200);

  const finalRow = await userById(created.id);
  assert.equal(await verifyPassword(valid1024Bytes, finalRow?.password_hash as string), true);
});

test('RED24 — rejeição de payloads com formato inválido (não-objeto JSON)', async () => {
  const created = await registerUser(userA);
  const loginRes = await login({ email: userA.email, password: userA.password });
  const token = loginRes.body.data.token;

  const initialRow = await userById(created.id);

  const invalidBodies: [string, unknown][] = [
    ['array vazio', []],
    ['array de objetos', [{ name: 'Ana' }]],
    ['array de números', [1, 2, 3]],
    ['JSON null', null],
    ['JSON string', 'texto'],
    ['JSON número', 123],
    ['JSON booleano verdadeiro', true],
    ['JSON booleano falso', false],
  ];

  for (const [desc, bodyVal] of invalidBodies) {
    const { status, body } = await patchMe(bodyVal, `Bearer ${token}`);
    assert.equal(status, 400, `Body "${desc}" deveria retornar 400`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 400);
  }

  const finalRow = await userById(created.id);
  assert.equal(finalRow?.id, initialRow?.id);
  assert.equal(finalRow?.name, initialRow?.name);
  assert.equal(finalRow?.email, initialRow?.email);
  assert.equal(finalRow?.phone, initialRow?.phone);
  assert.equal(finalRow?.password_hash, initialRow?.password_hash);
  assert.equal(finalRow?.role, initialRow?.role);
});
