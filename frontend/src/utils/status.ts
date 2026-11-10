import type { ItemStatus } from '../types'
import type { LostReportStatus } from '../types'

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; color: string }> = {
  AVAILABLE:    { label: 'Disponível',             color: 'success' },
  ELIGIBLE:     { label: 'Elegível à destinação',  color: 'warning' },
  HANDED_OVER:  { label: 'Entregue',               color: 'info' },
  SOLD:         { label: 'Vendido',                color: '#7A5AF8' },
  AUCTIONED:    { label: 'Leiloado',               color: '#9B4FD8' },
  DONATED:      { label: 'Doado',                  color: 'secondary' },
  DISCARDED:    { label: 'Descartado',             color: '#6B7280' },
}

export const LOST_REPORT_STATUS_META: Record<LostReportStatus, { label: string; color: string }> = {
  OPEN:      { label: 'Aberta',     color: 'accent' },
  RESOLVED:  { label: 'Resolvida',  color: 'success' },
  CANCELLED: { label: 'Cancelada',  color: '#6B7280' },
}

export const itemStatusMap = ITEM_STATUS_META
export const lostReportStatusMap = LOST_REPORT_STATUS_META
