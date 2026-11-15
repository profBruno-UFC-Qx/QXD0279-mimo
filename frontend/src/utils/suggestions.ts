import type { Page, PublicCatalogItem } from '@/types'
import { isPositiveSafeId, isValidCalendarDate } from './lostReport'

const PUBLIC_CATALOG_STATUSES = new Set(['AVAILABLE', 'ELIGIBLE'])
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isSafePhotoUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (trimmed === '' || CONTROL_CHAR_REGEX.test(trimmed)) return false
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//')
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function getSafePrimaryPhotoUrl(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  for (const photo of photos) {
    if (!isPlainRecord(photo)) continue
    const candidate = typeof photo.url === 'string' ? photo.url : photo.photoUrl
    if (isSafePhotoUrl(candidate)) {
      return candidate.trim()
    }
  }
  return null
}

function isValidPublicCatalogPhoto(value: unknown): boolean {
  if (!isPlainRecord(value)) return false
  return isPositiveSafeId(value.id) && isNonEmptyString(value.url)
}

export function isValidPublicCatalogItem(
  value: unknown,
  expectedCategoryId?: number,
): value is PublicCatalogItem {
  if (!isPlainRecord(value)) return false
  if (!isPositiveSafeId(value.id) || !isNonEmptyString(value.title)) return false
  if (value.description !== null && typeof value.description !== 'string') return false
  if (!isPositiveSafeId(value.categoryId) || !isPositiveSafeId(value.buildingId)) return false
  if (expectedCategoryId !== undefined && value.categoryId !== expectedCategoryId) return false
  if (value.foundLocation !== null && typeof value.foundLocation !== 'string') return false
  if (!isValidCalendarDate(value.foundDate)) return false
  if (typeof value.status !== 'string' || !PUBLIC_CATALOG_STATUSES.has(value.status)) return false

  if (
    !isPlainRecord(value.category) ||
    !isPositiveSafeId(value.category.id) ||
    value.category.id !== value.categoryId ||
    !isNonEmptyString(value.category.name)
  ) {
    return false
  }

  if (
    !isPlainRecord(value.building) ||
    !isPositiveSafeId(value.building.id) ||
    value.building.id !== value.buildingId ||
    !isNonEmptyString(value.building.name)
  ) {
    return false
  }

  return Array.isArray(value.photos) && value.photos.every(isValidPublicCatalogPhoto)
}

export function isValidPublicCatalogPage(
  value: unknown,
  expectedCategoryId?: number,
): value is Page<PublicCatalogItem> {
  if (!isPlainRecord(value) || !Array.isArray(value.data) || !isPlainRecord(value.pagination)) {
    return false
  }

  const { total, page, per_page: perPage, total_pages: totalPages } = value.pagination
  if (
    !isNonNegativeSafeInt(total) ||
    !isPositiveSafeId(page) ||
    !isPositiveSafeId(perPage) ||
    perPage > 100 ||
    !isNonNegativeSafeInt(totalPages)
  ) {
    return false
  }

  if (totalPages !== Math.ceil(total / perPage)) return false
  if (total === 0 && value.data.length > 0) return false
  if (value.data.length > perPage) return false

  return value.data.every((item) => isValidPublicCatalogItem(item, expectedCategoryId))
}

export function isOutOfRangeCatalogPage(result: Page<PublicCatalogItem>): boolean {
  return (
    result.pagination.total > 0 &&
    result.pagination.total_pages > 0 &&
    result.pagination.page > result.pagination.total_pages &&
    result.data.length === 0
  )
}
