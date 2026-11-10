import { api } from './api'
import type { User, UserRole } from '../types'

export interface CreateAdminPayload {
  name: string
  email: string
  password: string
  phone?: string | null
  role: UserRole
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
    const { data } = await api.post<User>('/admins', payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/admins/${id}`)
  },
}
