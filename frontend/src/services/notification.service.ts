import { api } from './api'
import type { Notification, Page, PageQuery } from '../types'

export const notificationService = {
  async list(params?: PageQuery): Promise<Page<Notification>> {
    const { data } = await api.get<Page<Notification>>('/notifications', { params })
    return data
  },
  async unreadCount(): Promise<{ count: number }> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count')
    return data
  },
  async markAsRead(id: number): Promise<void> {
    await api.patch(`/notifications/${id}/read`)
  },
  async markAllAsRead(): Promise<void> {
    await api.patch('/notifications/read-all')
  },
}
