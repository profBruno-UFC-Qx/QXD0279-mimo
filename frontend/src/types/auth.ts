import type { User } from './user'

export interface LoginResponse {
  token: string
  user: User
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  phone?: string | null
}

export interface LoginPayload {
  email: string
  password: string
}
