function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Extracts and strictly validates pagination.total from a paginated API response.
 * Never falls back to array length, which only reflects the current page slice.
 */
export function extractPaginationTotal(response: unknown): number {
  if (!isPlainRecord(response) || !isPlainRecord(response.pagination)) {
    throw new Error('Resposta de paginação inválida: metadados de paginação ausentes.')
  }

  const { total } = response.pagination
  if (!isSafeNonNegativeInteger(total)) {
    throw new Error('Resposta de paginação inválida: total ausente ou inválido.')
  }

  return total
}

/**
 * Extracts and strictly validates updatedCount from the eligibility job response.
 */
export function extractDispositionEligibilityUpdatedCount(response: unknown): number {
  if (!isPlainRecord(response)) {
    throw new Error('Resposta inválida do processamento de elegibilidade.')
  }

  const { updatedCount } = response
  if (!isSafeNonNegativeInteger(updatedCount)) {
    throw new Error('Resposta inválida do processamento de elegibilidade: updatedCount ausente ou inválido.')
  }

  return updatedCount
}
