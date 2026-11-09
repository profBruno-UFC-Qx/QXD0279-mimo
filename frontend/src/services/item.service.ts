import { api } from './api'
import type { Item, ItemPayload, Page, PageQuery } from '../types'

export const itemService = {
  async list(params?: PageQuery): Promise<Page<Item>> {
    const { data } = await api.get<Page<Item>>('/items', { params })
    return data
  },
  async getById(id: number): Promise<Item> {
    const { data } = await api.get<Item>(`/items/${id}`)
    return data
  },
  async adminList(params?: PageQuery): Promise<Page<Item>> {
    const { data } = await api.get<Page<Item>>('/admin/items', { params })
    return data
  },
  async create(payload: ItemPayload): Promise<Item> {
    const { data } = await api.post<Item>('/admin/items', payload)
    return data
  },
  async update(id: number, payload: Partial<ItemPayload>): Promise<Item> {
    const { data } = await api.put<Item>(`/admin/items/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/admin/items/${id}`)
  },
}
