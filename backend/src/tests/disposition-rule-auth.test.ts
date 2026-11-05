import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-disposition-auth-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { startTestApp } = await import('./support/admin-auth-test-app.js');
const { DispositionRule } = await import('../models/disposition-rule.js');
const { DispositionType, UserRole } = await import('../models/enums.js');

let app: Awaited<ReturnType<typeof startTestApp>>;

function ruleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { days: 30, destination: DispositionType.DONATED, ...overrides };
}

async function createRule(createdBy: number, overrides: Record<string, unknown> = {}): Promise<any> {
  const repository = app.dataSource.getRepository(DispositionRule);
  return repository.save(repository.create({
    days: 30,
    destination: DispositionType.DONATED,
    active: true,
    locked: false,
    createdBy,
    ...overrides,
  }));
}

async function countRules(): Promise<number> {
  const rows = await app.dataSource.query('SELECT COUNT(*) AS count FROM disposition_rules');
  return Number(rows[0].count);
}

const protectedRoutes = [
  { method: 'GET', path: '/api/disposition-rules' },
  { method: 'GET', path: '/api/disposition-rules/1' },
  { method: 'POST', path: '/api/disposition-rules', body: () => ruleBody() },
  { method: 'PATCH', path: '/api/disposition-rules/1', body: () => ({ days: 45 }) },
  { method: 'DELETE', path: '/api/disposition-rules/1' },
] as const;

async function expectProtectedRoutes(token: string | undefined, expectedStatus: number): Promise<void> {
  for (const route of protectedRoutes) {
    const body = 'body' in route ? route.body() : undefined;
    const response = await app.request(route.method, route.path, token, body);
    assert.equal(
      response.status,
      expectedStatus,
      `${route.method} ${route.path} deveria retornar ${expectedStatus}`,
    );
  }
}

async function exerciseAllowed(token: string, userId: number): Promise<void> {
  const created = await app.request<any>('POST', '/api/disposition-rules', token, ruleBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.data.createdBy, userId);

  const id = created.body.data.id;
  const rows = await app.dataSource.query('SELECT created_by FROM disposition_rules WHERE id = ?', [id]);
  assert.equal(Number(rows[0].created_by), userId);

  const list = await app.request('GET', '/api/disposition-rules', token);
  assert.equal(list.status, 200);

  const detail = await app.request('GET', `/api/disposition-rules/${id}`, token);
  assert.equal(detail.status, 200);

  const updated = await app.request('PATCH', `/api/disposition-rules/${id}`, token, { days: 45 });
  assert.equal(updated.status, 200);

  const removed = await app.request('DELETE', `/api/disposition-rules/${id}`, token);
  assert.equal(removed.status, 204);

  const afterDelete = await app.request('GET', `/api/disposition-rules/${id}`, token);
  assert.equal(afterDelete.status, 404);
}

before(async () => {
  app = await startTestApp();
  assert.equal(app.dataSource.options.database, dbPath, 'teste nunca deve usar o SQLite de desenvolvimento');
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B01 - sem JWT todas as rotas de regras retornam 401', async () => {
  await expectProtectedRoutes(undefined, 401);
});

test('B02 - JWT malformado retorna 401 em todas as rotas de regras', async () => {
  await expectProtectedRoutes('not-a-valid-jwt', 401);
});

test('B03 - JWT expirado retorna 401 em todas as rotas de regras', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const expired = app.tokenFor(admin, {
    nowSeconds: Math.floor(Date.now() / 1000) - 120,
    expiresInSeconds: 30,
  });
  await expectProtectedRoutes(expired, 401);
});

test('B04 - USER autenticado recebe 403 em todas as rotas de regras', async () => {
  const user = await app.createUser(UserRole.USER);
  await expectProtectedRoutes(app.tokenFor(user), 403);
});

test('B05 - ADMIN acessa todas as rotas de regras', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  await exerciseAllowed(app.tokenFor(admin), admin.id);
});

test('B06 - SUPERADMIN acessa todas as rotas de regras', async () => {
  const superadmin = await app.createUser(UserRole.SUPERADMIN);
  await exerciseAllowed(app.tokenFor(superadmin), superadmin.id);
});

test('B07 - ADMIN removido do banco perde acesso imediatamente', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('DELETE FROM users WHERE id = ?', [admin.id]);

  const response = await app.request('GET', '/api/disposition-rules', token);
  assert.equal(response.status, 401);
});

test('B08 - ADMIN rebaixado para USER perde acesso imediatamente', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('UPDATE users SET role = ? WHERE id = ?', [UserRole.USER, admin.id]);

  const response = await app.request('GET', '/api/disposition-rules', token);
  assert.equal(response.status, 403);
});

test('B09 - createdBy vem exclusivamente da identidade autenticada', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const created = await app.request<any>('POST', '/api/disposition-rules', app.tokenFor(admin), ruleBody());

  assert.equal(created.status, 201);
  assert.equal(created.body.data.createdBy, admin.id);

  const rows = await app.dataSource.query('SELECT created_by FROM disposition_rules WHERE id = ?', [created.body.data.id]);
  assert.equal(Number(rows[0].created_by), admin.id);
});

test('B10 - createdBy falsificado no body nao cria regra', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const other = await app.createUser(UserRole.ADMIN);
  const beforeCount = await countRules();

  const response = await app.request('POST', '/api/disposition-rules', app.tokenFor(admin), ruleBody({
    createdBy: other.id,
  }));

  assert.equal(response.status, 400);
  assert.equal(await countRules(), beforeCount);
});

test('B11 - ADMIN nao pode alterar o campo locked', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const rule = await createRule(admin.id);

  const response = await app.request('PATCH', `/api/disposition-rules/${rule.id}`, app.tokenFor(admin), {
    locked: false,
  });

  assert.equal(response.status, 403);
  const rows = await app.dataSource.query('SELECT locked FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Boolean(rows[0].locked), false);
});

test('B12 - ADMIN nao pode modificar regra travada', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const rule = await createRule(admin.id, { locked: true, days: 30 });

  const response = await app.request('PATCH', `/api/disposition-rules/${rule.id}`, app.tokenFor(admin), {
    days: 60,
  });

  assert.equal(response.status, 403);
  const rows = await app.dataSource.query('SELECT days, locked FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Number(rows[0].days), 30);
  assert.equal(Boolean(rows[0].locked), true);
});

test('B13 - ADMIN nao pode excluir regra travada', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const rule = await createRule(admin.id, { locked: true });

  const response = await app.request('DELETE', `/api/disposition-rules/${rule.id}`, app.tokenFor(admin));

  assert.equal(response.status, 403);
  const rows = await app.dataSource.query('SELECT COUNT(*) AS count FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Number(rows[0].count), 1);
});

test('B14 - SUPERADMIN modifica e exclui regra travada', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const superadmin = await app.createUser(UserRole.SUPERADMIN);
  const rule = await createRule(admin.id, { locked: true, days: 30 });

  const updated = await app.request('PATCH', `/api/disposition-rules/${rule.id}`, app.tokenFor(superadmin), {
    days: 75,
  });
  assert.equal(updated.status, 200);

  const rows = await app.dataSource.query('SELECT days, locked FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Number(rows[0].days), 75);
  assert.equal(Boolean(rows[0].locked), true);

  const removed = await app.request('DELETE', `/api/disposition-rules/${rule.id}`, app.tokenFor(superadmin));
  assert.equal(removed.status, 204);
});

test('B15 - atualizacoes concorrentes de ADMIN nao contornam locked', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  const rule = await createRule(admin.id, { locked: true, days: 30 });

  const [first, second] = await Promise.all([
    app.request('PATCH', `/api/disposition-rules/${rule.id}`, token, { days: 40 }),
    app.request('PATCH', `/api/disposition-rules/${rule.id}`, token, { days: 50 }),
  ]);

  assert.equal(first.status, 403);
  assert.equal(second.status, 403);
  const rows = await app.dataSource.query('SELECT days, locked FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Number(rows[0].days), 30);
  assert.equal(Boolean(rows[0].locked), true);
});

test('B16 - operacoes rejeitadas nao alteram o estado da regra', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const rule = await createRule(admin.id, { locked: true, days: 30 });

  await app.request('PATCH', `/api/disposition-rules/${rule.id}`, app.tokenFor(admin), { days: 99 });
  await app.request('DELETE', `/api/disposition-rules/${rule.id}`, app.tokenFor(admin));

  const rows = await app.dataSource.query('SELECT days, active, locked FROM disposition_rules WHERE id = ?', [rule.id]);
  assert.equal(Number(rows[0].days), 30);
  assert.equal(Boolean(rows[0].active), true);
  assert.equal(Boolean(rows[0].locked), true);
});
