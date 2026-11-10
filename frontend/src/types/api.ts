export interface PaginationMeta {
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface Page<T> {
  data: T[]
  pagination: PaginationMeta
}

export interface PageQuery {
  page?: number
  per_page?: number
  limit?: number
  search?: string
  q?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  [key: string]: any
}

export interface ApiError {
  statusCode: number
  message: string
  errors?: Record<string, string[]>
}
