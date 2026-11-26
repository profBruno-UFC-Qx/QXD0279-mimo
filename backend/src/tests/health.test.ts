import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startTestApp, type TestApp } from './support/admin-auth-test-app.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-health-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

let app: TestApp;

before(async () => {
  app = await startTestApp();
});

after(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('HE01 - GET /api/health retorna status healthy e database connected', async () => {
  const res = await app.request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'healthy');
  assert.equal(res.body.data.database, 'connected');
  assert.ok(res.body.data.timestamp);
});

test('HE02 - GET /api/v1/health (rota versionada) retorna status healthy e database connected', async () => {
  const res = await app.request('GET', '/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'healthy');
  assert.equal(res.body.data.database, 'connected');
});
