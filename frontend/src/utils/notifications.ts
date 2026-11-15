import type { RouteLocationRaw } from 'vue-router'
import type { Notification, NotificationType, UnreadCountResponse, UserRole } from '@/types'

export interface NotificationPresentation {
  title: string
  message: string
  icon: string
}

const VALID_NOTIFICATION_TYPES = new Set<NotificationType>([
  'MATCH_FOUND',
  'ITEM_CLAIMED',
  'REPORT_RESOLVED',
])

const PRESENTATION_BY_TYPE: Record<NotificationType, NotificationPresentation> = {
  MATCH_FOUND: {
    title: 'Possível correspondência encontrada',
    message: 'Um item encontrado pode corresponder a uma perda registrada por você.',
    icon: 'mdi-magnify',
  },
  ITEM_CLAIMED: {
    title: 'Item reconhecido por usuário',
    message: 'Um usuário confirmou um item encontrado. Confira os detalhes.',
    icon: 'mdi-hand-pointing-up',
  },
  REPORT_RESOLVED: {
    title: 'Perda resolvida',
    message: 'Seu registro de perda foi marcado como resolvido.',
    icon: 'mdi-check-circle-outline',
  },
}

const ROUTE_PATTERNS: Array<{
  pattern: RegExp
  routeName: 'lost-report-detail' | 'item-detail' | 'admin-item-detail'
  requiresAdmin?: boolean
}> = [
  { pattern: /^\/lost-reports\/([1-9]\d*)$/, routeName: 'lost-report-detail' },
  { pattern: /^\/items\/([1-9]\d*)$/, routeName: 'item-detail' },
  { pattern: /^\/admin\/items\/([1-9]\d*)$/, routeName: 'admin-item-detail', requiresAdmin: true },
]

function isPositiveSafeId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))
}

function parseCanonicalPositiveId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === raw ? parsed : null
}

/** Valida em tempo de execução um registro individual retornado pela API de notificações. */
export function isValidNotification(value: unknown): value is Notification {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>

  return (
    isPositiveSafeId(record.id) &&
    isPositiveSafeId(record.userId) &&
    typeof record.type === 'string' &&
    VALID_NOTIFICATION_TYPES.has(record.type as NotificationType) &&
    typeof record.linkUrl === 'string' &&
    record.linkUrl.trim() !== '' &&
    (record.readAt === null || isValidIsoTimestamp(record.readAt)) &&
    isValidIsoTimestamp(record.createdAt)
  )
}

/** Valida integralmente a lista de notificações, rejeitando IDs duplicados ou de outro usuário. */
export function isValidNotificationList(
  value: unknown,
  expectedUserId?: number | null,
): value is Notification[] {
  if (!Array.isArray(value)) return false

  const seenIds = new Set<number>()
  for (const item of value) {
    if (!isValidNotification(item)) return false
    if (seenIds.has(item.id)) return false
    if (expectedUserId !== undefined && expectedUserId !== null && item.userId !== expectedUserId) {
      return false
    }
    seenIds.add(item.id)
  }

  return true
}

/** Valida a resposta `{ count }` para contagem de notificações não lidas. */
export function isValidUnreadCount(value: unknown): value is UnreadCountResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.count === 'number' && Number.isSafeInteger(record.count) && record.count >= 0
}

/** Determina se uma notificação já foi lida a partir de `readAt`. */
export function isNotificationRead(notification: Pick<Notification, 'readAt'>): boolean {
  return notification.readAt !== null
}

/** Deriva título, mensagem descritiva e ícone a partir do tipo real da notificação. */
export function getNotificationPresentation(type: NotificationType): NotificationPresentation {
  return PRESENTATION_BY_TYPE[type]
}

/** Converte um `linkUrl` do backend em rota nomeada segura do Vue Router, ou `null` quando inválido/sem permissão. */
export function resolveNotificationRoute(
  linkUrl: string,
  role?: UserRole | null,
): RouteLocationRaw | null {
  if (typeof linkUrl !== 'string' || linkUrl.trim() === '') return null
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN'

  for (const entry of ROUTE_PATTERNS) {
    const match = entry.pattern.exec(linkUrl)
    if (!match) continue
    if (entry.requiresAdmin && !isAdmin) return null

    const id = parseCanonicalPositiveId(match[1])
    if (id === null) return null
    return { name: entry.routeName, params: { id } }
  }

  return null
}
