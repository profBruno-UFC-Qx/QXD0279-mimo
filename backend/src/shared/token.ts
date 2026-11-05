import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface GenerateTokenOptions {
  nowSeconds?: number;
  expiresInSeconds?: number;
}

export interface VerifyTokenOptions {
  nowSeconds?: number;
}

const MIN_SECRET_BYTES = 32;
const DEFAULT_EXPIRATION_SECONDS = 3600; // 1 hora
const MAX_TOKEN_LENGTH = 4096;
const BASE64URL_SEGMENT_REGEX = /^[A-Za-z0-9_-]+$/;
const SUB_DECIMAL_REGEX = /^[1-9]\d*$/;

function validateSecret(secret?: string): string {
  if (!secret || typeof secret !== 'string') {
    throw new Error('JWT_SECRET não configurado.');
  }
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(`JWT_SECRET deve possuir pelo menos ${MIN_SECRET_BYTES} bytes UTF-8.`);
  }
  return secret;
}

function validateSub(sub: unknown): string {
  if (typeof sub !== 'string' || !SUB_DECIMAL_REGEX.test(sub)) {
    throw new Error('Claim sub deve ser uma representação decimal canônica de um inteiro positivo.');
  }
  const parsed = Number(sub);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Claim sub excede o limite de inteiro seguro do JavaScript.');
  }
  return sub;
}

function isValidBase64Url(segment: string): boolean {
  if (!segment || !BASE64URL_SEGMENT_REGEX.test(segment)) {
    return false;
  }
  try {
    const buf = Buffer.from(segment, 'base64url');
    // Verifica canonicidade: o recálculo deve ser idêntico
    return buf.toString('base64url') === segment;
  } catch {
    return false;
  }
}

export function generateToken(
  payload: { sub: string },
  secretInput?: string,
  options?: GenerateTokenOptions,
): string {
  const secret = validateSecret(secretInput ?? process.env.JWT_SECRET);
  const validSub = validateSub(payload?.sub);

  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('Timestamp iat inválido.');
  }

  const expiresIn = options?.expiresInSeconds ?? DEFAULT_EXPIRATION_SECONDS;
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new Error('Duração de expiração inválida.');
  }

  const exp = now + expiresIn;
  if (!Number.isSafeInteger(exp)) {
    throw new Error('Timestamp exp inválido.');
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload: TokenPayload = {
    sub: validSub,
    iat: now,
    exp,
  };

  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  const token = `${headerEncoded}.${payloadEncoded}.${signature}`;
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error(`Token gerado excede o limite de ${MAX_TOKEN_LENGTH} caracteres.`);
  }

  return token;
}

export function verifyToken(
  token: string,
  secretInput?: string,
  options?: VerifyTokenOptions,
): TokenPayload {
  const secret = validateSecret(secretInput ?? process.env.JWT_SECRET);

  if (!token || typeof token !== 'string') {
    throw new Error('Token com estrutura inválida.');
  }

  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error(`Token excede o limite máximo de ${MAX_TOKEN_LENGTH} caracteres.`);
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token com estrutura inválida: deve conter exatamente três segmentos.');
  }

  const [headerEncoded, payloadEncoded, signatureProvided] = parts;

  // Validação estrutural de codificação base64url canônica
  if (!isValidBase64Url(headerEncoded) || !isValidBase64Url(payloadEncoded) || !isValidBase64Url(signatureProvided)) {
    throw new Error('Token com estrutura ou codificação base64url inválida.');
  }

  // HMAC-SHA256 produz 32 bytes (256 bits) -> 43 caracteres em base64url sem padding
  if (signatureProvided.length !== 43) {
    throw new Error('Assinatura com tamanho inválido.');
  }

  // Decodifica e valida o header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerEncoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Token com estrutura de header inválida.');
  }

  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') {
    throw new Error('Token com algoritmo não suportado.');
  }

  // Verifica assinatura usando timingSafeEqual
  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  const providedBuf = Buffer.from(signatureProvided, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new Error('Assinatura inválida.');
  }

  // Decodifica e valida payload
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Token com payload inválido.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Claims obrigatórios ausentes.');
  }

  // Validação estrita de sub
  validateSub(payload.sub);

  // Validação estrita de iat e exp
  if (!Number.isSafeInteger(payload.iat) || payload.iat < 0) {
    throw new Error('Claim iat inválido: deve ser um inteiro seguro não negativo.');
  }

  if (!Number.isSafeInteger(payload.exp) || payload.exp <= 0) {
    throw new Error('Claim exp inválido: deve ser um inteiro seguro positivo.');
  }

  if (payload.exp <= payload.iat) {
    throw new Error('Token com tempo de expiração inválido: exp deve ser estritamente maior que iat.');
  }

  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now)) {
    throw new Error('Relógio informado inválido.');
  }

  if (payload.iat > now) {
    throw new Error('Claim iat inválido: emitido no futuro em relação ao relógio.');
  }

  // now >= payload.exp expira o token
  if (now >= payload.exp) {
    throw new Error('Token expirado.');
  }

  return payload;
}
