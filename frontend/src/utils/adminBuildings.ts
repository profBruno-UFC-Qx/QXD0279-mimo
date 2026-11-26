import type { Building, BuildingPayload } from '@/types'
import { isPositiveSafeId } from './lostReport'

export const BUILDING_LIMITS = {
  name: { min: 3, max: 150 },
  address: { min: 5, max: 255 },
  pickupPoint: { min: 3, max: 200 },
  serviceHours: { min: 3, max: 200 },
} as const

export interface BuildingFormDraft {
  name: string
  address: string
  pickupPoint: string
  serviceHours: string
}

export type BuildingValidationErrors = Partial<Record<keyof BuildingFormDraft, string>>

const BUILDING_FIELDS: readonly (keyof BuildingFormDraft)[] = [
  'name',
  'address',
  'pickupPoint',
  'serviceHours',
]

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

function validateTextBounds(value: unknown, min: number, max: number): string | undefined {
  if (typeof value !== 'string') {
    return 'Campo obrigatório.'
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 'Campo obrigatório.'
  }
  if (trimmed.length < min) {
    return `Mínimo de ${min} caracteres.`
  }
  if (trimmed.length > max) {
    return `Máximo de ${max} caracteres.`
  }
  return undefined
}

/**
 * Valida em runtime se o objeto recebido corresponde ao DTO real de Building.
 */
export function isValidBuilding(value: unknown, expectedId?: number): value is Building {
  if (!isPlainRecord(value)) {
    return false
  }
  if (!isPositiveSafeId(value.id)) {
    return false
  }
  if (expectedId !== undefined && value.id !== expectedId) {
    return false
  }
  for (const field of BUILDING_FIELDS) {
    const raw = value[field]
    const limits = BUILDING_LIMITS[field]
    if (typeof raw !== 'string') return false
    const trimmed = raw.trim()
    if (trimmed.length < limits.min || trimmed.length > limits.max) {
      return false
    }
  }
  return isValidTimestamp(value.createdAt)
}

/**
 * Valida integralmente uma lista de prédios sem aceitar itens inválidos nem IDs duplicados.
 */
export function isValidBuildingList(value: unknown): value is Building[] {
  if (!Array.isArray(value)) {
    return false
  }
  const seenIds = new Set<number>()
  for (const item of value) {
    if (!isValidBuilding(item) || seenIds.has(item.id)) {
      return false
    }
    seenIds.add(item.id)
  }
  return true
}

/**
 * Normaliza apenas as extremidades dos campos sem alterar caracteres internos.
 */
export function normalizeBuildingDraft(draft: BuildingFormDraft): BuildingPayload {
  return {
    name: draft.name.trim(),
    address: draft.address.trim(),
    pickupPoint: draft.pickupPoint.trim(),
    serviceHours: draft.serviceHours.trim(),
  }
}

/**
 * Valida os quatro campos obrigatórios conforme as regras reais do backend.
 */
export function validateBuildingForm(draft: BuildingFormDraft): {
  valid: boolean
  errors: BuildingValidationErrors
  payload: BuildingPayload | null
} {
  const normalized = normalizeBuildingDraft(draft)
  const errors: BuildingValidationErrors = {}

  for (const field of BUILDING_FIELDS) {
    const limits = BUILDING_LIMITS[field]
    const message = validateTextBounds(normalized[field], limits.min, limits.max)
    if (message) {
      errors[field] = message
    }
  }

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    payload: valid ? normalized : null,
  }
}

/**
 * Constrói o payload de criação com somente os quatro campos autorizados.
 */
export function buildBuildingCreatePayload(draft: BuildingFormDraft): BuildingPayload | null {
  return validateBuildingForm(draft).payload
}

/**
 * Constrói o payload parcial de PATCH contendo apenas os campos realmente alterados.
 * Retorna objeto vazio quando nada mudou e null se houver erro de validação.
 */
export function buildBuildingPatchPayload(
  original: Building,
  draft: BuildingFormDraft,
): Partial<BuildingPayload> | null {
  const validation = validateBuildingForm(draft)
  if (!validation.valid || !validation.payload) {
    return null
  }

  const patch: Partial<BuildingPayload> = {}
  for (const field of BUILDING_FIELDS) {
    if (validation.payload[field] !== original[field]) {
      patch[field] = validation.payload[field]
    }
  }
  return patch
}

/**
 * Ordena prédios por nome de forma determinística compatível com ORDER BY name ASC.
 */
export function sortBuildingsByName(items: readonly Building[]): Building[] {
  return [...items].sort((a, b) => {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return a.id - b.id
  })
}
