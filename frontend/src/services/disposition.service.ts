import { api } from './api'
import type { Disposition, DispositionPayload, Page, PageQuery } from '../types'

export const dispositionService = {
  async create(payload: DispositionPayload): Promise<Disposition> {
    const { data } = await api.post<Disposition>('/dispositions', payload)
    return data
  },
  async list(query?: PageQuery): Promise<Page<Disposition>> {
    const { data } = await api.get<Page<Disposition>>('/dispositions', { params: query })
    return data
  },
  async getById(id: number): Promise<Disposition> {
    const { data } = await api.get<Disposition>(`/dispositions/${id}`)
    return data
  },
}
