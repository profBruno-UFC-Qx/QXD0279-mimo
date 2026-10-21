import { UserRole } from './enums.js';

export class User {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public passwordHash: string,
    public phone: string | null,
    public role: UserRole,
    public createdAt: Date,
    public updatedAt: Date,
  ) {}
}
