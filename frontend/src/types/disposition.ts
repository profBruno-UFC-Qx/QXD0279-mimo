import type { DispositionType, Item } from './item'
import type { User } from './user'

export interface DispositionRule {
  id: number
  days: number
  destination: DispositionType
  active: boolean
  locked: boolean
  createdBy: number
  createdByUser?: User
  createdAt: string
  updatedAt: string
}

export interface CreateDispositionRulePayload {
  days: number
  destination: DispositionType
}

export interface UpdateDispositionRulePayload {
  days?: number
  destination?: DispositionType
  active?: boolean
  locked?: boolean
}

export interface DispositionRuleQuery {
  active?: boolean
}

export interface Disposition {
  id: number
  itemId: number
  item?: Item
  destination: DispositionType
  adminId: number
  admin?: User
  receiverDocument: string
  executedAt: string
}

export interface DispositionPayload {
  itemId: number
  destination: DispositionType
  receiverDocument: string
}

export interface DispositionQuery {
  destination?: DispositionType
  from?: string
  to?: string
  page?: number
  per_page?: number
}
