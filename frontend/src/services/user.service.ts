import { api } from './api'
import type { User } from '../types'

export interface UpdateProfilePayload {
  name?: string
  phone?: string | null
  password?: string
}

export const userService = {
  async me(): Promise<User> {
    const { data } = await api.get<User>('/users/me')
    return data
  },
  async updateMe(payload: UpdateProfilePayload): Promise<User> {
    const { data } = await api.patch<User>('/users/me', payload)
    return data
  },
}
