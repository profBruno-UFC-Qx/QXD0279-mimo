import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../shared/password.js';

const HASH_FORMAT = /^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/;

test('hash usa formato scrypt:<salt>:<key> e cabe em passwordHash (60-120)', async () => {
  const hash = await hashPassword('SenhaForte123!');

  assert.match(hash, HASH_FORMAT);
  assert.ok(hash.length >= 60 && hash.length <= 120);
  assert.ok(!hash.includes('SenhaForte123!'));
});

test('senha correta é aceita e senha incorreta é rejeitada', async () => {
  const hash = await hashPassword('SenhaForte123!');

  assert.equal(await verifyPassword('SenhaForte123!', hash), true);
  assert.equal(await verifyPassword('senhaforte123!', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('mesma senha gera salts e hashes diferentes', async () => {
  const [a, b] = await Promise.all([hashPassword('SenhaForte123!'), hashPassword('SenhaForte123!')]);

  assert.notEqual(a.split(':')[1], b.split(':')[1]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('SenhaForte123!', b), true);
});

test('hash malformado nunca autentica', async () => {
  const valid = await hashPassword('SenhaForte123!');
  const [, salt, key] = valid.split(':');
  const malformed = [
    '',
    'SenhaForte123!',
    `bcrypt:${salt}:${key}`,
    `scrypt:${salt}`,
    `scrypt:${salt}:${key}:extra`,
    `scrypt:${salt.slice(2)}:${key}`,
    `scrypt:${salt}:${key.slice(2)}`,
    `scrypt:${salt}:${'z'.repeat(64)}`,
    `scrypt:${salt.toUpperCase()}:${key.toUpperCase()}`,
  ];

  for (const stored of malformed) {
    assert.equal(await verifyPassword('SenhaForte123!', stored), false, `aceitou: ${stored}`);
  }
});

