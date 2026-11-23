import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AdminLostReportQuery, LostReport, LostReportStatus, PaginationMeta } from '@/types'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { useAdminSession, type AdminSessionSnapshot } from './useAdminSession'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useUiStore } from '@/stores/uiStore'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import {
  isOutOfRangeAdminLostReportPage,
  isValidAdminLostReportDetail,
  isValidAdminLostReportPage,
  isValidResolvedLostReportResponse,
} from '@/utils/adminLostReports'
import { type LostReportFilters } from '@/types/adminFilters'

export function useAdminLostReports() {
  interface ListSnapshot extends AdminSessionSnapshot {
    requestId: number
    mutationEpoch: number
    status: LostReportStatus | null
    categoryId: number | null
    buildingId: number | null
    page: number
    perPage: number
  }

  interface DetailSnapshot extends AdminSessionSnapshot {
    requestId: number
    reportId: number
  }

  interface ResolveSnapshot extends AdminSessionSnapshot {
    requestId: number
    reportId: number
  }

  const DEFAULT_PER_PAGE = 12

  const { auth, hasAccess: hasAdminAccess, captureSession } = useAdminSession()
  const categoriesStore = useCategoriesStore()
  const buildingsStore = useBuildingsStore()
  const ui = useUiStore()

  const reports = ref<LostReport[]>([])
  const pagination = ref<PaginationMeta>({
    total: 0,
    page: 1,
    per_page: DEFAULT_PER_PAGE,
    total_pages: 0,
  })
  const currentPage = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)

  const draftFilters = ref<LostReportFilters>({
    status: null,
    categoryId: null,
    buildingId: null,
  })
  const appliedFilters = ref<LostReportFilters>({
    status: null,
    categoryId: null,
    buildingId: null,
  })

  const loadingList = ref(false)
  const listError = ref<string | null>(null)
  const outOfRangeError = ref(false)

  const detailDialogOpen = ref(false)
  const selectedReportId = ref<number | null>(null)
  const detailReport = ref<LostReport | null>(null)
  const loadingDetail = ref(false)
  const detailError = ref<string | null>(null)
  const detailNotFound = ref(false)

  const confirmingReportId = ref<number | null>(null)
  const resolving = ref(false)
  const resolvingReportId = ref<number | null>(null)
  const resolveError = ref<string | null>(null)
  const resolveRecoveryReportId = ref<number | null>(null)
  const resolveNotFoundNotice = ref(false)
  const checkingRecovery = ref(false)

  let latestListReqId = 0
  let listMutationEpoch = 0
  let latestDetailReqId = 0
  let latestResolveReqId = 0
  let latestRecoveryReqId = 0
  let activeResolveSubmissionOwnerId: number | null = null
  let latestConfirmId = 0
  let latestSessionWatchId = 0
  let activeConfirmResolver: ((value: boolean) => void) | null = null
  let unmounted = false


  const categoryOptions = computed(() => [
    { title: 'Todas', value: null as number | null },
    ...categoriesStore.items.map((c) => ({ title: c.name, value: c.id })),
  ])

  const buildingOptions = computed(() => [
    { title: 'Todos', value: null as number | null },
    ...buildingsStore.items.map((b) => ({ title: b.name, value: b.id })),
  ])

  const categoryMap = computed(() => {
    const map = new Map<number, string>()
    for (const cat of categoriesStore.items) {
      map.set(cat.id, cat.name)
    }
    return map
  })

  const buildingMap = computed(() => {
    const map = new Map<number, string>()
    for (const bld of buildingsStore.items) {
      map.set(bld.id, bld.name)
    }
    return map
  })

  function formatCategoryLabel(categoryId: number): string {
    return categoryMap.value.get(categoryId) ?? `Categoria #${categoryId}`
  }

  function formatBuildingLabel(buildingId: number | null): string {
    if (buildingId === null) return 'Qualquer prédio'
    return buildingMap.value.get(buildingId) ?? `Prédio #${buildingId}`
  }

  function isSameAdminSession(snapshot: AdminSessionSnapshot): boolean {
    if (unmounted || !hasAdminAccess.value) return false
    if (auth.sessionGeneration !== snapshot.generation) return false
    if (!auth.token || auth.token !== snapshot.token) return false
    if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
    if (auth.user?.role !== snapshot.role) return false
    return true
  }

  function ownsListRequest(snapshot: ListSnapshot): boolean {
    return snapshot.requestId === latestListReqId && isSameAdminSession(snapshot)
  }

  function isCurrentListRequest(snapshot: ListSnapshot): boolean {
    return ownsListRequest(snapshot) && snapshot.mutationEpoch === listMutationEpoch
  }

  function ownsDetailRequest(snapshot: DetailSnapshot): boolean {
    return snapshot.requestId === latestDetailReqId && isSameAdminSession(snapshot)
  }

  function isCurrentDetailRequest(snapshot: DetailSnapshot): boolean {
    return (
      ownsDetailRequest(snapshot) &&
      detailDialogOpen.value &&
      selectedReportId.value === snapshot.reportId
    )
  }

  function isCurrentResolveRequest(snapshot: ResolveSnapshot): boolean {
    return snapshot.requestId === latestResolveReqId && isSameAdminSession(snapshot)
  }

  function isCurrentRecoveryRequest(snapshot: ResolveSnapshot): boolean {
    return snapshot.requestId === latestRecoveryReqId && isSameAdminSession(snapshot)
  }

  function releaseResolveSubmission(snapshot: ResolveSnapshot) {
    if (
      !unmounted &&
      isSameAdminSession(snapshot) &&
      activeResolveSubmissionOwnerId === snapshot.requestId
    ) {
      resolving.value = false
      resolvingReportId.value = null
      activeResolveSubmissionOwnerId = null
    }
  }

  function dismissOwnedConfirmDialog() {
    if (
      activeConfirmResolver !== null &&
      ui.confirmDialog.show &&
      ui.confirmDialog.resolve === activeConfirmResolver
    ) {
      ui.closeConfirmation(activeConfirmResolver)
      activeConfirmResolver(false)
    }
    activeConfirmResolver = null
    confirmingReportId.value = null
  }

  function resetAllAdminState() {
    dismissOwnedConfirmDialog()
    reports.value = []
    pagination.value = {
      total: 0,
      page: 1,
      per_page: DEFAULT_PER_PAGE,
      total_pages: 0,
    }
    currentPage.value = 1
    loadingList.value = false
    listError.value = null
    outOfRangeError.value = false

    detailDialogOpen.value = false
    selectedReportId.value = null
    detailReport.value = null
    loadingDetail.value = false
    detailError.value = null
    detailNotFound.value = false

    resolving.value = false
    resolvingReportId.value = null
    activeResolveSubmissionOwnerId = null
    resolveError.value = null
    resolveRecoveryReportId.value = null
    resolveNotFoundNotice.value = false
    checkingRecovery.value = false
  }

  function buildListQuery(filters: LostReportFilters, page: number, limit: number): AdminLostReportQuery {
    const query: AdminLostReportQuery = {
      page,
      per_page: limit,
    }
    if (filters.status !== null) query.status = filters.status
    if (filters.categoryId !== null) query.categoryId = filters.categoryId
    if (filters.buildingId !== null) query.buildingId = filters.buildingId
    return query
  }

  async function loadCatalogs() {
    if (unmounted || !hasAdminAccess.value) return
    await Promise.allSettled([categoriesStore.ensureLoaded(), buildingsStore.ensureLoaded()])
  }

  async function loadReports(options: { allowOutOfRangeRecovery?: boolean } = {}) {
    const { allowOutOfRangeRecovery = true } = options
    if (unmounted || !hasAdminAccess.value) {
      resetAllAdminState()
      return
    }

    const session = captureSession()
    const filtersSnapshot: LostReportFilters = { ...appliedFilters.value }
    const snapshot: ListSnapshot = {
      ...session,
      requestId: ++latestListReqId,
      mutationEpoch: listMutationEpoch,
      status: filtersSnapshot.status,
      categoryId: filtersSnapshot.categoryId,
      buildingId: filtersSnapshot.buildingId,
      page: currentPage.value,
      perPage: perPage.value,
    }

    loadingList.value = true
    listError.value = null
    outOfRangeError.value = false

    try {
      const res = await adminLostReportService.list(
        buildListQuery(filtersSnapshot, snapshot.page, snapshot.perPage),
      )

      if (!isCurrentListRequest(snapshot)) return

      if (
        !isValidAdminLostReportPage(res, {
          page: snapshot.page,
          perPage: snapshot.perPage,
          status: snapshot.status ?? undefined,
          categoryId: snapshot.categoryId ?? undefined,
          buildingId: snapshot.buildingId ?? undefined,
        })
      ) {
        reports.value = []
        listError.value = 'Não foi possível validar os relatos recebidos do servidor.'
        return
      }

      if (isOutOfRangeAdminLostReportPage(res)) {
        if (allowOutOfRangeRecovery && res.pagination.total_pages >= 1) {
          currentPage.value = res.pagination.total_pages
          await loadReports({ allowOutOfRangeRecovery: false })
          return
        }
        reports.value = []
        pagination.value = res.pagination
        outOfRangeError.value = true
        return
      }

      reports.value = res.data
      pagination.value = res.pagination
    } catch (err: unknown) {
      if (!isCurrentListRequest(snapshot)) return
      const status = getErrorStatus(err)
      reports.value = []
      if (status === 403) {
        listError.value = 'Sua sessão não possui permissão administrativa para listar perdas.'
        return
      }
      listError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os relatos de perda. Tente novamente.',
      )
    } finally {
      if (ownsListRequest(snapshot)) {
        loadingList.value = false
      }
    }
  }

  function applyFilters() {
    if (!hasAdminAccess.value) return
    appliedFilters.value = { ...draftFilters.value }
    currentPage.value = 1
    void loadReports()
  }

  function clearFilters() {
    if (!hasAdminAccess.value) return
    draftFilters.value = { status: null, categoryId: null, buildingId: null }
    appliedFilters.value = { status: null, categoryId: null, buildingId: null }
    currentPage.value = 1
    void loadReports()
  }

  function handlePageChange(newPage: number) {
    if (!hasAdminAccess.value || !isPositiveSafeId(newPage)) return
    currentPage.value = newPage
    void loadReports()
  }

  function handleLimitChange(newLimit: number) {
    if (!hasAdminAccess.value || !isPositiveSafeId(newLimit) || newLimit > 100) return
    perPage.value = newLimit
    currentPage.value = 1
    void loadReports()
  }

  function returnToFirstPage() {
    currentPage.value = 1
    void loadReports({ allowOutOfRangeRecovery: false })
  }

  async function openDetails(reportId: number) {
    if (unmounted || !hasAdminAccess.value || !isPositiveSafeId(reportId)) return
    selectedReportId.value = reportId
    detailDialogOpen.value = true
    detailReport.value = null
    detailError.value = null
    detailNotFound.value = false
    await loadReportDetail(reportId)
  }

  async function loadReportDetail(reportId: number) {
    if (unmounted || !hasAdminAccess.value || !isPositiveSafeId(reportId)) return
    const snapshot: DetailSnapshot = {
      ...captureSession(),
      requestId: ++latestDetailReqId,
      reportId,
    }

    loadingDetail.value = true
    detailError.value = null
    detailNotFound.value = false

    try {
      const dto = await adminLostReportService.getById(reportId)
      if (!isCurrentDetailRequest(snapshot)) return

      if (!isValidAdminLostReportDetail(dto, reportId)) {
        detailReport.value = null
        detailError.value = 'Os detalhes retornados pelo servidor são inválidos.'
        return
      }

      detailReport.value = dto
    } catch (err: unknown) {
      if (!isCurrentDetailRequest(snapshot)) return
      const status = getErrorStatus(err)
      detailReport.value = null
      if (status === 404) {
        detailNotFound.value = true
        detailError.value = 'Relato de perda não encontrado.'
        return
      }
      if (status === 403) {
        detailError.value = 'Sessão sem permissão administrativa para consultar detalhes.'
        return
      }
      detailError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os detalhes do relato.',
      )
    } finally {
      if (ownsDetailRequest(snapshot)) {
        loadingDetail.value = false
      }
    }
  }

  function retryDetail() {
    if (selectedReportId.value !== null) {
      void loadReportDetail(selectedReportId.value)
    }
  }

  function closeDetails() {
    ++latestDetailReqId
    detailDialogOpen.value = false
    selectedReportId.value = null
    detailReport.value = null
    loadingDetail.value = false
    detailError.value = null
    detailNotFound.value = false
  }

  function patchReportLocally(updated: LostReport) {
    const index = reports.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) {
      const next = [...reports.value]
      next[index] = updated
      reports.value = next
    }
    if (detailReport.value?.id === updated.id) {
      detailReport.value = updated
    }
  }

  async function applyConfirmedServerState(fresh: LostReport) {
    ++listMutationEpoch
    patchReportLocally(fresh)

    if (appliedFilters.value.status === 'OPEN' && fresh.status !== 'OPEN') {
      reports.value = reports.value.filter((item) => item.id !== fresh.id)
      await loadReports()
    }
  }

  async function reconcileReportStateByGet(
    reportId: number,
    options: { fromConflict?: boolean } = {},
  ) {
    if (unmounted || !hasAdminAccess.value || !isPositiveSafeId(reportId)) return
    const session = captureSession()
    const snapshot: ResolveSnapshot = {
      ...session,
      requestId: ++latestRecoveryReqId,
      reportId,
    }

    checkingRecovery.value = true
    try {
      const fresh = await adminLostReportService.getById(reportId)
      if (!isCurrentRecoveryRequest(snapshot)) return

      if (!isValidAdminLostReportDetail(fresh, reportId)) {
        resolveError.value = 'Não foi possível validar o estado atual do relato.'
        resolveRecoveryReportId.value = reportId
        return
      }

      await applyConfirmedServerState(fresh)
      if (!isCurrentRecoveryRequest(snapshot)) return

      resolveRecoveryReportId.value = null
      resolveNotFoundNotice.value = false

      if (options.fromConflict) {
        if (fresh.status === 'RESOLVED') {
          resolveError.value = 'Este relato já havia sido resolvido anteriormente.'
        } else if (fresh.status === 'CANCELLED') {
          resolveError.value = 'Este relato foi cancelado pelo autor e não pode ser resolvido.'
        } else {
          resolveError.value = null
        }
      } else {
        resolveError.value = null
      }
    } catch (err: unknown) {
      if (!isCurrentRecoveryRequest(snapshot)) return
      const status = getErrorStatus(err)
      if (status === 404) {
        resolveRecoveryReportId.value = null
        resolveNotFoundNotice.value = true
        resolveError.value = 'Relato de perda não encontrado.'
        return
      }
      resolveRecoveryReportId.value = reportId
      resolveError.value =
        'Não foi possível consultar o estado atual do relato. Tente consultar novamente.'
    } finally {
      if (!unmounted && snapshot.requestId === latestRecoveryReqId && isSameAdminSession(snapshot)) {
        checkingRecovery.value = false
      }
    }
  }

  async function requestResolveReport(report: LostReport) {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      resolving.value ||
      confirmingReportId.value !== null ||
      ui.confirmDialog.show ||
      ui.confirmDialog.open ||
      report.status !== 'OPEN' ||
      !isPositiveSafeId(report.id)
    ) {
      return
    }

    resolveError.value = null
    resolveRecoveryReportId.value = null
    resolveNotFoundNotice.value = false

    const sessionAtPrompt = captureSession()
    const confirmId = ++latestConfirmId
    confirmingReportId.value = report.id

    let confirmed = false
    let ownResolver: ((confirmed: boolean) => void) | null = null
    try {
      const promptPromise = ui.confirm({
        title: 'Resolver relato de perda?',
        message: `O relato #${report.id} será marcado como resolvido e seu autor receberá uma notificação. Esta operação não pode ser desfeita por esta interface.`,
        confirmText: 'Confirmar resolução',
        cancelText: 'Voltar',
      })
      ownResolver = ui.confirmDialog.resolve
      activeConfirmResolver = ownResolver
      confirmed = await promptPromise
    } finally {
      ui.closeConfirmation(ownResolver)
      if (activeConfirmResolver !== null && confirmId === latestConfirmId) {
        activeConfirmResolver = null
      }
      if (!unmounted && confirmId === latestConfirmId) {
        confirmingReportId.value = null
      }
    }

    if (
      !confirmed ||
      unmounted ||
      confirmId !== latestConfirmId ||
      !isSameAdminSession(sessionAtPrompt)
    ) {
      return
    }

    ++latestRecoveryReqId
    checkingRecovery.value = false
    resolveError.value = null
    resolveRecoveryReportId.value = null
    resolveNotFoundNotice.value = false

    const snapshot: ResolveSnapshot = {
      ...sessionAtPrompt,
      requestId: ++latestResolveReqId,
      reportId: report.id,
    }

    activeResolveSubmissionOwnerId = snapshot.requestId
    resolving.value = true
    resolvingReportId.value = report.id

    try {
      const updated = await adminLostReportService.resolve(report.id)
      if (!isCurrentResolveRequest(snapshot)) return

      if (!isValidResolvedLostReportResponse(updated, report.id)) {
        resolveRecoveryReportId.value = report.id
        resolveError.value =
          'Resposta inválida ao resolver o relato. Consulte o estado atual antes de tentar novamente.'
        return
      }

      await applyConfirmedServerState(updated)
      if (!isCurrentResolveRequest(snapshot)) return

      resolveError.value = null
      resolveRecoveryReportId.value = null
      resolveNotFoundNotice.value = false
      ui.notifySuccess('Relato de perda resolvido com sucesso.')
    } catch (err: unknown) {
      if (!isCurrentResolveRequest(snapshot)) return
      const status = getErrorStatus(err)

      if (status === 401) {
        return
      }
      if (status === 403) {
        resolveError.value = 'Você não possui permissão administrativa para resolver este relato.'
        return
      }
      if (status === 404) {
        resolveNotFoundNotice.value = true
        resolveRecoveryReportId.value = null
        resolveError.value = 'Relato de perda não encontrado. Recarregue a listagem.'
        return
      }
      if (status === 409) {
        await reconcileReportStateByGet(report.id, { fromConflict: true })
        return
      }

      resolveRecoveryReportId.value = report.id
      resolveError.value =
        'Não foi possível confirmar o resultado da resolução. Consulte o estado atual antes de tentar novamente.'
    } finally {
      releaseResolveSubmission(snapshot)
    }
  }

  watch(
    () => [auth.sessionGeneration, auth.token, auth.user?.id, auth.user?.role],
    async () => {
      const watchId = ++latestSessionWatchId
      const generationAtChange = auth.sessionGeneration
      const tokenAtChange = auth.token
      ++latestListReqId
      ++latestDetailReqId
      ++latestResolveReqId
      ++latestRecoveryReqId
      ++latestConfirmId
      resetAllAdminState()

      await nextTick()
      if (
        unmounted ||
        watchId !== latestSessionWatchId ||
        auth.sessionGeneration !== generationAtChange ||
        auth.token !== tokenAtChange ||
        !hasAdminAccess.value
      ) {
        return
      }

      void loadCatalogs()
      void loadReports()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void loadCatalogs()
    void loadReports()
  })

  onBeforeUnmount(() => {
    unmounted = true
    ++latestListReqId
    ++latestDetailReqId
    ++latestResolveReqId
    ++latestRecoveryReqId
    ++latestConfirmId
    activeResolveSubmissionOwnerId = null
    dismissOwnedConfirmDialog()
  })

  return {
    loadingList,
    hasAdminAccess,
    loadReports,
    draftFilters,
    categoryOptions,
    buildingOptions,
    applyFilters,
    clearFilters,
    resolveError,
    resolveRecoveryReportId,
    checkingRecovery,
    reconcileReportStateByGet,
    resolveNotFoundNotice,
    listError,
    outOfRangeError,
    returnToFirstPage,
    reports,
    pagination,
    formatCategoryLabel,
    formatBuildingLabel,
    currentPage,
    perPage,
    openDetails,
    handlePageChange,
    handleLimitChange,
    detailDialogOpen,
    selectedReportId,
    detailReport,
    loadingDetail,
    detailNotFound,
    detailError,
    closeDetails,
    retryDetail,
  }
}
