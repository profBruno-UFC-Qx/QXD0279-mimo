import { HttpError } from '../middlewares/http-error.js';
import { UserRole } from '../models/enums.js';
import type { User } from '../models/user.js';
import { findAdminUsers, insertAdminUser } from '../repository/admin.repository.js';
import { findUserById } from '../repository/user.repository.js';
import { hashPassword } from '../shared/password.js';
import { validateRegistrationInput, type PublicUser } from './auth.service.js';

async function requireSuperAdmin(userId: number): Promise<void> {
  const requester = await findUserById(userId);
  if (!requester) {
    throw new HttpError(401, 'Usuario nao encontrado ou inativo.');
  }
  if (requester.role !== UserRole.SUPERADMIN) {
    throw new HttpError(403, 'Acesso restrito ao superadministrador.');
  }
}

function toPublicUser(user: User): PublicUser {
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

export async function listAdmins(requesterId: number): Promise<PublicUser[]> {
  await requireSuperAdmin(requesterId);
  const admins = await findAdminUsers();
  return admins.map(toPublicUser);
}

export async function createAdmin(requesterId: number, input: unknown): Promise<PublicUser> {
  await requireSuperAdmin(requesterId);

  const body =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const data = validateRegistrationInput({
    name: body.name,
    email: body.email,
    password: body.initialPassword,
  });

  const passwordHash = await hashPassword(data.password);
  const saved = await insertAdminUser({
    name: data.name,
    email: data.email,
    passwordHash,
  });

  return toPublicUser(saved);
}
