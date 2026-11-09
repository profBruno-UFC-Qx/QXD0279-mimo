import { api } from './api'
import type { LoginPayload, LoginResponse, RegisterPayload, User } from '../types'

export const authService = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', payload)
    return data
  },
  async register(payload: RegisterPayload): Promise<User> {
    const { data } = await api.post<User>('/auth/register', payload)
    return data
  },
  async me(): Promise<User> {
    const { data } = await api.get<User>('/users/me')
    return data
  },
}
