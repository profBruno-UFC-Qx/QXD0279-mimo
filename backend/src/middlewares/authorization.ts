import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './http-error.js';
import type { UserRole } from '../models/enums.js';
import { findUserById } from '../repository/user.repository.js';

export function authorize(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = res.locals.auth as { userId: number } | undefined;
    if (!auth || typeof auth.userId !== 'number' || !Number.isSafeInteger(auth.userId) || auth.userId <= 0) {
      throw new HttpError(401, 'Não autenticado.');
    }

    const user = await findUserById(auth.userId);
    if (!user) {
      throw new HttpError(401, 'Usuário não encontrado ou inativo.');
    }

    res.locals.user = user;

    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new HttpError(403, 'Acesso negado.');
    }

    next();
  };
}
