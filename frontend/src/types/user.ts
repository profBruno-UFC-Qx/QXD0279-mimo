export type UserRole = 'USER' | 'ADMIN' | 'SUPERADMIN'

export interface User {
  id: number
  name: string
  email: string
  phone: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}
