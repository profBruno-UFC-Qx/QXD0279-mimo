import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-building-auth-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { startTestApp } = await import('./support/admin-auth-test-app.js');
const { UserRole } = await import('../models/enums.js');

let app: Awaited<ReturnType<typeof startTestApp>>;

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random()}`;
}

function buildingBody(name: string): Record<string, unknown> {
  return {
    name,
    address: 'Rua de Teste, 123',
    pickupPoint: 'Recepcao',
    serviceHours: 'Segunda a sexta, 9h as 17h',
  };
}

async function countBuildingsByName(name: string): Promise<number> {
  const rows = await app.dataSource.query('SELECT COUNT(*) AS count FROM buildings WHERE name = ?', [name]);
  return Number(rows[0].count);
}

async function buildingNameById(id: number): Promise<string | undefined> {
  const rows = await app.dataSource.query('SELECT name FROM buildings WHERE id = ?', [id]);
  return rows[0]?.name;
}

const protectedMutations = [
  { method: 'POST', path: '/api/buildings', body: () => buildingBody(uniqueName('Predio bloqueado')) },
  { method: 'PATCH', path: '/api/buildings/999999', body: () => ({ name: uniqueName('Predio bloqueado') }) },
  { method: 'DELETE', path: '/api/buildings/999999' },
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
  const originalName = uniqueName('Predio autorizado');
  const updatedName = uniqueName('Predio renomeado');

  const created = await app.request<any>('POST', '/api/buildings', token, buildingBody(originalName));
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);

  const id = created.body.data.id;
  const updated = await app.request('PATCH', `/api/buildings/${id}`, token, { name: updatedName });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, updatedName);

  const removed = await app.request('DELETE', `/api/buildings/${id}`, token);
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

test('D01 - visitante nao cria predio', async () => {
  const name = uniqueName('Predio anonimo');
  const response = await app.request('POST', '/api/buildings', undefined, buildingBody(name));

  assert.equal(response.status, 401);
  assert.equal(await countBuildingsByName(name), 0);
});

test('D02 - visitante nao altera nem exclui predio existente', async () => {
  const building = await app.createBuilding();

  const patched = await app.request('PATCH', `/api/buildings/${building.id}`, undefined, {
    name: uniqueName('Alteracao anonima'),
  });
  assert.equal(patched.status, 401);
  assert.equal(await buildingNameById(building.id), building.name);

  const removed = await app.request('DELETE', `/api/buildings/${building.id}`, undefined);
  assert.equal(removed.status, 401);
  assert.equal(await buildingNameById(building.id), building.name);
});

test('D03 - USER nao executa mutacoes de predios', async () => {
  const user = await app.createUser(UserRole.USER);
  const token = app.tokenFor(user);
  const building = await app.createBuilding();

  const created = await app.request('POST', '/api/buildings', token, buildingBody(uniqueName('Predio de USER')));
  assert.equal(created.status, 403);

  const updated = await app.request('PATCH', `/api/buildings/${building.id}`, token, {
    name: uniqueName('Alteracao de USER'),
  });
  assert.equal(updated.status, 403);

  const removed = await app.request('DELETE', `/api/buildings/${building.id}`, token);
  assert.equal(removed.status, 403);
  assert.equal(await buildingNameById(building.id), building.name);
});

test('D04 - JWT malformado nao permite persistencia de predio', async () => {
  const name = uniqueName('Predio com JWT invalido');
  const response = await app.request('POST', '/api/buildings', 'not-a-valid-jwt', buildingBody(name));

  assert.equal(response.status, 401);
  assert.equal(await countBuildingsByName(name), 0);
});

test('D05 - ADMIN executa as mutacoes autorizadas de predios', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  await exerciseAllowed(app.tokenFor(admin));
});

test('D06 - SUPERADMIN executa as mutacoes autorizadas de predios', async () => {
  const superadmin = await app.createUser(UserRole.SUPERADMIN);
  await exerciseAllowed(app.tokenFor(superadmin));
});

test('D07 - consultas publicas de predios continuam funcionando', async () => {
  const building = await app.createBuilding();

  const list = await app.request('GET', '/api/buildings');
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);
  assert.ok(Array.isArray(list.body.data));

  const detail = await app.request('GET', `/api/buildings/${building.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.id, building.id);
});

test('D08 - requisicao rejeitada nao modifica registros de predios', async () => {
  const building = await app.createBuilding();
  const blockedName = uniqueName('Predio rejeitado');
  const response = await app.request('POST', '/api/buildings', undefined, buildingBody(blockedName));

  assert.equal(response.status, 401);
  assert.equal(await countBuildingsByName(blockedName), 0);
  assert.equal(await buildingNameById(building.id), building.name);
});

test('D09 - rebaixamento de papel remove o privilegio de predio', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('UPDATE users SET role = ? WHERE id = ?', [UserRole.USER, admin.id]);

  const response = await app.request('POST', '/api/buildings', token, buildingBody(uniqueName('Predio rebaixado')));
  assert.equal(response.status, 403);
});

test('D10 - usuario removido nao mantem acesso as mutacoes de predio', async () => {
  const admin = await app.createUser(UserRole.ADMIN);
  const token = app.tokenFor(admin);
  await app.dataSource.query('DELETE FROM users WHERE id = ?', [admin.id]);

  const response = await app.request('POST', '/api/buildings', token, buildingBody(uniqueName('Predio removido')));
  assert.equal(response.status, 401);
});

test('D11 - sem JWT e JWT expirado retornam 401 nas mutacoes de predio', async () => {
  await expectProtectedMutations(undefined, 401);

  const admin = await app.createUser(UserRole.ADMIN);
  const expired = app.tokenFor(admin, {
    nowSeconds: Math.floor(Date.now() / 1000) - 120,
    expiresInSeconds: 30,
  });
  await expectProtectedMutations(expired, 401);
});

test('D12 - USER recebe 403 nas tres mutacoes de predio', async () => {
  const user = await app.createUser(UserRole.USER);
  await expectProtectedMutations(app.tokenFor(user), 403);
});
