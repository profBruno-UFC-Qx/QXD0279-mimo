import type { Item } from './item'
import type { User } from './user'

export interface Handover {
  id: number
  itemId: number
  item?: Item
  withdrawnByName: string
  withdrawnByCpf: string
  withdrawnUserId: number | null
  withdrawnUser?: User | null
  adminId: number
  admin?: User
  createdAt: string
}

export interface HandoverPayload {
  withdrawnByName: string
  withdrawnByCpf: string
  withdrawnUserId?: number | null
}
