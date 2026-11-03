import { HttpError } from '../middlewares/http-error.js';
import { findUserById } from '../repository/user.repository.js';
import type { PublicUser } from './auth.service.js';

export async function getUserProfile(userId: number): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(401, 'Usuário não encontrado.');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
