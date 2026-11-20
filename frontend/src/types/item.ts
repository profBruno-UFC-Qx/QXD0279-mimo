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
  itemId?: number
  url?: string
  photoUrl?: string
  createdAt?: string
}

export interface PublicCatalogItem {
  id: number
  title: string
  description: string | null
  categoryId: number
  buildingId: number
  foundLocation: string | null
  foundDate: string
  status: ItemStatus
  category: Pick<Category, 'id' | 'name'>
  building: Pick<Building, 'id' | 'name'>
  photos: ItemPhoto[]
}

export interface PublicItemDetails {
  item: Pick<Item, 'id' | 'title' | 'description' | 'categoryId' | 'buildingId' | 'foundLocation' | 'foundDate' | 'status'> & {
    category: Pick<Category, 'id' | 'name'>
  }
  photos: ItemPhoto[]
  building: Pick<Building, 'id' | 'name' | 'pickupPoint' | 'serviceHours'>
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

export interface CreateAdminItemPayload {
  title: string
  description?: string | null
  categoryId: number
  buildingId: number
  foundLocation?: string | null
  foundDate: string
  photos: string[]
}

export interface UpdateAdminItemPayload {
  title?: string
  description?: string | null
  categoryId?: number
  buildingId?: number
  foundLocation?: string | null
  foundDate?: string
  photosToAdd?: string[]
  photosToRemove?: number[]
}

export interface AdminItemDetails {
  item: Item
  photos: ItemPhoto[]
}

export interface ItemQuery extends PageQuery {
  categoryId?: number
  buildingId?: number
  search?: string
  status?: ItemStatus
}

export interface AdminItemQuery {
  categoryId?: number
  buildingId?: number
  search?: string
  status?: ItemStatus
  page?: number
  per_page?: number
}
