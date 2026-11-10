import { api } from './api'
import type { Handover, HandoverPayload, Page, PageQuery } from '../types'

export const handoverService = {
  async create(payload: HandoverPayload & { itemId: number }): Promise<Handover> {
    const { data } = await api.post<Handover>('/handovers', payload)
    return data
  },
  async list(query?: PageQuery): Promise<Page<Handover>> {
    const { data } = await api.get<Page<Handover>>('/handovers', { params: query })
    return data
  },
  async mine(): Promise<Handover[]> {
    const { data } = await api.get<Handover[]>('/handovers/mine')
    return data
  },
  async getById(id: number): Promise<Handover> {
    const { data } = await api.get<Handover>(`/handovers/${id}`)
    return data
  },
}
