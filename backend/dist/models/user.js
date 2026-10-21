import { UserRole } from './enums.js';
export class User {
    id;
    name;
    email;
    passwordHash;
    phone;
    role;
    createdAt;
    updatedAt;
    constructor(id, name, email, passwordHash, phone, role, createdAt, updatedAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.phone = phone;
        this.role = role;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
