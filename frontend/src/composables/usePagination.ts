import { ref, shallowRef } from 'vue'
import type { Page, PageQuery } from '@/types'


// Composable genérico de paginação. Deve ser chamado por uma view/componente
// passando como `fetcher` o método de um service; 
export function usePagination<T, Q extends PageQuery = PageQuery>(fetcher: (q: Q) => Promise<Page<T>>) {
  const items = shallowRef<T[]>([])
  const page = ref(1)
  const limit = ref(12)
  const total = ref(0)
  const loading = ref(false)
  const error = ref(false)

  // Busca a página atual pelo service recebido e atualiza os dados e estados da lista.
  async function load(extraParams?: Q) {
    loading.value = true
    error.value = false
    try {
      const res = await fetcher({
        page: page.value,
        per_page: limit.value,
        ...extraParams,
      } as Q)
      items.value = res.data
      total.value = res.pagination.total
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  return { items, page, limit, total, loading, error, load }
}
