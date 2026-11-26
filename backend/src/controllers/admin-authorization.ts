import type { Response } from 'express';
import { HttpError } from '../middlewares/http-error.js';
import { UserRole } from '../models/enums.js';
import { findUserById } from '../repository/user.repository.js';

export interface AdminIdentity {
  id: number;
  role: UserRole.ADMIN | UserRole.SUPERADMIN;
}

export async function requireAdmin(res: Response): Promise<AdminIdentity> {
  const auth = res.locals.auth as { userId?: unknown } | undefined;
  const userId = auth?.userId;

  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new HttpError(401, 'Identidade autenticada inválida.');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(401, 'Usuário não encontrado ou inativo.');
  }

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN) {
    throw new HttpError(403, 'Acesso restrito a administradores.');
  }

  return { id: user.id, role: user.role };
}
