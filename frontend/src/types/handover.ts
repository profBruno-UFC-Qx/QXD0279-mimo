import type { Item } from './item'
import type { User } from './user'

export interface Handover {
  id: number
  itemId: number
  item?: Item
  withdrawnName: string
  withdrawnCpf: string
  withdrawnUserId: number | null
  withdrawnUser?: User | null
  adminId: number
  admin?: User
  handedAt: string
}

export interface HandoverPayload {
  itemId: number
  withdrawnName: string
  withdrawnCpf: string
  withdrawnUserId?: number | null
}

export interface AdminHandoverQuery {
  itemId?: number
  adminId?: number
  from?: string
  to?: string
  page?: number
  per_page?: number
}
