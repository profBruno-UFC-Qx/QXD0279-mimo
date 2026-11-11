import axios from 'axios'
import { api } from './api'
import type { ItemQuery, Page, PublicCatalogItem, PublicItemDetails } from '../types'

export const itemService = {
  async list(query?: ItemQuery): Promise<Page<PublicCatalogItem>> {
    const { data } = await api.get<Page<PublicCatalogItem>>('/items', { params: query })
    return data
  },
  async getById(id: number): Promise<PublicItemDetails | null> {
    try {
      const { data } = await api.get<PublicItemDetails>(`/items/${id}`)
      return data
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null
      throw error
    }
  },
}
