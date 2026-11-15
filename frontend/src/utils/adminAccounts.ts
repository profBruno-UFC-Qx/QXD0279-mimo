import type { CreateAdminPayload } from '@/services/admin.service'
import type { User } from '@/types'
import { isPositiveSafeId } from './lostReport'

export const ADMIN_ACCOUNT_LIMITS = {
  name: { min: 3, max: 150 },
  email: { max: 180 },
  initialPassword: { minBytes: 1, maxBytes: 1024 },
} as const

const SENSITIVE_ADMIN_KEYS = [
  'password',
  'passwordHash',
  'password_hash',
  'initialPassword',
] as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

/**
 * Normaliza apenas as extremidades do nome sem remover acentos ou espaços internos.
 */
export function normalizeAdminName(value: string): string {
  return value.trim()
}

/**
 * Normaliza e-mail aplicando trim e lowercase para alinhar ao backend.
 */
export function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Mede o tamanho exato em bytes UTF-8 sem alterar espaços ou caracteres da senha.
 */
export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * Valida nome completo conforme limites do backend (3 a 150 caracteres após trim).
 */
export function validateAdminName(value: unknown): {
  valid: boolean
  error?: string
  normalizedName: string | null
} {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Campo obrigatório.', normalizedName: null }
  }
  const trimmed = normalizeAdminName(value)
  if (trimmed.length === 0) {
    return { valid: false, error: 'Campo obrigatório.', normalizedName: null }
  }
  if (trimmed.length < ADMIN_ACCOUNT_LIMITS.name.min) {
    return {
      valid: false,
      error: `Mínimo de ${ADMIN_ACCOUNT_LIMITS.name.min} caracteres.`,
      normalizedName: null,
    }
  }
  if (trimmed.length > ADMIN_ACCOUNT_LIMITS.name.max) {
    return {
      valid: false,
      error: `Máximo de ${ADMIN_ACCOUNT_LIMITS.name.max} caracteres.`,
      normalizedName: null,
    }
  }
  return { valid: true, normalizedName: trimmed }
}

/**
 * Valida e normaliza e-mail conforme regras reais do backend (máximo 180 caracteres).
 */
export function validateAdminEmail(value: unknown): {
  valid: boolean
  error?: string
  normalizedEmail: string | null
} {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Campo obrigatório.', normalizedEmail: null }
  }
  const normalized = normalizeAdminEmail(value)
  if (normalized.length === 0) {
    return { valid: false, error: 'Campo obrigatório.', normalizedEmail: null }
  }
  if (normalized.length > ADMIN_ACCOUNT_LIMITS.email.max) {
    return {
      valid: false,
      error: `Máximo de ${ADMIN_ACCOUNT_LIMITS.email.max} caracteres.`,
      normalizedEmail: null,
    }
  }
  if (!EMAIL_PATTERN.test(normalized) || normalized.includes('..')) {
    return { valid: false, error: 'E-mail inválido.', normalizedEmail: null }
  }
  return { valid: true, normalizedEmail: normalized }
}

/**
 * Valida senha inicial (1 a 1024 bytes UTF-8) sem aplicar trim para preservar espaços intencionais.
 */
export function validateAdminInitialPassword(value: unknown): {
  valid: boolean
  error?: string
  initialPassword: string | null
} {
  if (typeof value !== 'string') {
    return { valid: false, error: 'A senha inicial é obrigatória.', initialPassword: null }
  }
  const byteLength = getUtf8ByteLength(value)
  if (byteLength < ADMIN_ACCOUNT_LIMITS.initialPassword.minBytes) {
    return { valid: false, error: 'A senha inicial é obrigatória.', initialPassword: null }
  }
  if (byteLength > ADMIN_ACCOUNT_LIMITS.initialPassword.maxBytes) {
    return {
      valid: false,
      error: `Máximo de ${ADMIN_ACCOUNT_LIMITS.initialPassword.maxBytes} bytes UTF-8.`,
      initialPassword: null,
    }
  }
  return { valid: true, initialPassword: value }
}

/**
 * Constrói estritamente o payload autorizado de POST /admins ({ name, email, initialPassword }).
 */
export function buildCreateAdminPayload(input: {
  name: unknown
  email: unknown
  initialPassword: unknown
}): CreateAdminPayload | null {
  const nameCheck = validateAdminName(input.name)
  const emailCheck = validateAdminEmail(input.email)
  const passwordCheck = validateAdminInitialPassword(input.initialPassword)

  if (
    !nameCheck.valid ||
    nameCheck.normalizedName === null ||
    !emailCheck.valid ||
    emailCheck.normalizedEmail === null ||
    !passwordCheck.valid ||
    passwordCheck.initialPassword === null
  ) {
    return null
  }

  return {
    name: nameCheck.normalizedName,
    email: emailCheck.normalizedEmail,
    initialPassword: passwordCheck.initialPassword,
  }
}

/**
 * Valida em runtime o DTO público retornado por GET /admins, GET /admins/:id e POST /admins.
 * Rejeita qualquer usuário que não seja ADMIN ou que exponha campos sensíveis de senha/hash.
 */
export function isValidAdminAccount(value: unknown, expectedId?: number): value is User {
  if (!isPlainRecord(value)) {
    return false
  }
  for (const sensitiveKey of SENSITIVE_ADMIN_KEYS) {
    if (sensitiveKey in value) {
      return false
    }
  }
  if (!isPositiveSafeId(value.id)) {
    return false
  }
  if (expectedId !== undefined && value.id !== expectedId) {
    return false
  }
  if (value.role !== 'ADMIN') {
    return false
  }
  if (!validateAdminName(value.name).valid) {
    return false
  }
  if (!validateAdminEmail(value.email).valid) {
    return false
  }
  if (value.phone !== null && typeof value.phone !== 'string') {
    return false
  }
  return isValidTimestamp(value.createdAt) && isValidTimestamp(value.updatedAt)
}

/**
 * Valida integralmente a lista de administradores comuns sem aceitar itens inválidos nem IDs duplicados.
 */
export function isValidAdminAccountList(value: unknown): value is User[] {
  if (!Array.isArray(value)) {
    return false
  }
  const seenIds = new Set<number>()
  for (const item of value) {
    if (!isValidAdminAccount(item) || seenIds.has(item.id)) {
      return false
    }
    seenIds.add(item.id)
  }
  return true
}

/**
 * Ordena administradores deterministicamente por nome, com desempate por id.
 */
export function sortAdminAccounts(items: readonly User[]): User[] {
  return [...items].sort((a, b) => {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return a.id - b.id
  })
}

/**
 * Filtra localmente administradores por nome ou e-mail.
 */
export function filterAdminAccounts(items: readonly User[], query: string): User[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter(
    (admin) =>
      admin.name.toLowerCase().includes(q) || admin.email.toLowerCase().includes(q),
  )
}
