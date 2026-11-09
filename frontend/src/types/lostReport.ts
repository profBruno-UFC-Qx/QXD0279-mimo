import type { Category } from './category'
import type { Building } from './building'
import type { Item } from './item'

export type LostReportStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED'

export interface SuggestionItem extends Item {
  matchScore?: number
}

export interface LostReport {
  id: number
  userId: number
  title: string
  description: string | null
  categoryId: number
  category?: Category
  buildingId: number | null
  building?: Building | null
  lostDate: string
  status: LostReportStatus
  createdAt: string
  updatedAt: string
  suggestions?: SuggestionItem[]
}

export interface LostReportPayload {
  title: string
  description?: string | null
  categoryId: number
  buildingId?: number | null
  lostDate: string
}
