import type { DispositionType, LostReportStatus } from '@/types'

export type ActiveFilter = 'all' | 'active' | 'inactive'

export interface DispositionHistoryFilters {
  destination: DispositionType | null
  from: string | null
  to: string | null
}

export interface HandoverFilters {
  itemId: string
  adminId: string
  from: string | null
  to: string | null
}

export interface LostReportFilters {
  status: LostReportStatus | null
  categoryId: number | null
  buildingId: number | null
}
