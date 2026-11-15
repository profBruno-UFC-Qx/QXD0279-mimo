import { api } from './api'
import type { AdminLostReportQuery, LostReport, Page } from '../types'

function sanitizeAdminLostReportQuery(query?: AdminLostReportQuery): AdminLostReportQuery | undefined {
  if (!query) return undefined
  const params: AdminLostReportQuery = {}
  if (query.status !== undefined) params.status = query.status
  if (query.categoryId !== undefined) params.categoryId = query.categoryId
  if (query.buildingId !== undefined) params.buildingId = query.buildingId
  if (query.page !== undefined) params.page = query.page
  if (query.per_page !== undefined) params.per_page = query.per_page
  return Object.keys(params).length > 0 ? params : undefined
}

export const adminLostReportService = {
  async list(query?: AdminLostReportQuery): Promise<Page<LostReport>> {
    const { data } = await api.get<Page<LostReport>>('/admin/lost-reports', {
      params: sanitizeAdminLostReportQuery(query),
    })
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
