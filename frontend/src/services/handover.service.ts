import { api } from './api'
import type { AdminHandoverQuery, Handover, HandoverPayload, Page } from '../types'

export const handoverService = {
  async create(payload: HandoverPayload): Promise<Handover> {
    const { data } = await api.post<Handover>('/handovers', payload)
    return data
  },
  async list(query?: AdminHandoverQuery): Promise<Page<Handover>> {
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
