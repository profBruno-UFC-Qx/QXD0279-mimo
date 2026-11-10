import { api } from './api'
import type { Item, ItemQuery, Page } from '../types'

export const itemService = {
  async list(query?: ItemQuery): Promise<Page<Item>> {
    const { data } = await api.get<Page<Item>>('/items', { params: query })
    return data
  },
  async getById(id: number): Promise<Item> {
    const { data } = await api.get<Item>(`/items/${id}`)
    return data
  },
}
