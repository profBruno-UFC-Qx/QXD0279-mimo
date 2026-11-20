import { api } from './api'
import type {
  CreateDispositionRulePayload,
  DispositionRule,
  DispositionRuleQuery,
  UpdateDispositionRulePayload,
} from '../types'

export const dispositionRuleService = {
  async list(query?: DispositionRuleQuery): Promise<DispositionRule[]> {
    const { data } = await api.get<DispositionRule[]>('/disposition-rules', { params: query })
    return data
  },
  async getById(id: number): Promise<DispositionRule> {
    const { data } = await api.get<DispositionRule>(`/disposition-rules/${id}`)
    return data
  },
  async create(payload: CreateDispositionRulePayload): Promise<DispositionRule> {
    const { data } = await api.post<DispositionRule>('/disposition-rules', payload)
    return data
  },
  async update(id: number, payload: UpdateDispositionRulePayload): Promise<DispositionRule> {
    const { data } = await api.patch<DispositionRule>(`/disposition-rules/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/disposition-rules/${id}`)
  },
}
