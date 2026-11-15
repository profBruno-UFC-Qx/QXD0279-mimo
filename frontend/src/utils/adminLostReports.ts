import type { LostReport, LostReportStatus, Page } from '@/types'
import { isPositiveSafeId, isValidLostReport } from './lostReport'

export interface ExpectedAdminLostReportPage {
  page?: number
  perPage?: number
  status?: LostReportStatus
  categoryId?: number
  buildingId?: number
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Valida integralmente a resposta paginada administrativa de relatos de perda.
 * Rejeita respostas malformadas, paginação inconsistente, IDs duplicados ou fora dos filtros aplicados.
 */
export function isValidAdminLostReportPage(
  value: unknown,
  expected: ExpectedAdminLostReportPage = {},
): value is Page<LostReport> {
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

  if (expected.page !== undefined && page !== expected.page) {
    return false
  }
  if (expected.perPage !== undefined && perPage !== expected.perPage) {
    return false
  }
  if (totalPages !== Math.ceil(total / perPage)) {
    return false
  }
  if (total === 0 && value.data.length > 0) {
    return false
  }
  if (value.data.length > perPage) {
    return false
  }

  const seenIds = new Set<number>()
  for (const item of value.data) {
    if (!isValidLostReport(item)) {
      return false
    }
    if (seenIds.has(item.id)) {
      return false
    }
    seenIds.add(item.id)

    if (expected.status !== undefined && item.status !== expected.status) {
      return false
    }
    if (expected.categoryId !== undefined && item.categoryId !== expected.categoryId) {
      return false
    }
    if (expected.buildingId !== undefined && item.buildingId !== expected.buildingId) {
      return false
    }
  }

  return true
}

export function isOutOfRangeAdminLostReportPage(result: Page<LostReport>): boolean {
  return (
    result.pagination.total > 0 &&
    result.pagination.total_pages > 0 &&
    result.pagination.page > result.pagination.total_pages &&
    result.data.length === 0
  )
}

export function isValidAdminLostReportDetail(
  value: unknown,
  expectedId: number,
): value is LostReport {
  return isValidLostReport(value) && value.id === expectedId
}

export function isValidResolvedLostReportResponse(
  value: unknown,
  expectedId: number,
): value is LostReport {
  return isValidLostReport(value) && value.id === expectedId && value.status === 'RESOLVED'
}
