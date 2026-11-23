import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AdminItemQuery, Item, ItemStatus, PaginationMeta } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { useAdminSession } from './useAdminSession'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'

export function useAdminItems() {
  const DEFAULT_PER_PAGE = 12
  const SEARCH_DEBOUNCE_MS = 350

  const router = useRouter()
  const { hasAccess: hasAdminAccess } = useAdminSession()
  const ui = useUiStore()
  const categoriesStore = useCategoriesStore()
  const buildingsStore = useBuildingsStore()

  const items = ref<Item[]>([])
  const pagination = ref<PaginationMeta>({
    total: 0,
    page: 1,
    per_page: DEFAULT_PER_PAGE,
    total_pages: 0,
  })
  const currentPage = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)
  const search = ref('')
  const categoryId = ref<number | null>(null)
  const buildingId = ref<number | null>(null)
  const status = ref<ItemStatus | null>(null)

  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const deletingId = ref<number | null>(null)

  let latestRequestId = 0
  let filterTimer: ReturnType<typeof setTimeout> | null = null

  const hasFilters = computed(
    () =>
      search.value.trim() !== '' ||
      categoryId.value !== null ||
      buildingId.value !== null ||
      status.value !== null,
  )

  const categoryNames = computed(() => new Map(categoriesStore.items.map((c) => [c.id, c.name])))
  const buildingNames = computed(() => new Map(buildingsStore.items.map((b) => [b.id, b.name])))

  function categoryLabel(id: number): string {
    return categoryNames.value.get(id) ?? `Categoria #${id}`
  }

  function buildingLabel(id: number): string {
    return buildingNames.value.get(id) ?? `Prédio #${id}`
  }

  function buildQuery(): AdminItemQuery {
    const query: AdminItemQuery = { page: currentPage.value, per_page: perPage.value }
    const trimmedSearch = search.value.trim()
    if (trimmedSearch !== '') query.search = trimmedSearch
    if (categoryId.value !== null) query.categoryId = categoryId.value
    if (buildingId.value !== null) query.buildingId = buildingId.value
    if (status.value !== null) query.status = status.value
    return query
  }

  async function loadItems() {
    if (!hasAdminAccess.value) return
    if (filterTimer) {
      clearTimeout(filterTimer)
      filterTimer = null
    }

    const requestId = ++latestRequestId
    loading.value = true
    loadError.value = null

    try {
      const res = await adminItemService.list(buildQuery())
      if (requestId !== latestRequestId) return
      items.value = res.data
      pagination.value = res.pagination
    } catch (err: unknown) {
      if (requestId !== latestRequestId) return
      items.value = []
      pagination.value = {
        total: 0,
        page: currentPage.value,
        per_page: perPage.value,
        total_pages: 0,
      }
      const httpStatus = getErrorStatus(err)
      loadError.value =
        httpStatus === 403
          ? 'Sua sessão não possui permissão administrativa para listar itens.'
          : extractLostReportErrorMessage(err, 'Não foi possível carregar os itens. Tente novamente.')
    } finally {
      if (requestId === latestRequestId) {
        loading.value = false
      }
    }
  }

  function changePage(nextPage: number) {
    if (!isPositiveSafeId(nextPage)) return
    currentPage.value = nextPage
    void loadItems()
  }

  function changeLimit(nextLimit: number) {
    if (!isPositiveSafeId(nextLimit)) return
    perPage.value = nextLimit
    currentPage.value = 1
    void loadItems()
  }

  function openDetails(item: Item) {
    void router.push({ name: 'admin-item-detail', params: { id: item.id } })
  }

  function openEdit(item: Item) {
    if (!isItemEditable(item.status)) return
    void router.push({ name: 'admin-item-edit', params: { id: item.id } })
  }

  async function requestDelete(item: Item) {
    if (!hasAdminAccess.value || !isItemEditable(item.status) || deletingId.value !== null) return

    const confirmed = await ui.confirm({
      title: 'Excluir item?',
      message: `Deseja realmente excluir "${item.title}"? Itens com histórico não podem ser excluídos.`,
      danger: true,
      confirmText: 'Excluir item',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    deletingId.value = item.id
    try {
      await adminItemService.remove(item.id)
      ui.notifySuccess('Item excluído com sucesso.')
      if (items.value.length === 1 && currentPage.value > 1) {
        currentPage.value -= 1
      }
      await loadItems()
    } catch (err: unknown) {
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        ui.notifyError('Este item já foi removido anteriormente.')
        await loadItems()
      } else if (httpStatus === 409) {
        ui.notifyError(
          extractLostReportErrorMessage(
            err,
            'Este item possui histórico e não pode ser excluído.',
          ),
        )
      } else if (httpStatus === 403) {
        ui.notifyError('Sua sessão não possui permissão administrativa para excluir itens.')
      } else {
        ui.notifyError(extractLostReportErrorMessage(err, 'Não foi possível excluir o item.'))
      }
    } finally {
      deletingId.value = null
    }
  }

  watch([search, categoryId, buildingId, status], () => {
    if (!hasAdminAccess.value) return
    if (filterTimer) clearTimeout(filterTimer)
    filterTimer = setTimeout(() => {
      filterTimer = null
      currentPage.value = 1
      void loadItems()
    }, SEARCH_DEBOUNCE_MS)
  })

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void loadItems()
    void categoriesStore.ensureLoaded()
    void buildingsStore.ensureLoaded()
  })

  onBeforeUnmount(() => {
    ++latestRequestId
    if (filterTimer) {
      clearTimeout(filterTimer)
      filterTimer = null
    }
  })

  return {
    hasAdminAccess,
    loading,
    loadItems,
    search,
    categoryId,
    buildingId,
    status,
    loadError,
    items,
    categoryLabel,
    buildingLabel,
    deletingId,
    hasFilters,
    pagination,
    currentPage,
    perPage,
    openDetails,
    openEdit,
    requestDelete,
    changePage,
    changeLimit,
  }
}
