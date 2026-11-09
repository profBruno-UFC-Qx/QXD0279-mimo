import { api } from './api'
import type { Category, CategoryPayload, Page, PageQuery } from '../types'

export const categoryService = {
  async list(params?: PageQuery): Promise<any> {
    const { data } = await api.get<any>('/categories', { params })
    return data
  },
  async create(payload: CategoryPayload): Promise<Category> {
    const { data } = await api.post<Category>('/categories', payload)
    return data
  },
  async update(id: number, payload: Partial<CategoryPayload>): Promise<Category> {
    const { data } = await api.put<Category>(`/categories/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/categories/${id}`)
  },
}
