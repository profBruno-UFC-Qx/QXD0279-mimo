import { api } from './api'
import type { LostReport, Page, PageQuery } from '../types'

export const adminLostReportService = {
  async list(query?: PageQuery): Promise<Page<LostReport>> {
    const { data } = await api.get<Page<LostReport>>('/admin/lost-reports', { params: query })
    return data
  },
  async getById(id: number): Promise<LostReport> {
    const { data } = await api.get<LostReport>(`/admin/lost-reports/${id}`)
    return data
  },
  async resolve(id: number): Promise<LostReport> {
    const { data } = await api.post<LostReport>(`/admin/lost-reports/${id}/resolve`)
    return data
  },
}
