import { AppDataSource } from '../data-source.js';
import { UserRole } from '../models/enums.js';
import { User } from '../models/user.js';

export interface NewAdminData {
  name: string;
  email: string;
  passwordHash: string;
}

export async function findAdminUsers(): Promise<User[]> {
  return AppDataSource.getRepository(User).find({
    where: { role: UserRole.ADMIN },
    order: { id: 'ASC' },
  });
}

// Plain INSERT (no save() transaction): the UNIQUE index on email is the final guard against duplicates.
export async function insertAdminUser(data: NewAdminData): Promise<User> {
  const repository = AppDataSource.getRepository(User);
  const user = repository.create({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    phone: null,
    role: UserRole.ADMIN,
  });
  await repository.insert(user);
  return user;
}
