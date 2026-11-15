import { api } from './api'
import type { Notification, NotificationListQuery, UnreadCountResponse } from '../types'
import { isValidUnreadCount } from '@/utils/notifications'

export const notificationService = {
  async list(query?: NotificationListQuery): Promise<Notification[]> {
    const params = query?.read !== undefined ? { read: query.read } : undefined
    const { data } = await api.get<Notification[]>('/notifications', { params })
    if (!Array.isArray(data)) {
      throw new Error('Formato inválido de lista de notificações.')
    }
    return data
  },

  async unreadCount(): Promise<UnreadCountResponse> {
    const { data } = await api.get<UnreadCountResponse>('/notifications/unread-count')
    if (!isValidUnreadCount(data)) {
      throw new Error('Formato inválido de contagem de notificações.')
    }
    return data
  },

  async markRead(id: number): Promise<Notification> {
    const { data } = await api.patch<Notification>(`/notifications/${id}/read`)
    return data
  },

  async markAsRead(id: number): Promise<Notification> {
    return this.markRead(id)
  },

  async markAllRead(): Promise<void> {
    await api.patch('/notifications/read-all')
  },

  async markAllAsRead(): Promise<void> {
    await this.markAllRead()
  },
}
