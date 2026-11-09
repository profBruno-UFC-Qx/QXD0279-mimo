export type NotificationType = 'MATCH_FOUND' | 'ITEM_CLAIMED' | 'REPORT_RESOLVED'

export interface Notification {
  id: number
  userId: number
  title: string
  message: string
  type: NotificationType
  read: boolean
  relatedItemId?: number | null
  relatedReportId?: number | null
  createdAt: string
}
