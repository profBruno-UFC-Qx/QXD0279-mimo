import { isEmail } from 'class-validator';
import { HttpError } from '../middlewares/http-error.js';
import type { User } from '../models/user.js';
import { buildUser, insertUser } from '../repository/user.repository.js';
import { hashPassword } from '../shared/password.js';

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'createdAt' | 'updatedAt'>;

export interface ValidatedRegistrationData {
  name: string;
  email: string;
  password: string;
  phone: string | null;
}

const EMAIL_MAX_LENGTH = 180;
const PASSWORD_MAX_BYTES = 1024;
const PHONE_REGEX = /^\+?[0-9()\s-]{8,20}$/;

export function validateRegistrationInput(input: unknown): ValidatedRegistrationData {
  const body = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const { name, email, password, phone } = body;

  if (typeof name !== 'string' || name.length < 3 || name.length > 150) {
    throw new HttpError(400, 'Dados inválidos: name deve ter entre 3 e 150 caracteres.');
  }

  if (typeof email !== 'string') {
    throw new HttpError(400, 'E-mail inválido.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > EMAIL_MAX_LENGTH || !isEmail(normalizedEmail)) {
    throw new HttpError(400, 'E-mail inválido.');
  }

  if (typeof password !== 'string') {
    throw new HttpError(400, 'A senha é obrigatória.');
  }
  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (passwordBytes === 0 || passwordBytes > PASSWORD_MAX_BYTES) {
    throw new HttpError(400, 'A senha deve ter entre 1 e 1024 bytes UTF-8.');
  }

  let normalizedPhone: string | null = null;
  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      throw new HttpError(400, 'Telefone inválido.');
    }
    normalizedPhone = phone;
  }

  return {
    name,
    email: normalizedEmail,
    password,
    phone: normalizedPhone,
  };
}

export async function registerUser(
  input: unknown,
  hashFn: (password: string) => Promise<string> = hashPassword,
): Promise<PublicUser> {
  const data = validateRegistrationInput(input);

  const passwordHash = await hashFn(data.password);

  const user = buildUser({
    name: data.name,
    email: data.email,
    passwordHash,
    phone: data.phone,
  });

  const saved = await insertUser(user);

  return {
    id: saved.id,
    name: saved.name,
    email: saved.email,
    phone: saved.phone,
    role: saved.role,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}
