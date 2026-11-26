import { computed, onMounted, ref } from 'vue'
import type { AdminHandoverQuery, Handover, PaginationMeta } from '@/types'
import { handoverService } from '@/services/handover.service'
import { useAdminSession } from './useAdminSession'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { type HandoverFilters } from '@/types/adminFilters'

export function useAdminHandovers() {
  const DEFAULT_PER_PAGE = 12

  const { hasAccess: hasAdminAccess } = useAdminSession()

  const handovers = ref<Handover[]>([])
  const pagination = ref<PaginationMeta>({
    total: 0,
    page: 1,
    per_page: DEFAULT_PER_PAGE,
    total_pages: 0,
  })
  const currentPage = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)

  const draftFilters = ref<HandoverFilters>({ itemId: '', adminId: '', cpf: '', from: null, to: null })
  const appliedFilters = ref<HandoverFilters>({ itemId: '', adminId: '', cpf: '', from: null, to: null })
  const filterError = ref<string | null>(null)

  const loading = ref(false)
  const listError = ref<string | null>(null)

  const detailOpen = ref(false)
  const detailId = ref<number | null>(null)
  const detail = ref<Handover | null>(null)
  const detailLoading = ref(false)
  const detailError = ref<string | null>(null)
  const detailNotFound = ref(false)

  let latestListRequestId = 0
  let latestDetailRequestId = 0

  const hasFilters = computed(
    () =>
      appliedFilters.value.itemId.trim() !== '' ||
      appliedFilters.value.adminId.trim() !== '' ||
      appliedFilters.value.cpf.trim() !== '' ||
      appliedFilters.value.from !== null ||
      appliedFilters.value.to !== null,
  )
  const pageWithoutResults = computed(
    () =>
      !loading.value &&
      listError.value === null &&
      handovers.value.length === 0 &&
      pagination.value.total > 0 &&
      currentPage.value > 1,
  )

  function parseOptionalId(value: string): number | undefined | null {
    const text = value.trim()
    if (text === '') return undefined
    if (!/^[1-9]\d*$/.test(text)) return null
    const id = Number(text)
    return isPositiveSafeId(id) ? id : null
  }

  function buildQuery(): AdminHandoverQuery {
    const query: AdminHandoverQuery = {
      page: currentPage.value,
      per_page: perPage.value,
    }
    const itemId = parseOptionalId(appliedFilters.value.itemId)
    if (typeof itemId === 'number') query.itemId = itemId
    const adminId = parseOptionalId(appliedFilters.value.adminId)
    if (typeof adminId === 'number') query.adminId = adminId
    const cpf = appliedFilters.value.cpf.replace(/\D/g, '')
    if (cpf) query.cpf = cpf
    if (appliedFilters.value.from !== null) query.from = appliedFilters.value.from
    if (appliedFilters.value.to !== null) query.to = appliedFilters.value.to
    return query
  }

  async function loadHandovers() {
    if (!hasAdminAccess.value) return

    const requestId = ++latestListRequestId
    loading.value = true
    listError.value = null

    try {
      const res = await handoverService.list(buildQuery())
      if (requestId !== latestListRequestId) return
      handovers.value = res.data
      pagination.value = res.pagination
    } catch (err: unknown) {
      if (requestId !== latestListRequestId) return
      handovers.value = []
      pagination.value = {
        total: 0,
        page: currentPage.value,
        per_page: perPage.value,
        total_pages: 0,
      }
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 403) {
        listError.value = 'Sua sessão não possui permissão administrativa para consultar entregas.'
      } else {
        listError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível carregar as entregas. Tente novamente.',
        )
      }
    } finally {
      if (requestId === latestListRequestId) {
        loading.value = false
      }
    }
  }

  function applyFilters() {
    if (!hasAdminAccess.value) return
    const itemId = parseOptionalId(draftFilters.value.itemId)
    const adminId = parseOptionalId(draftFilters.value.adminId)
    const cpf = draftFilters.value.cpf.replace(/\D/g, '')
    if (itemId === null || adminId === null || (cpf.length > 0 && cpf.length < 3)) {
      filterError.value = 'Informe IDs inteiros positivos e use pelo menos 3 dígitos do CPF.'
      return
    }
    filterError.value = null
    appliedFilters.value = { ...draftFilters.value }
    currentPage.value = 1
    void loadHandovers()
  }

  function clearFilters() {
    if (!hasAdminAccess.value) return
    draftFilters.value = { itemId: '', adminId: '', cpf: '', from: null, to: null }
    appliedFilters.value = { itemId: '', adminId: '', cpf: '', from: null, to: null }
    filterError.value = null
    currentPage.value = 1
    void loadHandovers()
  }

  function handlePageChange(nextPage: number) {
    if (!isPositiveSafeId(nextPage)) return
    currentPage.value = nextPage
    void loadHandovers()
  }

  function handleLimitChange(nextLimit: number) {
    if (!isPositiveSafeId(nextLimit)) return
    perPage.value = nextLimit
    currentPage.value = 1
    void loadHandovers()
  }

  function returnToFirstPage() {
    currentPage.value = 1
    void loadHandovers()
  }

  async function openDetails(handoverId: number) {
    if (!isPositiveSafeId(handoverId)) return

    const requestId = ++latestDetailRequestId
    detailOpen.value = true
    detailId.value = handoverId
    detail.value = null
    detailError.value = null
    detailNotFound.value = false
    detailLoading.value = true

    try {
      const res = await handoverService.getById(handoverId)
      if (requestId !== latestDetailRequestId) return
      detail.value = res
    } catch (err: unknown) {
      if (requestId !== latestDetailRequestId) return
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        detailNotFound.value = true
      } else if (httpStatus === 403) {
        detailError.value = 'Sua sessão não possui permissão administrativa para consultar entregas.'
      } else {
        detailError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível carregar os detalhes da entrega. Tente novamente.',
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

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void loadHandovers()
  })

  return {
    hasAdminAccess,
    loading,
    loadHandovers,
    draftFilters,
    applyFilters,
    clearFilters,
    filterError,
    listError,
    pageWithoutResults,
    returnToFirstPage,
    handovers,
    hasFilters,
    pagination,
    currentPage,
    perPage,
    openDetails,
    handlePageChange,
    handleLimitChange,
    detailOpen,
    detail,
    detailLoading,
    detailNotFound,
    detailError,
    closeDetails,
    retryDetails,
  }
}
