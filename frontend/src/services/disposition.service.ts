import { api } from './api'
import type { Disposition, DispositionPayload } from '../types'

export const dispositionService = {
  async execute(itemId: number, payload: DispositionPayload): Promise<Disposition> {
    const { data } = await api.post<Disposition>(`/dispositions/item/${itemId}`, payload)
    return data
  },
}
