import { api } from './api'
import type { LostReport, LostReportPayload, Page, PageQuery } from '../types'

export const lostReportService = {
  async list(query?: PageQuery): Promise<Page<LostReport>> {
    const { data } = await api.get<Page<LostReport>>('/lost-reports', { params: query })
    return data
  },
  async mine(query?: PageQuery): Promise<Page<LostReport>> {
    const { data } = await api.get<Page<LostReport>>('/lost-reports/mine', { params: query })
    return data
  },
  async getById(id: number): Promise<LostReport> {
    const { data } = await api.get<LostReport>(`/lost-reports/${id}`)
    return data
  },
  async create(payload: LostReportPayload): Promise<LostReport> {
    const { data } = await api.post<LostReport>('/lost-reports', payload)
    return data
  },
  async update(id: number, payload: Partial<LostReportPayload>): Promise<LostReport> {
    const { data } = await api.patch<LostReport>(`/lost-reports/${id}`, payload)
    return data
  },
  async cancel(id: number): Promise<LostReport> {
    const { data } = await api.post<LostReport>(`/lost-reports/${id}/cancel`)
    return data
  },
  async confirmSuggestion(reportId: number, itemId: number): Promise<void> {
    await api.post(`/lost-reports/${reportId}/confirm`, { itemId })
  },
}
