import { ref, shallowRef } from 'vue'
import type { Page, PageQuery } from '@/types'

function isValidPageResponse<T>(value: unknown): value is Page<T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as { data?: unknown; pagination?: unknown }
  if (!Array.isArray(record.data)) return false
  if (!record.data.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    return false
  }
  if (typeof record.pagination !== 'object' || record.pagination === null || Array.isArray(record.pagination)) {
    return false
  }
  const total = (record.pagination as { total?: unknown }).total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    return false
  }
  return true
}

// Composable genérico de paginação. Deve ser chamado por uma view/componente
// passando como `fetcher` o método de um service.
export function usePagination<T, Q extends PageQuery = PageQuery>(fetcher: (q: Q) => Promise<Page<T>>) {
  const items = shallowRef<T[]>([])
  const page = ref(1)
  const limit = ref(12)
  const total = ref(0)
  const loading = ref(false)
  const error = ref(false)
  let latestRequestId = 0

  // Busca a página atual pelo service recebido e atualiza os dados e estados da lista.
  async function load(extraParams?: Q) {
    const requestId = ++latestRequestId
    if (!Number.isSafeInteger(page.value) || page.value < 1) {
      page.value = 1
    }
    if (!Number.isSafeInteger(limit.value) || limit.value < 1) {
      limit.value = 12
    }

    loading.value = true
    error.value = false
    try {
      const res = await fetcher({
        page: page.value,
        per_page: limit.value,
        ...extraParams,
      } as Q)
      if (requestId !== latestRequestId) return
      if (!isValidPageResponse<T>(res)) {
        throw new Error('Resposta paginada inválida.')
      }
      items.value = res.data
      total.value = res.pagination.total
    } catch {
      if (requestId !== latestRequestId) return
      items.value = []
      total.value = 0
      error.value = true
    } finally {
      if (requestId === latestRequestId) {
        loading.value = false
      }
    }
  }

  return { items, page, limit, total, loading, error, load }
}
