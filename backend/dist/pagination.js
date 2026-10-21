// monta uma resposta paginada a partir de uma lista de dados e do total de registros
export function paginate(data, total, query = {}) {
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
