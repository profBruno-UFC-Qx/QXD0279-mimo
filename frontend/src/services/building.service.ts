import { api } from './api'
import type { Building, BuildingPayload } from '../types'

export const buildingService = {
  async list(): Promise<Building[]> {
    const { data } = await api.get<Building[]>('/buildings')
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
    const { data } = await api.patch<Building>(`/buildings/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/buildings/${id}`)
  },
}
