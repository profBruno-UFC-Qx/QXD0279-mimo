import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './http-error.js';
import { verifyToken, type TokenPayload } from '../shared/token.js';
import { findUserById } from '../repository/user.repository.js';

export interface AuthenticatedIdentity {
  userId: number;
}

const MIN_JWT_SECRET_BYTES = 32;
const BEARER_AUTH_REGEX = /^[Bb][Ee][Aa][Rr][Ee][Rr] ([^\s]+)$/;

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 1. Inspeciona req.rawHeaders para verificar duplicidade física do cabeçalho Authorization
  let authCount = 0;
  let rawHeaderValue: string | undefined;

  if (Array.isArray(req.rawHeaders) && req.rawHeaders.length > 0) {
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i]?.toLowerCase() === 'authorization') {
        authCount++;
        rawHeaderValue = req.rawHeaders[i + 1];
      }
    }
  } else {
    const header = req.header('Authorization');
    if (header) {
      authCount = 1;
      rawHeaderValue = header;
    }
  }

  if (authCount === 0 || !rawHeaderValue) {
    throw new HttpError(401, 'Credencial de autenticação não fornecida.');
  }

  if (authCount > 1) {
    throw new HttpError(401, 'Múltiplos cabeçalhos de autorização não permitidos.');
  }

  // 2. Validação sintática canônica: "Bearer" (case-insensitive) + exatamente 1 espaço + token
  const match = BEARER_AUTH_REGEX.exec(rawHeaderValue);
  if (!match) {
    throw new HttpError(401, 'Formato de cabeçalho Authorization inválido.');
  }

  const token = match[1];

  // 3. Validação robusta e estruturada da configuração de JWT sem depender de mensagens de exceção
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new HttpError(500, 'Configuração interna de autenticação inválida.');
  }

  // 4. Verificação do token (qualquer falha decorre de token inválido, expirado ou com assinatura incorreta)
  let payload: TokenPayload;
  try {
    payload = verifyToken(token, secret);
  } catch {
    throw new HttpError(401, 'Token de autenticação inválido ou expirado.');
  }

  // 5. Validação da identidade sub contida no token
  const userId = Number(payload.sub);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new HttpError(401, 'Identidade do token inválida.');
  }

  // 6. Confirmação da existência do usuário no banco de dados
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(401, 'Usuário não encontrado ou inativo.');
  }

  res.locals.auth = {
    userId: user.id,
  } satisfies AuthenticatedIdentity;

  next();
}
