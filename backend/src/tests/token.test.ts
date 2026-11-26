import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { generateToken, verifyToken } from '../shared/token.js';

const VALID_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-para-hs256!';
const SHORT_SECRET = 'segredo-curto';

// Helper para gerar tokens assinados com claims arbitrários para testes adversariais
function signAdversarialToken(
  header: unknown,
  payload: unknown,
  secret = VALID_SECRET,
  customHeaderBase64?: string,
  customPayloadBase64?: string,
): string {
  const hEnc = customHeaderBase64 ?? Buffer.from(JSON.stringify(header)).toString('base64url');
  const pEnc = customPayloadBase64 ?? Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${hEnc}.${pEnc}`).digest('base64url');
  return `${hEnc}.${pEnc}.${sig}`;
}

test('emissão e verificação de token com segredo válido', () => {
  const token = generateToken({ sub: '123' }, VALID_SECRET);
  assert.equal(typeof token, 'string');
  assert.equal(token.split('.').length, 3);

  const payload = verifyToken(token, VALID_SECRET);
  assert.equal(payload.sub, '123');
  assert.ok(typeof payload.iat === 'number');
  assert.ok(typeof payload.exp === 'number');
  assert.equal(payload.exp - payload.iat, 3600, 'Expiração padrão deve ser de 1 hora');
});

test('rejeita segredo ausente ou com menos de 32 bytes', () => {
  assert.throws(() => generateToken({ sub: '123' }, ''), /JWT_SECRET/);
  assert.throws(() => generateToken({ sub: '123' }, SHORT_SECRET), /JWT_SECRET/);
  const token = generateToken({ sub: '123' }, VALID_SECRET);
  assert.throws(() => verifyToken(token, ''), /JWT_SECRET/);
  assert.throws(() => verifyToken(token, SHORT_SECRET), /JWT_SECRET/);
});

test('RED01 — fronteira de expiração: now === exp deve expirar o token', () => {
  const now = 1700000000;
  const token = generateToken({ sub: '123' }, VALID_SECRET, { nowSeconds: now, expiresInSeconds: 3600 });

  // 1 segundo antes da expiração: válido
  const valid = verifyToken(token, VALID_SECRET, { nowSeconds: now + 3599 });
  assert.equal(valid.sub, '123');

  // Exatamente no limite (now === exp): expirado
  assert.throws(
    () => verifyToken(token, VALID_SECRET, { nowSeconds: now + 3600 }),
    /expirado/i,
  );

  // 1 segundo após o limite: expirado
  assert.throws(
    () => verifyToken(token, VALID_SECRET, { nowSeconds: now + 3601 }),
    /expirado/i,
  );
});

test('RED — overflow na expiração em generateToken', () => {
  // Cenário 1: overflow com nowSeconds no limite de inteiro seguro
  assert.throws(
    () => generateToken({ sub: '1' }, VALID_SECRET, { nowSeconds: Number.MAX_SAFE_INTEGER, expiresInSeconds: 3600 }),
    /exp/i,
  );

  // Cenário 2: limite máximo permitido (inclusivo)
  const maxNow = Number.MAX_SAFE_INTEGER - 3600;
  const validMaxToken = generateToken({ sub: '1' }, VALID_SECRET, { nowSeconds: maxNow, expiresInSeconds: 3600 });
  const verified = verifyToken(validMaxToken, VALID_SECRET, { nowSeconds: maxNow + 100 });
  assert.equal(verified.sub, '1');
  assert.equal(verified.exp, Number.MAX_SAFE_INTEGER);

  // Cenário 3: overflow mínimo (1 acima do limite seguro)
  assert.throws(
    () => generateToken({ sub: '1' }, VALID_SECRET, { nowSeconds: Number.MAX_SAFE_INTEGER - 3599, expiresInSeconds: 3600 }),
    /exp/i,
  );
});

test('RED02 — validação rigorosa de sub na emissão e verificação', () => {
  const validSubs = ['1', '123', '9007199254740991'];
  for (const s of validSubs) {
    const t = generateToken({ sub: s }, VALID_SECRET);
    assert.equal(verifyToken(t, VALID_SECRET).sub, s);
  }

  const invalidSubs = [
    '',
    '0',
    '-1',
    '01',
    '1.5',
    '1e3',
    'abc',
    ' 1 ',
    ' 123',
    '123 ',
    '9007199254740992', // maior que MAX_SAFE_INTEGER
    '99999999999999999999',
  ];

  for (const inv of invalidSubs) {
    // Rejeição na emissão
    assert.throws(
      () => generateToken({ sub: inv }, VALID_SECRET),
      /sub/i,
      `generateToken deveria ter rejeitado sub: "${inv}"`,
    );

    // Rejeição na verificação com token assinado
    const signed = signAdversarialToken({ alg: 'HS256', typ: 'JWT' }, { sub: inv, iat: 100, exp: 200 });
    assert.throws(
      () => verifyToken(signed, VALID_SECRET, { nowSeconds: 150 }),
      /sub/i,
      `verifyToken deveria ter rejeitado sub adversarial: "${inv}"`,
    );
  }

  // @ts-expect-error teste com sub numérico
  assert.throws(() => generateToken({ sub: 123 }, VALID_SECRET), /sub/i);
});

test('RED02 — validação rigorosa de iat e exp adversariais', () => {
  const baseHeader = { alg: 'HS256', typ: 'JWT' };

  const adversarialPayloads: [string, unknown][] = [
    ['iat no futuro', { sub: '1', iat: 1000, exp: 2000 }], // now = 500 < iat
    ['iat negativo', { sub: '1', iat: -10, exp: 2000 }],
    ['iat não inteiro', { sub: '1', iat: 100.5, exp: 2000 }],
    ['iat NaN', { sub: '1', iat: 'NaN', exp: 2000 }],
    ['exp menor que iat', { sub: '1', iat: 1000, exp: 900 }],
    ['exp igual a iat', { sub: '1', iat: 1000, exp: 1000 }],
    ['exp negativo', { sub: '1', iat: -20, exp: -10 }],
    ['exp não inteiro', { sub: '1', iat: 100, exp: 200.7 }],
  ];

  for (const [desc, p] of adversarialPayloads) {
    const signed = signAdversarialToken(baseHeader, p);
    assert.throws(
      () => verifyToken(signed, VALID_SECRET, { nowSeconds: 500 }),
      /iat|exp|inválido/i,
      `Deveria ter rejeitado: ${desc}`,
    );
  }
});

test('RED03 — limite operacional de 4096 caracteres no token', () => {
  const longHeader = { alg: 'HS256', typ: 'JWT', extra: 'x'.repeat(4500) };
  const largeToken = signAdversarialToken(longHeader, { sub: '1', iat: 100, exp: 200 });
  assert.ok(largeToken.length > 4096);

  assert.throws(() => verifyToken(largeToken, VALID_SECRET), /limite|tamanho|estrutura/i);
});

test('RED03 — estrutura, segmentos vazios e codificação base64url canônica', () => {
  const valid = generateToken({ sub: '1' }, VALID_SECRET);
  const [h, p, s] = valid.split('.');

  // Segmentos faltando ou extras
  assert.throws(() => verifyToken('', VALID_SECRET), /estrutura/i);
  assert.throws(() => verifyToken(`${h}.${p}`, VALID_SECRET), /estrutura/i);
  assert.throws(() => verifyToken(`${h}.${p}.${s}.extra`, VALID_SECRET), /estrutura/i);

  // Segmentos vazios
  assert.throws(() => verifyToken(`.${p}.${s}`, VALID_SECRET), /estrutura/i);
  assert.throws(() => verifyToken(`${h}..${s}`, VALID_SECRET), /estrutura/i);
  assert.throws(() => verifyToken(`${h}.${p}.`, VALID_SECRET), /estrutura/i);

  // Padding não permitido (=)
  const padded = `${h}=.${p}.${s}`;
  assert.throws(() => verifyToken(padded, VALID_SECRET), /estrutura|base64url/i);

  // Caracteres fora do alfabeto base64url (+ ou / ou !)
  const invalidChars = `${h}+abc.${p}.${s}`;
  assert.throws(() => verifyToken(invalidChars, VALID_SECRET), /estrutura|base64url/i);

  // Assinatura com comprimento incorreto (HMAC-SHA256 tem 32 bytes -> 43 chars base64url)
  const truncatedSig = `${h}.${p}.${s.slice(0, 40)}`;
  assert.throws(() => verifyToken(truncatedSig, VALID_SECRET), /assinatura/i);
});

test('rejeita token com assinatura adulterada', () => {
  const token = generateToken({ sub: '123' }, VALID_SECRET);
  const [header, payload, sig] = token.split('.');
  // Altera um caractere no meio mantendo codificação válida de 43 caracteres
  const tamperedSig = sig.slice(0, 10) + (sig[10] === 'a' ? 'b' : 'a') + sig.slice(11);
  const tamperedToken = `${header}.${payload}.${tamperedSig}`;

  assert.throws(() => verifyToken(tamperedToken, VALID_SECRET), /assinatura inválida/i);
});

test('rejeita token com payload adulterado', () => {
  const token = generateToken({ sub: '123' }, VALID_SECRET);
  const [header, , sig] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ sub: '999', iat: 100, exp: 9999999999 })).toString('base64url');
  const tamperedToken = `${header}.${forgedPayload}.${sig}`;

  assert.throws(() => verifyToken(tamperedToken, VALID_SECRET), /assinatura inválida/i);
});

test('rejeita token com header adulterado ou algoritmo diferente de HS256', () => {
  const token = generateToken({ sub: '123' }, VALID_SECRET);
  const [, payload, sig] = token.split('.');
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.throws(() => verifyToken(`${noneHeader}.${payload}.${sig}`, VALID_SECRET), /algoritmo não suportado/i);

  const rs256Header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  assert.throws(() => verifyToken(`${rs256Header}.${payload}.${sig}`, VALID_SECRET), /algoritmo não suportado/i);
});
