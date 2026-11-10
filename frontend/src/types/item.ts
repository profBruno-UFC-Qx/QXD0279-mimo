import type { Category } from './category'
import type { Building } from './building'
import type { User } from './user'
import type { PageQuery } from './api'

export type ItemStatus =
  | 'AVAILABLE'
  | 'ELIGIBLE'
  | 'HANDED_OVER'
  | 'SOLD'
  | 'AUCTIONED'
  | 'DONATED'
  | 'DISCARDED'

export type DispositionType = 'SOLD' | 'AUCTIONED' | 'DONATED' | 'DISCARDED'

export interface ItemPhoto {
  id: number
  itemId: number
  photoUrl: string
  createdAt: string
}

export interface Item {
  id: number
  title: string
  description: string | null
  categoryId: number
  category?: Category
  buildingId: number
  building?: Building
  foundLocation: string | null
  foundDate: string
  status: ItemStatus
  plannedDestination: DispositionType | null
  createdBy: number
  createdByUser?: User
  photos?: ItemPhoto[]
  createdAt: string
  updatedAt: string
}

export interface ItemPayload {
  title: string
  description?: string | null
  categoryId: number
  buildingId: number
  foundLocation?: string | null
  foundDate: string
  photoUrls?: string[]
}

export interface ItemQuery extends PageQuery {
  categoryId?: number
  buildingId?: number
  search?: string
  status?: ItemStatus
}
