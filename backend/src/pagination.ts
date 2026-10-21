// Metadados de paginacao presentes 
export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number; 
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  per_page?: number;
}

// monta uma resposta paginada a partir de uma lista de dados e do total de registros
export function paginate<T>(
  data: T[],
  total: number,
  query: PaginationQuery = {},
): Paginated<T> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.floor(query.per_page ?? 20)));

  return {
    data,
    pagination: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
  };
}