export const itemStatusMap: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Disponível', color: 'success' },
  ELIGIBLE: { label: 'Elegível à destinação', color: 'warning' },
  HANDED_OVER: { label: 'Entregue', color: 'info' },
  SOLD: { label: 'Vendido', color: 'purple' },
  AUCTIONED: { label: 'Leiloado', color: 'deep-purple' },
  DONATED: { label: 'Doado', color: 'secondary' },
  DISCARDED: { label: 'Descartado', color: 'grey' },
}

export const lostReportStatusMap: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberta', color: 'accent' },
  RESOLVED: { label: 'Resolvida', color: 'success' },
  CANCELLED: { label: 'Cancelada', color: 'grey' },
}
