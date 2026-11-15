import type { Category, CategoryPayload } from '@/types'
import { isPositiveSafeId } from './lostReport'

export const CATEGORY_LIMITS = {
  name: { min: 2, max: 100 },
} as const

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

/**
 * Normaliza apenas as extremidades do nome sem alterar acentos ou espaços internos.
 */
export function normalizeCategoryName(value: string): string {
  return value.trim()
}

/**
 * Valida o nome da categoria conforme limites reais do backend (2 a 100 caracteres após trim).
 */
export function validateCategoryName(value: unknown): {
  valid: boolean
  error?: string
  normalizedName: string | null
} {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Campo obrigatório.', normalizedName: null }
  }
  const trimmed = normalizeCategoryName(value)
  if (trimmed.length === 0) {
    return { valid: false, error: 'Campo obrigatório.', normalizedName: null }
  }
  if (trimmed.length < CATEGORY_LIMITS.name.min) {
    return {
      valid: false,
      error: `Mínimo de ${CATEGORY_LIMITS.name.min} caracteres.`,
      normalizedName: null,
    }
  }
  if (trimmed.length > CATEGORY_LIMITS.name.max) {
    return {
      valid: false,
      error: `Máximo de ${CATEGORY_LIMITS.name.max} caracteres.`,
      normalizedName: null,
    }
  }
  return { valid: true, normalizedName: trimmed }
}

/**
 * Constrói o payload permitido pelo contrato (somente { name }).
 */
export function buildCategoryPayload(name: string): CategoryPayload | null {
  const result = validateCategoryName(name)
  return result.valid && result.normalizedName !== null
    ? { name: result.normalizedName }
    : null
}

/**
 * Indica se o nome normalizado difere do registro original.
 */
export function hasCategoryNameChanged(original: Pick<Category, 'name'>, nextName: string): boolean {
  return normalizeCategoryName(nextName) !== original.name
}

/**
 * Valida em runtime se o objeto recebido corresponde ao DTO real de Category.
 */
export function isValidCategory(value: unknown, expectedId?: number): value is Category {
  if (!isPlainRecord(value)) {
    return false
  }
  if (!isPositiveSafeId(value.id)) {
    return false
  }
  if (expectedId !== undefined && value.id !== expectedId) {
    return false
  }
  if (typeof value.name !== 'string') {
    return false
  }
  const trimmed = normalizeCategoryName(value.name)
  if (trimmed.length < CATEGORY_LIMITS.name.min || trimmed.length > CATEGORY_LIMITS.name.max) {
    return false
  }
  return isValidTimestamp(value.createdAt)
}

/**
 * Valida integralmente uma coleção de categorias sem aceitar itens inválidos nem IDs duplicados.
 */
export function isValidCategoryList(value: unknown): value is Category[] {
  if (!Array.isArray(value)) {
    return false
  }
  const seenIds = new Set<number>()
  for (const item of value) {
    if (!isValidCategory(item) || seenIds.has(item.id)) {
      return false
    }
    seenIds.add(item.id)
  }
  return true
}

/**
 * Ordena categorias deterministicamente por nome, com desempate por id.
 */
export function sortCategoriesByName(items: readonly Category[]): Category[] {
  return [...items].sort((a, b) => {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return a.id - b.id
  })
}
