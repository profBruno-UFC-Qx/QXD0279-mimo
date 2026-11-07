import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-admin-item-auth-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { startTestApp } = await import('./support/admin-auth-test-app.js');
const { UserRole } = await import('../models/enums.js');

let app: Awaited<ReturnType<typeof startTestApp>>;
let category: any;
let building: any;

function itemBody(title: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title,
    categoryId: category.id,
    buildingId: building.id,
    foundDate: '2026-11-01',
    photos: [],
    ...overrides,
  };
}

function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random()}`;
}

async function countItemsByTitle(title: string): Promise<number> {
  const rows = await app.dataSource.query('SELECT COUNT(*) AS count FROM items WHERE title = ?', [title]);
  return Number(rows[0].count);
}

const protectedRoutes = [
  { method: 'GET', path: '/api/admin/items' },
  { method: 'GET', path: '/api/admin/items/1' },
  { method: 'GET', path: '/api/admin/items/1/possible-owners' },
  { method: 'POST', path: '/api/admin/items', body: () => itemBody(uniqueTitle('Preflight protegido')) },
  { method: 'PATCH', path: '/api/admin/items/1', body: () => ({ title: 'Tentativa' }) },
  { method: 'DELETE', path: '/api/admin/items/1' },
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
  const title = uniqueTitle('Item autorizado');
  const created = await app.request<{ id: number }>('POST', '/api/admin/items', token, itemBody(title));
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.ok(created.body.data.id > 0);

  const id = created.body.data.id;
  const rows = await app.dataSource.query('SELECT created_by FROM items WHERE id = ?', [id]);
  assert.equal(Number(rows[0].created_by), userId);

  const list = await app.request('GET', '/api/admin/items?page=1&per_page=20', token);
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);

  const detail = await app.request('GET', `/api/admin/items/${id}`, token);
  assert.equal(detail.status, 200);

  const owners = await app.request('GET', `/api/admin/items/${id}/possible-owners`, token);
  assert.equal(owners.status, 200);

  const updated = await app.request('PATCH', `/api/admin/items/${id}`, token, { title: `${title} atualizado` });
  assert.equal(updated.status, 200);

  const removed = await app.request('DELETE', `/api/admin/items/${id}`, token);
  assert.equal(removed.status, 204);

  const afterDelete = await app.request('GET', `/api/admin/items/${id}`, token);
  assert.equal(afterDelete.status, 404);
}

before(async () => {
  app = await startTestApp();
  assert.equal(app.dataSource.options.database, dbPath, 'teste nunca deve usar o SQLite de desenvolvimento');
  category = await app.createCategory();
  building = await app.createBuilding();
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('A01 - sem JWT todas as rotas administrativas de itens retornam 401', async () => {
  await expectProtectedRoutes(undefined, 401);
});

test('A02 - JWT malformado retorna 401 em todas as rotas administrativas de itens', async () => {
  await expectProtectedRoutes('not-a-valid-jwt', 401);
});

test('A03 - JWT expirado retorna 401 em todas as rotas administrativas de itens', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const expired = app.tokenFor(admin, {
    nowSeconds: Math.floor(Date.now() / 1000) - 120,
    expiresInSeconds: 30,
  });
  await expectProtectedRoutes(expired, 401);
});

test('A04 - USER autenticado recebe 403 em todas as rotas administrativas de itens', async () => {
  const user = await app.createUser(UserRole.USER);
  await expectProtectedRoutes(app.tokenFor(user), 403);
});

test('A05 - ADMIN acessa todas as rotas administrativas de itens', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  await exerciseAllowed(app.tokenFor(admin), admin.id);
});

test('A06 - SUPERADMIN acessa todas as rotas administrativas de itens', async () => {
  const superadmin = await app.createUser(UserRole.SUPERADMIN);
  await exerciseAllowed(app.tokenFor(superadmin), superadmin.id);
});

test('A07 - ADMIN removido do banco perde acesso imediatamente', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('DELETE FROM users WHERE id = ?', [admin.id]);

  const response = await app.request('GET', '/api/admin/items', token);
  assert.equal(response.status, 401);
});

test('A08 - ADMIN rebaixado para USER perde acesso imediatamente', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('UPDATE users SET role = ? WHERE id = ?', [UserRole.USER, admin.id]);

  const response = await app.request('GET', '/api/admin/items', token);
  assert.equal(response.status, 403);
});

test('A09 - createdBy vem exclusivamente da identidade autenticada', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const title = uniqueTitle('Item com proprietario autenticado');
  const created = await app.request<{ id: number }>('POST', '/api/admin/items', app.tokenFor(admin), itemBody(title));
  assert.equal(created.status, 201);

  const rows = await app.dataSource.query('SELECT created_by FROM items WHERE id = ?', [created.body.data.id]);
  assert.equal(Number(rows[0].created_by), admin.id);
});

test('A10 - createdBy falsificado no body nao altera o proprietario nem cria registro', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const other = await app.createUser(UserRole.ADMIN);
  const title = uniqueTitle('Item com createdBy falsificado');
  const response = await app.request('POST', '/api/admin/items', app.tokenFor(admin), itemBody(title, {
    createdBy: other.id,
  }));

  assert.equal(response.status, 400);
  assert.equal(await countItemsByTitle(title), 0);
});

test('A11 - nenhuma escrita ocorre quando a autorizacao falha', async () => {
  const user = await app.createUser(UserRole.USER);
  const title = uniqueTitle('Item bloqueado');
  const response = await app.request('POST', '/api/admin/items', app.tokenFor(user), itemBody(title));

  assert.equal(response.status, 403);
  assert.equal(await countItemsByTitle(title), 0);
});

test('A12 - contratos de sucesso permanecem 201, 200 e 204 conforme a operacao', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  const title = uniqueTitle('Item contrato');

  const created = await app.request('POST', '/api/admin/items', token, itemBody(title));
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);

  const id = created.body.data.id;
  const updated = await app.request('PATCH', `/api/admin/items/${id}`, token, { title: `${title} novo` });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.success, true);

  const removed = await app.request('DELETE', `/api/admin/items/${id}`, token);
  assert.equal(removed.status, 204);
});
