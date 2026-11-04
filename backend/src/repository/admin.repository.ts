import { AppDataSource } from '../data-source.js';
import { UserRole } from '../models/enums.js';
import { User } from '../models/user.js';

export async function findAdminUsers(): Promise<User[]> {
  return AppDataSource.getRepository(User).find({
    where: { role: UserRole.ADMIN },
    order: { id: 'ASC' },
  });
}
