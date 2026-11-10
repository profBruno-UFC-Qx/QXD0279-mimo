import { api } from './api'
import type { Item, ItemPayload, ItemQuery, Page } from '../types'

export const adminItemService = {
  async list(query?: ItemQuery): Promise<Page<Item>> {
    const { data } = await api.get<Page<Item>>('/admin/items', { params: query })
    return data
  },
  async getById(id: number): Promise<Item> {
    const { data } = await api.get<Item>(`/admin/items/${id}`)
    return data
  },
  async getPossibleOwners(id: number): Promise<any[]> {
    const { data } = await api.get<any[]>(`/admin/items/${id}/possible-owners`)
    return data
  },
  async create(payload: ItemPayload): Promise<Item> {
    const { data } = await api.post<Item>('/admin/items', payload)
    return data
  },
  async update(id: number, payload: Partial<ItemPayload>): Promise<Item> {
    const { data } = await api.patch<Item>(`/admin/items/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/admin/items/${id}`)
  },
}
