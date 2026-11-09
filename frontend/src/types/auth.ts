import type { User } from './user'

export interface LoginResponse {
  accessToken: string
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
