import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

// Isolamento estrito do banco SQLite em diretório temporário
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-user-me-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
const TEST_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

const { registerUser } = await import('../services/auth.service.js');
const { generateToken } = await import('../shared/token.js');
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

const otherUser = {
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

function getMeRaw(headers: [string, string][]): Promise<{ status: number; body: ApiBody }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/api/users/me`);
    const allHeaders: [string, string][] = [
      ['Host', `${url.hostname}:${url.port}`],
      ...headers,
    ];
    const clientReq = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname,
      method: 'GET',
      headers: allHeaders as any,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data) as ApiBody;
          resolve({ status: res.statusCode ?? 500, body });
        } catch (e) {
          reject(e);
        }
      });
    });
    clientReq.on('error', reject);
    clientReq.end();
  });
}

function usersByEmail(email: string): Promise<Record<string, unknown>[]> {
  return AppDataSource.query('SELECT * FROM users WHERE email = ?', [email]);
}

async function login(body: unknown): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

test('RED01 / RED11 — usuário autenticado acessa o próprio perfil sem expor credenciais', async () => {
  await registerUser(validUser);

  const loginRes = await login({ email: validUser.email, password: validUser.password });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);
  const token = loginRes.body.data?.token;
  assert.ok(typeof token === 'string' && token.length > 0);

  const { status, body } = await getMe(`Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.id, loginRes.body.data?.user?.id);
  assert.equal(body.data?.name, validUser.name);
  assert.equal(body.data?.email, validUser.email);
  assert.equal(body.data?.phone, validUser.phone);
  assert.equal(body.data?.role, 'USER');
  assert.ok(!Number.isNaN(Date.parse(body.data?.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(body.data?.updatedAt)));

  // RED11: Nenhuma credencial ou hash na resposta
  assert.ok(!('password' in (body.data ?? {})));
  assert.ok(!('passwordHash' in (body.data ?? {})));
  assert.ok(!('password_hash' in (body.data ?? {})));
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(validUser.password));
  assert.ok(!serialized.includes(TEST_JWT_SECRET));
  const [row] = await usersByEmail(validUser.email);
  assert.ok(!serialized.includes(row.password_hash as string));
});

test('RED02 — header Authorization ausente retorna 401', async () => {
  const { status, body } = await getMe();

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
  assert.ok(typeof body.error?.details === 'string' && body.error.details.length > 0);
});

const malformedHeaderCases: [string, string][] = [
  ['apenas Bearer sem espaço', 'Bearer'],
  ['apenas Bearer com espaço', 'Bearer '],
  ['esquema Basic', 'Basic dXNlcjpwYXNz'],
  ['token com espaços no meio', 'Bearer token parte2'],
  ['dois tokens separados por vírgula', 'Bearer token1, Bearer token2'],
  ['esquema minúsculo sem token', 'bearer '],
];

for (const [label, headerVal] of malformedHeaderCases) {
  test(`RED03 — header malformado (${label}) retorna 401`, async () => {
    const { status, body } = await getMe(headerVal);

    assert.equal(status, 401);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 401);
  });
}

test('RED04 — token adulterado ou aleatório retorna 401', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);
  const [h, p, s] = token.split('.');
  // Altera um caractere no meio da assinatura válida
  const tamperedSig = s.slice(0, 10) + (s[10] === 'a' ? 'b' : 'a') + s.slice(11);
  const tamperedToken = `${h}.${p}.${tamperedSig}`;

  const resTampered = await getMe(`Bearer ${tamperedToken}`);
  assert.equal(resTampered.status, 401);
  assert.equal(resTampered.body.data, null);

  const resRandom = await getMe('Bearer token.invalido.aleatorio');
  assert.equal(resRandom.status, 401);
  assert.equal(resRandom.body.data, null);
});

test('RED05 — token expirado retorna 401', async () => {
  const created = await registerUser(validUser);
  const past = Math.floor(Date.now() / 1000) - 7200; // 2 horas no passado
  const expiredToken = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET, {
    nowSeconds: past,
    expiresInSeconds: 3600, // expirou há 1 hora
  });

  const { status, body } = await getMe(`Bearer ${expiredToken}`);

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
});

test('RED06 — token assinado com outro segredo retorna 401', async () => {
  const created = await registerUser(validUser);
  const otherSecret = 'outro-segredo-com-mais-de-32-bytes-diferente-1234!';
  const invalidSecretToken = generateToken({ sub: String(created.id) }, otherSecret);

  const { status, body } = await getMe(`Bearer ${invalidSecretToken}`);

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
});

test('RED07 — identificador de usuário inexistente no token retorna 401', async () => {
  const nonexistentToken = generateToken({ sub: '999999' }, TEST_JWT_SECRET);

  const { status, body } = await getMe(`Bearer ${nonexistentToken}`);

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
});

test('RED08 — isolamento entre usuários: token A acessa apenas dados de A, token B apenas B', async () => {
  const userA = await registerUser(validUser);
  const userB = await registerUser(otherUser);

  const tokenA = generateToken({ sub: String(userA.id) }, TEST_JWT_SECRET);
  const tokenB = generateToken({ sub: String(userB.id) }, TEST_JWT_SECRET);

  const resA = await getMe(`Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.data?.id, userA.id);
  assert.equal(resA.body.data?.email, userA.email);

  const resB = await getMe(`Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.data?.id, userB.id);
  assert.equal(resB.body.data?.email, userB.email);
});

test('RED09 — papel atualizado no banco reflete imediatamente no perfil', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  // Atualiza papel no banco para ADMIN
  await AppDataSource.query('UPDATE users SET role = ? WHERE id = ?', ['ADMIN', created.id]);

  const { status, body } = await getMe(`Bearer ${token}`);

  assert.equal(status, 200);
  assert.equal(body.data?.id, created.id);
  assert.equal(body.data?.role, 'ADMIN');
});

test('RED10 — usuário removido do banco após a emissão do token retorna 401', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  // Remove o usuário do banco
  await AppDataSource.query('DELETE FROM users WHERE id = ?', [created.id]);

  const { status, body } = await getMe(`Bearer ${token}`);

  assert.equal(status, 401);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 401);
});

test('RED12 — consulta ao próprio perfil é idempotente e estritamente read-only', async () => {
  const created = await registerUser(validUser);
  const [initialUser] = await usersByEmail(validUser.email);
  const initialCount = (await AppDataSource.query('SELECT COUNT(*) as total FROM users'))[0].total;
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  // Múltiplas requisições (válidas e inválidas) com validação de status HTTP
  const resValid1 = await getMe(`Bearer ${token}`);
  assert.equal(resValid1.status, 200);

  const resValid2 = await getMe(`Bearer ${token}`);
  assert.equal(resValid2.status, 200);

  const resNoAuth = await getMe();
  assert.equal(resNoAuth.status, 401);

  const resBadToken = await getMe('Bearer invalido');
  assert.equal(resBadToken.status, 401);

  const finalCount = (await AppDataSource.query('SELECT COUNT(*) as total FROM users'))[0].total;
  assert.equal(finalCount, initialCount, 'Contagem de usuários não pode mudar');

  const [finalUser] = await usersByEmail(validUser.email);
  assert.equal(finalUser.password_hash, initialUser.password_hash, 'Hash de senha não pode ser alterado');
  assert.equal(finalUser.role, initialUser.role, 'Papel não pode ser alterado');
  assert.equal(finalUser.name, initialUser.name);
});

test('RED01 / falha de configuração de JWT_SECRET ausente retorna 500 sem vazar dados', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  const originalSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    const { status, body } = await getMe(`Bearer ${token}`);
    assert.equal(status, 500);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 500);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes(TEST_JWT_SECRET));
  } finally {
    process.env.JWT_SECRET = originalSecret;
  }
});

test('RED02 — configuração JWT_SECRET com tamanho insuficiente retorna 500', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'curto';

  try {
    const { status, body } = await getMe(`Bearer ${token}`);
    assert.equal(status, 500);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 500);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes(TEST_JWT_SECRET));
    assert.ok(!serialized.includes('curto'));
  } finally {
    process.env.JWT_SECRET = originalSecret;
  }
});

test('RED05 — headers Authorization físicos duplicados retornam 401', async () => {
  const created = await registerUser(validUser);
  const validToken = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);
  const invalidToken = 'token.invalido.aleatorio';

  const scenarios: [string, [string, string][]][] = [
    [
      'primeiro válido, segundo inválido',
      [
        ['Authorization', `Bearer ${validToken}`],
        ['Authorization', `Bearer ${invalidToken}`],
      ],
    ],
    [
      'primeiro inválido, segundo válido',
      [
        ['Authorization', `Bearer ${invalidToken}`],
        ['Authorization', `Bearer ${validToken}`],
      ],
    ],
    [
      'dois válidos',
      [
        ['Authorization', `Bearer ${validToken}`],
        ['Authorization', `Bearer ${validToken}`],
      ],
    ],
    [
      'capitalizações diferentes (Authorization e authorization)',
      [
        ['Authorization', `Bearer ${validToken}`],
        ['authorization', `Bearer ${validToken}`],
      ],
    ],
  ];

  for (const [description, headers] of scenarios) {
    const { status, body } = await getMeRaw(headers);
    assert.equal(status, 401, `Cenário "${description}" deveria retornar 401`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 401);
  }
});

test('RED06 — header único válido via node:http retorna 200', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  const { status, body } = await getMeRaw([['Authorization', `Bearer ${token}`]]);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.id, created.id);
  assert.equal(body.data?.email, validUser.email);
});

test('RED07 — variações inválidas de espaços e separadores retornam 401', async () => {
  const created = await registerUser(validUser);
  const token = generateToken({ sub: String(created.id) }, TEST_JWT_SECRET);

  const whitespaceCases: [string, string][] = [
    ['dois espaços entre Bearer e o token', `Bearer  ${token}`],
    ['tab entre Bearer e o token', `Bearer\t${token}`],
    ['apenas Bearer sem token', 'Bearer'],
    ['dois tokens separados por vírgula e espaço', `Bearer ${token}, Bearer ${token}`],
  ];

  for (const [label, headerVal] of whitespaceCases) {
    const { status, body } = await getMeRaw([['Authorization', headerVal]]);
    assert.equal(status, 401, `Variação "${label}" deveria retornar 401 mas retornou ${status}`);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error?.code, 401);
  }
});
