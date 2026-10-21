const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;
export function paginate(data, total, query = {}) {
    const requestedPage = Number.isFinite(query.page) ? Math.floor(query.page) : DEFAULT_PAGE;
    const requestedPerPage = Number.isFinite(query.per_page)
        ? Math.floor(query.per_page)
        : DEFAULT_PER_PAGE;
    const page = Math.max(1, requestedPage);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, requestedPerPage));
    const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
    return {
        data,
        pagination: {
            total: safeTotal,
            page,
            per_page: perPage,
            total_pages: Math.ceil(safeTotal / perPage),
        },
    };
}
