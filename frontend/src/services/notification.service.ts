import { api } from './api'
import type { Notification, Page, PageQuery } from '../types'

export const notificationService = {
  async list(query?: PageQuery): Promise<Page<Notification>> {
    const { data } = await api.get<Page<Notification>>('/notifications', { params: query })
    return data
  },
  async unreadCount(): Promise<{ count: number }> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count')
    return data
  },
  async markRead(id: number): Promise<void> {
    await api.patch(`/notifications/${id}/read`)
  },
  async markAsRead(id: number): Promise<void> {
    await this.markRead(id)
  },
  async markAllRead(): Promise<void> {
    await api.patch('/notifications/read-all')
  },
  async markAllAsRead(): Promise<void> {
    await this.markAllRead()
  },
}
