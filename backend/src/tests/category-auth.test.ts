import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-category-auth-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { startTestApp } = await import('./support/admin-auth-test-app.js');
const { UserRole } = await import('../models/enums.js');

let app: Awaited<ReturnType<typeof startTestApp>>;

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random()}`;
}

async function countCategoriesByName(name: string): Promise<number> {
  const rows = await app.dataSource.query('SELECT COUNT(*) AS count FROM categories WHERE name = ?', [name]);
  return Number(rows[0].count);
}

async function categoryNameById(id: number): Promise<string | undefined> {
  const rows = await app.dataSource.query('SELECT name FROM categories WHERE id = ?', [id]);
  return rows[0]?.name;
}

const protectedMutations = [
  { method: 'POST', path: '/api/categories', body: () => ({ name: uniqueName('Categoria bloqueada') }) },
  { method: 'PATCH', path: '/api/categories/999999', body: () => ({ name: uniqueName('Categoria bloqueada') }) },
  { method: 'DELETE', path: '/api/categories/999999' },
] as const;

async function expectProtectedMutations(token: string | undefined, expectedStatus: number): Promise<void> {
  for (const route of protectedMutations) {
    const body = 'body' in route ? route.body() : undefined;
    const response = await app.request(route.method, route.path, token, body);
    assert.equal(
      response.status,
      expectedStatus,
      `${route.method} ${route.path} deveria retornar ${expectedStatus}`,
    );
  }
}

async function exerciseAllowed(token: string): Promise<void> {
  const originalName = uniqueName('Categoria autorizada');
  const updatedName = uniqueName('Categoria renomeada');

  const created = await app.request<any>('POST', '/api/categories', token, { name: originalName });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);

  const id = created.body.data.id;
  const updated = await app.request('PATCH', `/api/categories/${id}`, token, { name: updatedName });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, updatedName);

  const removed = await app.request('DELETE', `/api/categories/${id}`, token);
  assert.equal(removed.status, 204);
}

before(async () => {
  app = await startTestApp();
  assert.equal(app.dataSource.options.database, dbPath, 'teste nunca deve usar o SQLite de desenvolvimento');
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('C01 - visitante nao cria categoria', async () => {
  const name = uniqueName('Categoria anonima');
  const response = await app.request('POST', '/api/categories', undefined, { name });

  assert.equal(response.status, 401);
  assert.equal(await countCategoriesByName(name), 0);
});

test('C02 - visitante nao altera nem exclui categoria existente', async () => {
  const category = await app.createCategory();

  const patched = await app.request('PATCH', `/api/categories/${category.id}`, undefined, {
    name: uniqueName('Alteracao anonima'),
  });
  assert.equal(patched.status, 401);
  assert.equal(await categoryNameById(category.id), category.name);

  const removed = await app.request('DELETE', `/api/categories/${category.id}`, undefined);
  assert.equal(removed.status, 401);
  assert.equal(await categoryNameById(category.id), category.name);
});

test('C03 - USER nao executa mutacoes de categorias', async () => {
  const user = await app.createUser(UserRole.USER);
  const token = app.tokenFor(user);
  const category = await app.createCategory();

  const created = await app.request('POST', '/api/categories', token, { name: uniqueName('Categoria de USER') });
  assert.equal(created.status, 403);

  const updated = await app.request('PATCH', `/api/categories/${category.id}`, token, {
    name: uniqueName('Alteracao de USER'),
  });
  assert.equal(updated.status, 403);

  const removed = await app.request('DELETE', `/api/categories/${category.id}`, token);
  assert.equal(removed.status, 403);
  assert.equal(await categoryNameById(category.id), category.name);
});

test('C04 - JWT malformado nao permite persistencia de categoria', async () => {
  const name = uniqueName('Categoria com JWT invalido');
  const response = await app.request('POST', '/api/categories', 'not-a-valid-jwt', { name });

  assert.equal(response.status, 401);
  assert.equal(await countCategoriesByName(name), 0);
});

test('C05 - ADMIN executa as mutacoes autorizadas de categorias', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  await exerciseAllowed(app.tokenFor(admin));
});

test('C06 - SUPERADMIN executa as mutacoes autorizadas de categorias', async () => {
  const superadmin = await app.createUser(UserRole.SUPERADMIN);
  await exerciseAllowed(app.tokenFor(superadmin));
});

test('C07 - listagem de categorias continua publica', async () => {
  const response = await app.request('GET', '/api/categories');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
});

test('C08 - requisicao rejeitada nao modifica registros', async () => {
  const category = await app.createCategory();
  const blockedName = uniqueName('Categoria rejeitada');
  const response = await app.request('POST', '/api/categories', undefined, { name: blockedName });

  assert.equal(response.status, 401);
  assert.equal(await countCategoriesByName(blockedName), 0);
  assert.equal(await categoryNameById(category.id), category.name);
});

test('C09 - rebaixamento de papel remove o privilegio de categoria', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('UPDATE users SET role = ? WHERE id = ?', [UserRole.USER, admin.id]);

  const response = await app.request('POST', '/api/categories', token, { name: uniqueName('Categoria rebaixada') });
  assert.equal(response.status, 403);
});

test('C10 - usuario removido nao mantem acesso as mutacoes de categoria', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('DELETE FROM users WHERE id = ?', [admin.id]);

  const response = await app.request('POST', '/api/categories', token, { name: uniqueName('Categoria removida') });
  assert.equal(response.status, 401);
});

test('C11 - sem JWT e JWT expirado retornam 401 nas mutacoes de categoria', async () => {
  await expectProtectedMutations(undefined, 401);

  const admin = await app.createUser(UserRole.ADMIN);
  const expired = app.tokenFor(admin, {
    nowSeconds: Math.floor(Date.now() / 1000) - 120,
    expiresInSeconds: 30,
  });
  await expectProtectedMutations(expired, 401);
});

test('C12 - USER recebe 403 nas tres mutacoes de categoria', async () => {
  const user = await app.createUser(UserRole.USER);
  await expectProtectedMutations(app.tokenFor(user), 403);
});
