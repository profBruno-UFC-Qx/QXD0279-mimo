import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HASH_FORMAT = /^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/;

// Formato: scrypt:<salt 16 bytes hex>:<chave 32 bytes hex> (104 caracteres).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = HASH_FORMAT.exec(stored);
  if (!match) return false;

  const key = await scryptAsync(password, Buffer.from(match[1], 'hex'), KEY_BYTES);
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
