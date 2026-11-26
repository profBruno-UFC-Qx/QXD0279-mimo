import { api } from './api'
import type {
  CreateLostReportResult,
  LostReport,
  LostReportMineQuery,
  LostReportPayload,
  Page,
  PageQuery,
  PublicCatalogItem,
} from '../types'

export const lostReportService = {
  async list(query?: PageQuery): Promise<Page<LostReport>> {
    const { data } = await api.get<Page<LostReport>>('/lost-reports', { params: query })
    return data
  },
  async mine(query?: LostReportMineQuery): Promise<LostReport[]> {
    const { data } = await api.get<LostReport[]>('/lost-reports/mine', { params: query })
    if (!Array.isArray(data)) {
      throw new Error('Resposta inválida ao carregar perdas.')
    }
    return data
  },
  async getById(id: number): Promise<LostReport> {
    const { data } = await api.get<LostReport>(`/lost-reports/${id}`)
    return data
  },
  async create(payload: LostReportPayload): Promise<CreateLostReportResult> {
    const { data } = await api.post<CreateLostReportResult>('/lost-reports', payload)
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
  async confirmSuggestion(reportId: number, itemId: number): Promise<LostReport> {
    const { data } = await api.post<LostReport>(
      `/lost-reports/${reportId}/suggestions/${itemId}/confirm`,
    )
    return data
  },
  async getSuggestions(
    reportId: number,
    query?: { page?: number; per_page?: number },
  ): Promise<Page<PublicCatalogItem>> {
    const { data } = await api.get<Page<PublicCatalogItem>>(
      `/lost-reports/${reportId}/suggestions`,
      { params: query },
    )
    return data
  },
}
