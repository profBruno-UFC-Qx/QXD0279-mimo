export type NotificationType = 'MATCH_FOUND' | 'ITEM_CLAIMED' | 'REPORT_RESOLVED'

export interface Notification {
  id: number
  userId: number
  type: NotificationType
  linkUrl: string
  readAt: string | null
  createdAt: string
}

export interface NotificationListQuery {
  read?: boolean
}

export interface UnreadCountResponse {
  count: number
}
