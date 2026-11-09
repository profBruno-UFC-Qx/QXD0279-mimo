import { api } from './api'
import type { Building, BuildingPayload, Page, PageQuery } from '../types'

export const buildingService = {
  async list(params?: PageQuery): Promise<any> {
    const { data } = await api.get<any>('/buildings', { params })
    return data
  },
  async getById(id: number): Promise<Building> {
    const { data } = await api.get<Building>(`/buildings/${id}`)
    return data
  },
  async create(payload: BuildingPayload): Promise<Building> {
    const { data } = await api.post<Building>('/buildings', payload)
    return data
  },
  async update(id: number, payload: Partial<BuildingPayload>): Promise<Building> {
    const { data } = await api.put<Building>(`/buildings/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/buildings/${id}`)
  },
}
