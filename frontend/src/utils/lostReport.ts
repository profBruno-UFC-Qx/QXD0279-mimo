import type { LostReport, LostReportPayload } from '@/types'

export interface EditableLostReportFields {
  categoryId: number | null
  buildingId: number | null
  description: string
  lossDate: string
}

const VALID_LOST_REPORT_STATUSES = new Set(['OPEN', 'RESOLVED', 'CANCELLED'])

export function parsePositiveReportId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  if (!/^[1-9]\d*$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function isPositiveSafeId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNullablePositiveSafeId(value: unknown): value is number | null {
  return value === null || isPositiveSafeId(value)
}

export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() + 1 === month &&
    utc.getUTCDate() === day
  )
}

export function buildLostReportPatchPayload(
  original: LostReport,
  draft: EditableLostReportFields,
  options: { allowCategory?: boolean; allowBuilding?: boolean } = {},
): Partial<LostReportPayload> {
  const payload: Partial<LostReportPayload> = {}
  const trimmedDescription = draft.description.trim()

  if (trimmedDescription !== original.description) {
    payload.description = trimmedDescription
  }
  if (
    options.allowCategory !== false &&
    isPositiveSafeId(draft.categoryId) &&
    draft.categoryId !== original.categoryId
  ) {
    payload.categoryId = draft.categoryId
  }
  if (
    options.allowBuilding !== false &&
    (draft.buildingId === null || isPositiveSafeId(draft.buildingId)) &&
    draft.buildingId !== original.buildingId
  ) {
    payload.buildingId = draft.buildingId
  }
  if (isValidCalendarDate(draft.lossDate) && draft.lossDate !== original.lossDate) {
    payload.lossDate = draft.lossDate
  }

  return payload
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

export function isValidLostReport(value: unknown): value is LostReport {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    'buildingId' in record &&
    'confirmedItemId' in record &&
    isPositiveSafeId(record.id) &&
    isPositiveSafeId(record.userId) &&
    isPositiveSafeId(record.categoryId) &&
    isNullablePositiveSafeId(record.buildingId) &&
    isNullablePositiveSafeId(record.confirmedItemId) &&
    typeof record.description === 'string' &&
    record.description.trim() !== '' &&
    isValidCalendarDate(record.lossDate) &&
    typeof record.status === 'string' &&
    VALID_LOST_REPORT_STATUSES.has(record.status) &&
    isValidTimestamp(record.createdAt)
  )
}

export interface NewLostReportDraft {
  categoryId: number | null
  buildingId: number | null
  description: string
  lossDate: string | null
}

export function buildLostReportCreatePayload(draft: NewLostReportDraft): LostReportPayload | null {
  if (!isPositiveSafeId(draft.categoryId)) return null
  if (draft.buildingId !== null && !isPositiveSafeId(draft.buildingId)) return null
  const description = draft.description.trim()
  if (description.length < 10 || description.length > 2000) return null
  if (!isValidCalendarDate(draft.lossDate)) return null
  return {
    categoryId: draft.categoryId,
    buildingId: draft.buildingId,
    description,
    lossDate: draft.lossDate,
  }
}

export function isValidPublicSuggestedItemList(data: unknown): boolean {
  return (
    Array.isArray(data) &&
    data.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        isPositiveSafeId((item as { id?: unknown }).id) &&
        typeof (item as { title?: unknown }).title === 'string',
    )
  )
}

export function isValidLostReportList(data: unknown): data is LostReport[] {
  return Array.isArray(data) && data.every(isValidLostReport)
}

export function getErrorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('response' in err)) return null
  const status = (err as { response?: { status?: unknown } }).response?.status
  return typeof status === 'number' ? status : null
}

export function extractLostReportErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { status?: unknown; data?: unknown } }).response
    const status = response?.status
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof response?.data === 'object' &&
      response.data !== null &&
      'error' in response.data
    ) {
      const apiError = (response.data as { error?: unknown }).error
      if (typeof apiError === 'object' && apiError !== null && 'details' in apiError) {
        const details = (apiError as { details?: unknown }).details
        if (typeof details === 'string' && details.trim() !== '') {
          return details
        }
      }
    }
  }
  return fallback
}
