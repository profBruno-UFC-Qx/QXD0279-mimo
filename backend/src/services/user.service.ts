import { HttpError } from '../middlewares/http-error.js';
import {
  findUserById,
  updateUserProfileFields,
  type ProfilePatch,
} from '../repository/user.repository.js';
import { hashPassword } from '../shared/password.js';
import type { PublicUser } from './auth.service.js';

export interface ValidatedUpdateProfileData {
  name?: string;
  phone?: string | null;
  password?: string;
}

const PHONE_REGEX = /^\+?[0-9()\s-]{8,20}$/;
const PASSWORD_MAX_BYTES = 1024;
const ALLOWED_KEYS = new Set(['name', 'phone', 'password']);

export function validateUpdateProfileInput(input: unknown): ValidatedUpdateProfileData {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new HttpError(400, 'Payload de atualização inválido: deve ser um objeto JSON.');
  }

  const keys = Object.keys(input);
  if (keys.length === 0) {
    throw new HttpError(400, 'Payload vazio: ao menos um campo editável deve ser fornecido.');
  }

  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new HttpError(400, `Campo não permitido ou desconhecido: ${key}`);
    }
  }

  const record = input as Record<string, unknown>;
  const result: ValidatedUpdateProfileData = {};

  if ('name' in record) {
    const nameVal = record.name;
    if (typeof nameVal !== 'string') {
      throw new HttpError(400, 'Nome deve ser uma string.');
    }
    const trimmed = nameVal.trim();
    if (trimmed.length < 3 || trimmed.length > 150) {
      throw new HttpError(400, 'Nome deve possuir entre 3 e 150 caracteres.');
    }
    result.name = trimmed;
  }

  if ('phone' in record) {
    const phoneVal = record.phone;
    if (phoneVal === null) {
      result.phone = null;
    } else if (typeof phoneVal === 'string') {
      const trimmed = phoneVal.trim();
      if (!PHONE_REGEX.test(trimmed)) {
        throw new HttpError(400, 'Telefone inválido.');
      }
      result.phone = trimmed;
    } else {
      throw new HttpError(400, 'Telefone deve ser uma string ou null.');
    }
  }

  if ('password' in record) {
    const passwordVal = record.password;
    if (typeof passwordVal !== 'string') {
      throw new HttpError(400, 'Senha deve ser uma string.');
    }
    const byteLength = Buffer.byteLength(passwordVal, 'utf8');
    if (byteLength === 0 || byteLength > PASSWORD_MAX_BYTES) {
      throw new HttpError(400, 'Senha deve possuir entre 1 e 1024 bytes UTF-8.');
    }
    // Senha não sofre trim para preservar caracteres exatos fornecidos pelo usuário
    result.password = passwordVal;
  }

  return result;
}

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

export async function updateUserProfile(userId: number, input: unknown): Promise<PublicUser> {
  const data = validateUpdateProfileInput(input);

  const patch: ProfilePatch = {};
  if (data.name !== undefined) {
    patch.name = data.name;
  }
  if (data.phone !== undefined) {
    patch.phone = data.phone;
  }
  if (data.password !== undefined) {
    patch.passwordHash = await hashPassword(data.password);
  }

  const affected = await updateUserProfileFields(userId, patch);
  if (affected === 0) {
    throw new HttpError(401, 'Usuário não encontrado ou inativo.');
  }

  return getUserProfile(userId);
}
