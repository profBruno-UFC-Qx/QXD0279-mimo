import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminItemDetails, LostReport } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { useAdminSession } from './useAdminSession'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import {
  extractLostReportErrorMessage,
  getErrorStatus,
  isPositiveSafeId,
  parsePositiveReportId,
} from '@/utils/lostReport'
import { isItemDeliverable, isItemEditable } from '@/utils/adminItems'

export function useAdminItemDetail() {
  const route = useRoute()
  const router = useRouter()
  const { hasAccess: hasAdminAccess } = useAdminSession()
  const ui = useUiStore()
  const categoriesStore = useCategoriesStore()
  const buildingsStore = useBuildingsStore()

  const details = ref<AdminItemDetails | null>(null)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const notFound = ref(false)
  const deleting = ref(false)
  const deleteError = ref<string | null>(null)
  const handoverDialogOpen = ref(false)

  const possibleOwners = ref<LostReport[]>([])
  const ownersLoading = ref(false)
  const ownersError = ref<string | null>(null)

  const reportDialogOpen = ref(false)
  const selectedReport = ref<LostReport | null>(null)
  const reportLoading = ref(false)
  const reportChecking = ref(false)
  const resolvingReport = ref(false)
  const reportError = ref<string | null>(null)

  let ownersRequestId = 0
  let reportRequestId = 0
  let resolveRequestId = 0

  const itemId = computed(() => parsePositiveReportId(String(route.params.id ?? '')))
  const isEditable = computed(() => details.value !== null && isItemEditable(details.value.item.status))
  const canDeliver = computed(() => details.value !== null && isItemDeliverable(details.value.item.status))
  const categoryName = computed(() =>
    details.value ? categoryLabel(details.value.item.categoryId) : '-',
  )
  const buildingName = computed(() =>
    details.value ? buildingLabel(details.value.item.buildingId) : '-',
  )

  function categoryLabel(id: number): string {
    return categoriesStore.items.find((category) => category.id === id)?.name ?? `Categoria #${id}`
  }

  function buildingLabel(id: number | null): string {
    if (id === null) return 'Qualquer prédio'
    return buildingsStore.items.find((building) => building.id === id)?.name ?? `Prédio #${id}`
  }

  function resetReportDialog() {
    ++reportRequestId
    reportDialogOpen.value = false
    selectedReport.value = null
    reportLoading.value = false
    reportChecking.value = false
    reportError.value = null
  }

  function resetOwnersState() {
    ++ownersRequestId
    possibleOwners.value = []
    ownersLoading.value = false
    ownersError.value = null
    resetReportDialog()
  }

  async function loadDetails(options: { keepContent?: boolean } = {}) {
    const id = itemId.value
    if (!options.keepContent) {
      details.value = null
      handoverDialogOpen.value = false
      resetOwnersState()
    }
    loadError.value = null
    notFound.value = false
    deleteError.value = null

    if (id === null) {
      notFound.value = true
      return
    }

    loading.value = true
    try {
      details.value = await adminItemService.getById(id)
      void loadPossibleOwners()
    } catch (err: unknown) {
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        notFound.value = true
      } else if (httpStatus === 403) {
        loadError.value = 'Sua sessão não possui permissão administrativa para consultar itens.'
      } else {
        loadError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível carregar os detalhes do item. Tente novamente.',
        )
      }
    } finally {
      loading.value = false
    }
  }

  async function loadPossibleOwners() {
    const id = itemId.value
    if (id === null) return

    if (!hasAdminAccess.value) {
      possibleOwners.value = []
      ownersError.value = 'Sua sessão não possui permissão administrativa para consultar possíveis donos.'
      return
    }

    const requestId = ++ownersRequestId
    ownersLoading.value = true
    ownersError.value = null

    try {
      const reports = await adminItemService.getPossibleOwners(id)
      if (requestId !== ownersRequestId || itemId.value !== id) return
      possibleOwners.value = reports
    } catch (err: unknown) {
      if (requestId !== ownersRequestId || itemId.value !== id) return
      possibleOwners.value = []
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        ownersError.value = 'O item não foi encontrado.'
      } else if (httpStatus === 403) {
        ownersError.value =
          'Sua sessão não possui permissão administrativa para consultar possíveis donos.'
      } else {
        ownersError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível carregar os possíveis donos. Tente novamente.',
        )
      }
    } finally {
      if (requestId === ownersRequestId) {
        ownersLoading.value = false
      }
    }
  }

  async function loadReport(reportId: number) {
    if (!isPositiveSafeId(reportId)) return

    const requestId = ++reportRequestId
    reportLoading.value = true
    reportError.value = null

    try {
      const fresh = await adminLostReportService.getById(reportId)
      if (requestId !== reportRequestId) return
      selectedReport.value = fresh
    } catch (err: unknown) {
      if (requestId !== reportRequestId) return
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        reportError.value = 'Este relato não existe mais no servidor.'
        await loadPossibleOwners()
      } else if (httpStatus === 403) {
        reportError.value =
          'Sua sessão não possui permissão administrativa para consultar relatos de perda.'
      } else {
        reportError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível consultar o relato. Tente novamente.',
        )
      }
    } finally {
      if (requestId === reportRequestId) {
        reportLoading.value = false
      }
    }
  }

  function openReport(report: LostReport) {
    if (!hasAdminAccess.value || !isPositiveSafeId(report.id)) return
    reportDialogOpen.value = true
    selectedReport.value = report
    void loadReport(report.id)
  }

  function retryReportLoad() {
    if (selectedReport.value) void loadReport(selectedReport.value.id)
  }

  function closeReportDialog() {
    if (resolvingReport.value || reportChecking.value) return
    resetReportDialog()
  }

  async function reconcileReportState(reportId: number) {
    if (selectedReport.value?.id !== reportId || reportChecking.value) return

    reportChecking.value = true
    try {
      const fresh = await adminLostReportService.getById(reportId)
      if (selectedReport.value?.id !== reportId) return

      selectedReport.value = fresh
      if (fresh.status === 'RESOLVED') {
        ui.notifySuccess('O relato já estava resolvido.')
        resetReportDialog()
        await loadPossibleOwners()
        return
      }
      if (fresh.status === 'CANCELLED') {
        reportError.value = 'Este relato foi cancelado pelo autor e não pode ser encerrado.'
        await loadPossibleOwners()
        return
      }
      reportError.value =
        'O relato continua aberto. Consulte o estado atual antes de tentar encerrar novamente.'
    } catch (err: unknown) {
      if (selectedReport.value?.id !== reportId) return
      const httpStatus = getErrorStatus(err)
      resetReportDialog()
      ui.notifyError(
        httpStatus === 404
          ? 'Este relato não existe mais no servidor.'
          : 'Não foi possível confirmar o estado do relato. Consulte novamente antes de tentar encerrar.',
      )
      await loadPossibleOwners()
    } finally {
      reportChecking.value = false
    }
  }

  async function resolveReport(reportId: number) {
    if (resolvingReport.value || !isPositiveSafeId(reportId)) return

    const requestId = ++resolveRequestId
    resolvingReport.value = true
    reportError.value = null

    try {
      const updated = await adminLostReportService.resolve(reportId)
      if (requestId !== resolveRequestId || selectedReport.value?.id !== reportId) return

      if (updated.status !== 'RESOLVED') {
        await reconcileReportState(reportId)
        return
      }

      ui.notifySuccess('Relato de perda encerrado com sucesso.')
      resetReportDialog()
      await loadPossibleOwners()
    } catch (err: unknown) {
      if (requestId !== resolveRequestId) return
      const httpStatus = getErrorStatus(err)

      if (httpStatus === 401) return
      if (httpStatus === 403) {
        reportError.value =
          'Sua sessão não possui permissão administrativa para encerrar relatos de perda.'
        return
      }
      if (httpStatus === 404) {
        reportError.value = 'Este relato não existe mais no servidor.'
        await loadPossibleOwners()
        return
      }
      if (httpStatus === 400) {
        reportError.value = extractLostReportErrorMessage(
          err,
          'O relato não pode ser encerrado neste estado.',
        )
        return
      }

      await reconcileReportState(reportId)
    } finally {
      if (requestId === resolveRequestId) {
        resolvingReport.value = false
      }
    }
  }

  async function confirmResolveReport() {
    const report = selectedReport.value
    if (
      !report ||
      report.status !== 'OPEN' ||
      !hasAdminAccess.value ||
      resolvingReport.value ||
      reportLoading.value ||
      reportChecking.value ||
      reportError.value !== null ||
      ui.confirmDialog.show ||
      ui.confirmDialog.open
    ) {
      return
    }

    const confirmed = await ui.confirm({
      title: 'Encerrar relato de perda?',
      message: `O relato #${report.id} será marcado como resolvido e o autor será notificado. Isso encerra a perda, mas não registra a entrega do item nem confirma a propriedade.`,
      confirmText: 'Encerrar relato',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    await resolveReport(report.id)
  }

  function goBack() {
    void router.push({ name: 'admin-items' })
  }

  function openEdit() {
    if (!details.value || !isEditable.value) return
    void router.push({ name: 'admin-item-edit', params: { id: details.value.item.id } })
  }

  function handleHandoverCreated() {
    void loadDetails()
  }

  function handleHandoverConflict() {
    void loadDetails({ keepContent: true })
  }

  async function requestDelete() {
    if (!details.value || !isEditable.value || deleting.value) return

    const confirmed = await ui.confirm({
      title: 'Excluir item?',
      message: `Deseja realmente excluir "${details.value.item.title}"? Itens com histórico não podem ser excluídos.`,
      danger: true,
      confirmText: 'Excluir item',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    deleting.value = true
    deleteError.value = null
    try {
      await adminItemService.remove(details.value.item.id)
      ui.notifySuccess('Item excluído com sucesso.')
      await router.push({ name: 'admin-items' })
    } catch (err: unknown) {
      const httpStatus = getErrorStatus(err)
      if (httpStatus === 404) {
        deleteError.value = 'Este item já foi removido anteriormente.'
      } else if (httpStatus === 409) {
        deleteError.value = extractLostReportErrorMessage(
          err,
          'Este item possui histórico e não pode ser excluído.',
        )
      } else if (httpStatus === 403) {
        deleteError.value = 'Sua sessão não possui permissão administrativa para excluir itens.'
      } else {
        deleteError.value = extractLostReportErrorMessage(
          err,
          'Não foi possível excluir o item. Tente novamente.',
        )
      }
    } finally {
      deleting.value = false
    }
  }

  watch(itemId, () => void loadDetails(), { immediate: true })

  onMounted(() => {
    void categoriesStore.ensureLoaded()
    void buildingsStore.ensureLoaded()
  })

  return {
    goBack,
    details,
    canDeliver,
    deleting,
    handoverDialogOpen,
    hasAdminAccess,
    isEditable,
    openEdit,
    requestDelete,
    deleteError,
    notFound,
    loadError,
    loadDetails,
    loading,
    categoryName,
    buildingName,
    ownersLoading,
    ownersError,
    possibleOwners,
    loadPossibleOwners,
    openReport,
    handleHandoverCreated,
    handleHandoverConflict,
    reportDialogOpen,
    selectedReport,
    reportLoading,
    reportError,
    categoryLabel,
    buildingLabel,
    reportChecking,
    resolvingReport,
    closeReportDialog,
    confirmResolveReport,
    retryReportLoad,
  }
}
