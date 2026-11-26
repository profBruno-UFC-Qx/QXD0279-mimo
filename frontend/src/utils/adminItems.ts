import type { ItemStatus } from '@/types'

const EDITABLE_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set(['AVAILABLE', 'ELIGIBLE'])
const DELIVERABLE_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set(['AVAILABLE', 'ELIGIBLE'])

export function isItemEditable(status: ItemStatus): boolean {
  return EDITABLE_ITEM_STATUSES.has(status)
}

export function isItemDeliverable(status: ItemStatus): boolean {
  return DELIVERABLE_ITEM_STATUSES.has(status)
}
