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
