import type { DispositionType } from '@/types'

export const DISPOSITION_LABELS: Record<DispositionType, string> = {
  SOLD: 'Venda',
  AUCTIONED: 'Leilão',
  DONATED: 'Doação',
  DISCARDED: 'Descarte',
}

export const DISPOSITION_OPTIONS: Array<{ title: string; value: DispositionType }> = [
  { title: DISPOSITION_LABELS.SOLD, value: 'SOLD' },
  { title: DISPOSITION_LABELS.AUCTIONED, value: 'AUCTIONED' },
  { title: DISPOSITION_LABELS.DONATED, value: 'DONATED' },
  { title: DISPOSITION_LABELS.DISCARDED, value: 'DISCARDED' },
]

export const RECEIVER_DOCUMENT_REGEX =
  /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

export function isValidReceiverDocument(value: string): boolean {
  return RECEIVER_DOCUMENT_REGEX.test(value.trim())
}
