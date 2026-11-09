import type { DispositionType, Item } from './item'
import type { User } from './user'

export interface Disposition {
  id: number
  itemId: number
  item?: Item
  destination: DispositionType
  adminId: number
  admin?: User
  recipientDocument: string
  recipientName: string
  notes?: string | null
  createdAt: string
}

export interface DispositionPayload {
  destination: DispositionType
  recipientDocument: string
  recipientName: string
  notes?: string | null
}
