import { api } from './api'
import type { Handover, HandoverPayload } from '../types'

export const handoverService = {
  async create(itemId: number, payload: HandoverPayload): Promise<Handover> {
    const { data } = await api.post<Handover>(`/handovers/item/${itemId}`, payload)
    return data
  },
  async getByItem(itemId: number): Promise<Handover> {
    const { data } = await api.get<Handover>(`/handovers/item/${itemId}`)
    return data
  },
}
