export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface PageQuery {
  page?: number
  size?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  [key: string]: any
}

export interface ApiError {
  message: string
  status?: number
  errors?: Record<string, string[]>
}