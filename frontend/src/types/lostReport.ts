import type { Category } from './category'
import type { Building } from './building'
import type { Item, ItemStatus } from './item'

export type LostReportStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED'

export interface SuggestionItem extends Item {
  matchScore?: number
}

export interface PublicSuggestedItem {
  id: number
  title: string
  description: string | null
  categoryId: number
  buildingId: number
  foundLocation: string | null
  foundDate: string
  status: ItemStatus
  category?: Pick<Category, 'id' | 'name'>
  building?: Pick<Building, 'id' | 'name'>
  photos?: Array<{ id: number; url: string }>
}

export interface CreateLostReportResult {
  lostReport: LostReport
  suggestions: PublicSuggestedItem[]
}

export interface LostReportMineQuery {
  status?: LostReportStatus
}

export interface AdminLostReportQuery {
  status?: LostReportStatus
  categoryId?: number
  buildingId?: number
  page?: number
  per_page?: number
}

/** Espelha PublicLostReportDto do backend; campos opcionais preservam telas legadas não migradas. */
export interface LostReport {
  id: number
  userId: number
  categoryId: number
  buildingId: number | null
  confirmedItemId: number | null
  description: string
  lossDate: string
  status: LostReportStatus
  createdAt: string
  title?: string
  lostDate?: string
  updatedAt?: string
  category?: Category
  building?: Building | null
  suggestions?: SuggestionItem[]
}

export interface LostReportPayload {
  description: string
  categoryId: number
  buildingId?: number | null
  lossDate: string
}
