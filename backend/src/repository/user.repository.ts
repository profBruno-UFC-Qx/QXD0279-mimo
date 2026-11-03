import { AppDataSource } from '../data-source.js';
import { UserRole } from '../models/enums.js';
import { User } from '../models/user.js';

export interface NewUserData {
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
}

export interface ProfilePatch {
  name?: string;
  phone?: string | null;
  passwordHash?: string;
}

export function buildUser(data: NewUserData): User {
  return AppDataSource.getRepository(User).create({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    phone: data.phone,
    role: UserRole.USER,
  });
}

// Plain INSERT (no save() transaction): the UNIQUE index on email is the final guard against duplicates.
export async function insertUser(user: User): Promise<User> {
  await AppDataSource.getRepository(User).insert(user);
  return user;
}

// Busca segura de usuário com passwordHash explicitamente selecionado
export async function findUserWithPasswordByEmail(email: string): Promise<User | null> {
  return AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .addSelect('user.passwordHash')
    .where('user.email = :email', { email })
    .getOne();
}

// Busca de usuário por ID sem carregar credenciais
export async function findUserById(id: number): Promise<User | null> {
  return AppDataSource.getRepository(User).findOneBy({ id });
}

// Atualização parcial atômica exclusivamente dos campos fornecidos
export async function updateUserProfileFields(
  userId: number,
  fields: ProfilePatch,
): Promise<number> {
  const updateData: Record<string, unknown> = {};

  if (fields.name !== undefined) {
    updateData.name = fields.name;
  }
  if (fields.phone !== undefined) {
    updateData.phone = fields.phone;
  }
  if (fields.passwordHash !== undefined) {
    updateData.passwordHash = fields.passwordHash;
  }

  if (Object.keys(updateData).length === 0) {
    return 0;
  }

  const result = await AppDataSource.getRepository(User)
    .createQueryBuilder()
    .update(User)
    .set(updateData)
    .where('id = :userId', { userId })
    .execute();

  return result.affected ?? 0;
}
