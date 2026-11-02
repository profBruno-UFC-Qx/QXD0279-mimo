import { AppDataSource } from '../data-source.js';
import { UserRole } from '../models/enums.js';
import { User } from '../models/user.js';

export interface NewUserData {
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
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
