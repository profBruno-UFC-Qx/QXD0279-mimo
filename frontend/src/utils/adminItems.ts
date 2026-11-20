import type { ItemStatus } from '@/types'

const EDITABLE_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set(['AVAILABLE', 'ELIGIBLE'])

export function isItemEditable(status: ItemStatus): boolean {
  return EDITABLE_ITEM_STATUSES.has(status)
}
