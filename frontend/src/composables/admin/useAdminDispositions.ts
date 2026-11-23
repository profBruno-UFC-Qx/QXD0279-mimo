import { computed, onMounted, ref } from 'vue'
import type { AdminItemQuery, Disposition, DispositionQuery, Item, PaginationMeta } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { dispositionService } from '@/services/disposition.service'
import { useAdminSession } from './useAdminSession'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { type DispositionHistoryFilters } from '@/types/adminFilters'

export function useAdminDispositions() {
  type Section = 'eligible' | 'history'

  const DEFAULT_PER_PAGE = 12

  const { hasAccess: hasAdminAccess } = useAdminSession()
  const categoriesStore = useCategoriesStore()
  const buildingsStore = useBuildingsStore()

  const activeSection = ref<Section>('eligible')

  const eligibleItems = ref<Item[]>([])
  const eligiblePagination = ref<PaginationMeta>({
    total: 0,
    page: 1,
    per_page: DEFAULT_PER_PAGE,
    total_pages: 0,
  })
  const eligiblePage = ref(1)
  const eligiblePerPage = ref(DEFAULT_PER_PAGE)
  const eligibleLoading = ref(false)
  const eligibleError = ref<string | null>(null)

  const selectedItem = ref<Item | null>(null)
  const dispositionDialogOpen = ref(false)

  const history = ref<Disposition[]>([])
  const historyPagination = ref<PaginationMeta>({
    total: 0,
    page: 1,
    per_page: DEFAULT_PER_PAGE,
    total_pages: 0,
  })
  const historyPage = ref(1)
  const historyPerPage = ref(DEFAULT_PER_PAGE)
  const historyLoading = ref(false)
  const historyError = ref<string | null>(null)

  const draftHistoryFilters = ref<DispositionHistoryFilters>({ destination: null, from: null, to: null })
  const appliedHistoryFilters = ref<DispositionHistoryFilters>({ destination: null, from: null, to: null })
  const historyFilterError = ref<string | null>(null)

  const detailOpen = ref(false)
  const detailId = ref<number | null>(null)
  const detail = ref<Disposition | null>(null)
  const detailLoading = ref(false)
  const detailError = ref<string | null>(null)
  const detailNotFound = ref(false)

  let latestEligibleRequestId = 0
  let latestHistoryRequestId = 0
  let latestDetailRequestId = 0


  const hasHistoryFilters = computed(
    () =>
      appliedHistoryFilters.value.destination !== null ||
      appliedHistoryFilters.value.from !== null ||
      appliedHistoryFilters.value.to !== null,
  )
  const eligiblePageWithoutResults = computed(
    () =>
      !eligibleLoading.value &&
      eligibleError.value === null &&
      eligibleItems.value.length === 0 &&
      eligiblePagination.value.total > 0 &&
      eligiblePage.value > 1,
  )
  const historyPageWithoutResults = computed(
    () =>
      !historyLoading.value &&
      historyError.value === null &&
      history.value.length === 0 &&
      historyPagination.value.total > 0 &&
      historyPage.value > 1,
  )

  function categoryLabel(id: number): string {
    return categoriesStore.items.find((category) => category.id === id)?.name ?? `Categoria #${id}`
  }

  function buildingLabel(id: number): string {
    return buildingsStore.items.find((building) => building.id === id)?.name ?? `Prédio #${id}`
  }

  async function loadEligibleItems() {
    if (!hasAdminAccess.value) return

    const requestId = ++latestEligibleRequestId
    eligibleLoading.value = true
    eligibleError.value = null

    const query: AdminItemQuery = {
      status: 'ELIGIBLE',
      page: eligiblePage.value,
      per_page: eligiblePerPage.value,
    }

    try {
      const res = await adminItemService.list(query)
      if (requestId !== latestEligibleRequestId) return
      eligibleItems.value = res.data
      eligiblePagination.value = res.pagination
    } catch (err: unknown) {
      if (requestId !== latestEligibleRequestId) return
      eligibleItems.value = []
      eligiblePagination.value = {
        total: 0,
        page: eligiblePage.value,
        per_page: eligiblePerPage.value,
        total_pages: 0,
      }
      const httpStatus = getErrorStatus(err)
      eligibleError.value =
        httpStatus === 403
          ? 'Sua sessão não possui permissão administrativa para consultar itens elegíveis.'
          : extractLostReportErrorMessage(
              err,
              'Não foi possível carregar os itens elegíveis. Tente novamente.',
            )
    } finally {
      if (requestId === latestEligibleRequestId) {
        eligibleLoading.value = false
      }
    }
  }

  function buildHistoryQuery(): DispositionQuery {
    const query: DispositionQuery = {
      page: historyPage.value,
      per_page: historyPerPage.value,
    }
    if (appliedHistoryFilters.value.destination !== null) {
      query.destination = appliedHistoryFilters.value.destination
    }
    if (appliedHistoryFilters.value.from !== null) query.from = appliedHistoryFilters.value.from
    if (appliedHistoryFilters.value.to !== null) query.to = appliedHistoryFilters.value.to
    return query
  }

  async function loadHistory() {
    if (!hasAdminAccess.value) return

    const requestId = ++latestHistoryRequestId
    historyLoading.value = true
    historyError.value = null

    try {
      const res = await dispositionService.list(buildHistoryQuery())
      if (requestId !== latestHistoryRequestId) return
      history.value = res.data
      historyPagination.value = res.pagination
    } catch (err: unknown) {
      if (requestId !== latestHistoryRequestId) return
      history.value = []
      historyPagination.value = {
        total: 0,
        page: historyPage.value,
        per_page: historyPerPage.value,
        total_pages: 0,
      }
      const httpStatus = getErrorStatus(err)
      historyError.value =
        httpStatus === 403
          ? 'Sua sessão não possui permissão administrativa para consultar destinações.'
          : extractLostReportErrorMessage(
              err,
              'Não foi possível carregar o histórico de destinações. Tente novamente.',
            )
    } finally {
      if (requestId === latestHistoryRequestId) {
        historyLoading.value = false
      }
    }
  }

  function applyHistoryFilters() {
    if (!hasAdminAccess.value) return
    if (
      draftHistoryFilters.value.from !== null &&
      draftHistoryFilters.value.to !== null &&
      draftHistoryFilters.value.from > draftHistoryFilters.value.to
    ) {
      historyFilterError.value = 'A data inicial não pode ser posterior à data final.'
      return
    }
    historyFilterError.value = null
    appliedHistoryFilters.value = { ...draftHistoryFilters.value }
    historyPage.value = 1
    void loadHistory()
  }

  function clearHistoryFilters() {
    if (!hasAdminAccess.value) return
    draftHistoryFilters.value = { destination: null, from: null, to: null }
    appliedHistoryFilters.value = { destination: null, from: null, to: null }
    historyFilterError.value = null
    historyPage.value = 1
    void loadHistory()
  }

  function changeEligiblePage(nextPage: number) {
    if (!isPositiveSafeId(nextPage)) return
    eligiblePage.value = nextPage
    void loadEligibleItems()
  }

  function changeEligibleLimit(nextLimit: number) {
    if (!isPositiveSafeId(nextLimit)) return
    eligiblePerPage.value = nextLimit
    eligiblePage.value = 1
    void loadEligibleItems()
  }

  function changeHistoryPage(nextPage: number) {
    if (!isPositiveSafeId(nextPage)) return
    historyPage.value = nextPage
    void loadHistory()
  }

  function changeHistoryLimit(nextLimit: number) {
    if (!isPositiveSafeId(nextLimit)) return
    historyPerPage.value = nextLimit
    historyPage.value = 1
    void loadHistory()
  }

  function returnToFirstEligiblePage() {
    eligiblePage.value = 1
    void loadEligibleItems()
  }

  function returnToFirstHistoryPage() {
    historyPage.value = 1
    void loadHistory()
  }

  function openDisposition(item: Item) {
    if (!hasAdminAccess.value || item.status !== 'ELIGIBLE') return
    selectedItem.value = item
    dispositionDialogOpen.value = true
  }

  function handleDispositionCreated() {
    if (eligibleItems.value.length === 1 && eligiblePage.value > 1) {
      eligiblePage.value -= 1
    }
    void loadEligibleItems()
    void loadHistory()
  }

  function handleDispositionConflict() {
    void loadEligibleItems()
    void loadHistory()
  }

  async function openDetails(dispositionId: number) {
    if (!isPositiveSafeId(dispositionId)) return

    const requestId = ++latestDetailRequestId
    detailOpen.value = true
    detailId.value = dispositionId
    detail.value = null
    detailError.value = null
    detailNotFound.value = false
    detailLoading.value = true

    try {
      const res = await dispositionService.getById(dispositionId)
      if (requestId !== latestDetailRequestId) return
      detail.value = res
    } catch (err: unknown) {
      if (requestId !== latestDetailRequestId) return
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        detailNotFound.value = true
      } else if (httpStatus === 403) {
        detailError.value =
          'Sua sessão não possui permissão administrativa para consultar destinações.'
      } else {
        detailError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível carregar os detalhes da destinação. Tente novamente.',
        )
      }
    } finally {
      if (requestId === latestDetailRequestId) {
        detailLoading.value = false
      }
    }
  }

  function retryDetails() {
    if (detailId.value === null) return
    void openDetails(detailId.value)
  }

  function closeDetails() {
    ++latestDetailRequestId
    detailOpen.value = false
    detailId.value = null
    detail.value = null
    detailError.value = null
    detailNotFound.value = false
    detailLoading.value = false
  }

  function refreshAll() {
    void loadEligibleItems()
    void loadHistory()
  }

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void categoriesStore.ensureLoaded()
    void buildingsStore.ensureLoaded()
    void loadEligibleItems()
    void loadHistory()
  })

  return {
    hasAdminAccess,
    eligibleLoading,
    historyLoading,
    refreshAll,
    activeSection,
    eligibleError,
    eligiblePageWithoutResults,
    eligibleItems,
    categoryLabel,
    buildingLabel,
    eligiblePagination,
    eligiblePage,
    eligiblePerPage,
    loadEligibleItems,
    returnToFirstEligiblePage,
    openDisposition,
    changeEligiblePage,
    changeEligibleLimit,
    draftHistoryFilters,
    historyFilterError,
    historyError,
    historyPageWithoutResults,
    history,
    hasHistoryFilters,
    historyPagination,
    historyPage,
    historyPerPage,
    applyHistoryFilters,
    clearHistoryFilters,
    loadHistory,
    returnToFirstHistoryPage,
    openDetails,
    changeHistoryPage,
    changeHistoryLimit,
    dispositionDialogOpen,
    selectedItem,
    handleDispositionCreated,
    handleDispositionConflict,
    detailOpen,
    detail,
    detailLoading,
    detailNotFound,
    detailError,
    closeDetails,
    retryDetails,
  }
}
