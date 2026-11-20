import { api } from './api'
import type {
  AdminItemDetails,
  AdminItemQuery,
  CreateAdminItemPayload,
  Item,
  LostReport,
  Page,
  UpdateAdminItemPayload,
} from '../types'

export const adminItemService = {
  async list(query?: AdminItemQuery): Promise<Page<Item>> {
    const { data } = await api.get<Page<Item>>('/admin/items', { params: query })
    return data
  },
  async getById(id: number): Promise<AdminItemDetails> {
    const { data } = await api.get<AdminItemDetails>(`/admin/items/${id}`)
    return data
  },
  async getPossibleOwners(id: number): Promise<LostReport[]> {
    const { data } = await api.get<LostReport[]>(`/admin/items/${id}/possible-owners`)
    return data
  },
  async create(payload: CreateAdminItemPayload): Promise<Item> {
    const { data } = await api.post<Item>('/admin/items', payload)
    return data
  },
  async update(id: number, payload: UpdateAdminItemPayload): Promise<Item> {
    const { data } = await api.patch<Item>(`/admin/items/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/admin/items/${id}`)
  },
}
