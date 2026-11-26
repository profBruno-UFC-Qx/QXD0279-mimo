import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express, { Router } from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-error-handler-json-test-'));
const dbPath = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_DB_PATH = dbPath;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';

const { AppDataSource } = await import('../data-source.js');
const { apiRouter } = await import('../routes/index.js');
const { errorHandler } = await import('../middlewares/error-handler.js');

type ApiBody = {
  success: boolean;
  data: any;
  error?: { code: number; details: string } | null;
};

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

before(async () => {
  assert.equal(AppDataSource.options.database, dbPath, 'testes nunca devem usar o SQLite de desenvolvimento');
  await AppDataSource.initialize();

  const app = express();
  app.use(express.json());

  const testRouter = Router();
  testRouter.get('/trigger-generic-syntax-error', () => {
    throw new SyntaxError('Erro sintático interno não originado do parser');
  });
  testRouter.get('/trigger-generic-error', () => {
    throw new Error('Falha inesperada no servidor');
  });
  testRouter.get('/trigger-fake-status-error', () => {
    const fakeErr = new Error('Erro com status forjado') as Error & { status: number };
    fakeErr.status = 400;
    throw fakeErr;
  });
  testRouter.get('/trigger-valid-parse-error', () => {
    const parseErr = new SyntaxError('Unexpected token') as SyntaxError & {
      type: string;
      status: number;
      statusCode: number;
    };
    parseErr.type = 'entity.parse.failed';
    parseErr.status = 400;
    parseErr.statusCode = 400;
    throw parseErr;
  });

  app.use('/test-errors', testRouter);
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

async function postRaw(endpoint: string, rawBody: string): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

test('POST /api/auth/register rejeita JSON malformado com HTTP 400 do errorHandler atual sem criar usuário', async () => {
  const initialCount = (await AppDataSource.query('SELECT COUNT(*) as count FROM users'))[0].count;

  const { status, body } = await postRaw('/api/auth/register', '{"name":');

  assert.equal(status, 400, 'JSON malformado no registro retorna 400 do errorHandler');
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);
  assert.equal(body.error?.details, 'O corpo da requisição contém JSON inválido.');

  const finalCount = (await AppDataSource.query('SELECT COUNT(*) as count FROM users'))[0].count;
  assert.equal(finalCount, initialCount, 'Nenhum usuário deve ser inserido');
});

test('POST /api/auth/register rejeita JSON primitivo (null) com HTTP 400 do errorHandler atual sem criar usuário', async () => {
  const initialCount = (await AppDataSource.query('SELECT COUNT(*) as count FROM users'))[0].count;

  const { status, body } = await postRaw('/api/auth/register', 'null');

  assert.equal(status, 400, 'JSON primitivo no registro retorna 400 do errorHandler');
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);
  assert.equal(body.error?.details, 'O corpo da requisição contém JSON inválido.');

  const finalCount = (await AppDataSource.query('SELECT COUNT(*) as count FROM users'))[0].count;
  assert.equal(finalCount, initialCount);
});

test('POST /api/auth/login rejeita JSON malformado com HTTP 400 do errorHandler atual sem vazar segredos', async () => {
  const { status, body } = await postRaw('/api/auth/login', '{"email":');

  assert.equal(status, 400, 'JSON malformado no login retorna 400 do errorHandler');
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);
  assert.equal(body.error?.details, 'O corpo da requisição contém JSON inválido.');
  assert.equal(JSON.stringify(body).includes('password'), false);
});

test('POST /api/auth/login rejeita JSON primitivo (123) com HTTP 400 do errorHandler atual sem vazar segredos', async () => {
  const { status, body } = await postRaw('/api/auth/login', '123');

  assert.equal(status, 400, 'JSON primitivo no login retorna 400 do errorHandler');
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);
  assert.equal(body.error?.details, 'O corpo da requisição contém JSON inválido.');
});

test('classificação: erro de parsing com type entity.parse.failed retorna HTTP 400', async () => {
  const res = await fetch(`${baseUrl}/test-errors/trigger-valid-parse-error`);
  const body = (await res.json()) as ApiBody;

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 400);
  assert.equal(body.error?.details, 'O corpo da requisição contém JSON inválido.');
});

test('classificação: SyntaxError genérico sem entity.parse.failed retorna HTTP 500', async () => {
  const res = await fetch(`${baseUrl}/test-errors/trigger-generic-syntax-error`);
  const body = (await res.json()) as ApiBody;

  assert.equal(res.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 500);
  assert.equal(body.error?.details, 'Ocorreu um erro interno.');
});

test('classificação: erro genérico retorna HTTP 500', async () => {
  const res = await fetch(`${baseUrl}/test-errors/trigger-generic-error`);
  const body = (await res.json()) as ApiBody;

  assert.equal(res.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 500);
  assert.equal(body.error?.details, 'Ocorreu um erro interno.');
});

test('classificação: erro com status 400 forjado sem type entity.parse.failed retorna HTTP 500', async () => {
  const res = await fetch(`${baseUrl}/test-errors/trigger-fake-status-error`);
  const body = (await res.json()) as ApiBody;

  assert.equal(res.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error?.code, 500);
  assert.equal(body.error?.details, 'Ocorreu um erro interno.');
});
