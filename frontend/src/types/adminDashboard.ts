import type { StatusColorToken } from '@/theme/colors'

export type MetricKey = 'totalLostReports' | 'openLostReports' | 'availableItems' | 'eligibleItems'

export interface MetricState {
  loading: boolean
  value: number | null
  error: string | null
}

interface MetricDefinition {
  key: MetricKey
  label: string
  icon: string
  color: StatusColorToken
  to: string
  linkLabel: string
}

export interface LastJobResult {
  updatedCount: number
  executedAt: string
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'totalLostReports',
    label: 'Relatos cadastrados',
    icon: 'mdi-alert-box-outline',
    color: 'info',
    to: '/admin/perdas',
    linkLabel: 'Ver relatos',
  },
  {
    key: 'openLostReports',
    label: 'Relatos em aberto',
    icon: 'mdi-alert-circle-outline',
    color: 'warning',
    to: '/admin/perdas',
    linkLabel: 'Analisar em aberto',
  },
  {
    key: 'availableItems',
    label: 'Itens disponíveis',
    icon: 'mdi-package-variant-closed',
    color: 'primary',
    to: '/admin/itens',
    linkLabel: 'Gerenciar itens',
  },
  {
    key: 'eligibleItems',
    label: 'Itens elegíveis',
    icon: 'mdi-delete-clock-outline',
    color: 'success',
    to: '/admin/itens',
    linkLabel: 'Ver elegíveis',
  },
]
