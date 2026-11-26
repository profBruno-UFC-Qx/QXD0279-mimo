import { api } from './api'
import type { User } from '../types'

export interface CreateAdminPayload {
  name: string
  email: string
  initialPassword: string
}

export const adminService = {
  async list(): Promise<User[]> {
    const { data } = await api.get<User[]>('/admins')
    return data
  },
  async getById(id: number): Promise<User> {
    const { data } = await api.get<User>(`/admins/${id}`)
    return data
  },
  async create(payload: CreateAdminPayload): Promise<User> {
    const sanitizedPayload: CreateAdminPayload = {
      name: payload.name,
      email: payload.email,
      initialPassword: payload.initialPassword,
    }
    const { data } = await api.post<User>('/admins', sanitizedPayload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/admins/${id}`)
  },
}
