<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { LostReport, PublicCatalogItem } from '@/types'
import { lostReportService } from '@/services/lostReport.service'
import { itemService } from '@/services/item.service'
import { useAuthStore } from '@/stores/authStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDate, formatDateTime } from '@/utils/format'
import {
  buildLostReportPatchPayload,
  extractLostReportErrorMessage,
  getErrorStatus,
  isPositiveSafeId,
  isValidCalendarDate,
  isValidLostReport,
  parsePositiveReportId,
  type EditableLostReportFields,
} from '@/utils/lostReport'
import { isOutOfRangeCatalogPage, isValidPublicCatalogPage } from '@/utils/suggestions'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/domain/StatusChip.vue'
import SuggestionCard from '@/components/domain/SuggestionCard.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'

interface SessionSnapshot {
  requestId: number
  reportId: number
  token: string | null
  userId: number | null
  generation: number
}

interface SuggestionsRequestSnapshot {
  requestId: number
  sessionGeneration: number
  routeId: unknown
  reportId: number
  categoryId: number
}

interface ConfirmationSnapshot {
  confirmationId: number
  reportId: number
  itemId: number
  itemCategoryId: number
  token: string | null
  userId: number | null
  generation: number
}

const GENERIC_DETAIL_ERROR = 'Não foi possível carregar os detalhes da perda. Tente novamente.'
const GENERIC_SAVE_ERROR = 'Não foi possível salvar as alterações. Tente novamente.'
const GENERIC_CANCEL_ERROR = 'Não foi possível cancelar a perda. Verifique o estado do relato e tente novamente.'
const GENERIC_SUGGESTIONS_ERROR =
  'Não foi possível carregar as possíveis correspondências. Tente novamente.'
const GENERIC_CONFIRM_SUGGESTION_ERROR =
  'Não foi possível confirmar o item. Verifique o estado da perda antes de tentar novamente.'
const ITEM_UNAVAILABLE_ERROR = 'Este item não está mais disponível para confirmação.'
const DEFAULT_CONFLICT_ERROR = 'Somente relatos com status OPEN podem ser editados.'
const DEFAULT_CANCEL_CONFLICT_ERROR = 'Somente relatos com status OPEN podem ser cancelados.'
const DEFAULT_SUGGESTION_CONFLICT_ERROR =
  'Não foi possível confirmar o item. O relato não está mais disponível para confirmação.'
const DEFAULT_SUGGESTIONS_PER_PAGE = 12

const route = useRoute()
const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()
const ui = useUiStore()

const report = ref<LostReport | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const notFound = ref(false)

const editing = ref(false)
const saving = ref(false)
const confirmingCancel = ref(false)
const cancelling = ref(false)
const confirmingSuggestion = ref(false)
const submittingConfirmation = ref(false)
const selectedSuggestionId = ref<number | null>(null)
const saveError = ref<string | null>(null)
const cancelError = ref<string | null>(null)
const confirmationError = ref<string | null>(null)
const conflictError = ref<string | null>(null)
const conflictReloadFailed = ref(false)
const attemptedSave = ref(false)
const categoriesAttempted = ref(false)
const buildingsAttempted = ref(false)
const draft = ref<EditableLostReportFields>({
  categoryId: null,
  buildingId: null,
  description: '',
  lossDate: '',
})

const suggestions = ref<PublicCatalogItem[]>([])
const suggestionsPage = ref(1)
const suggestionsPerPage = ref(DEFAULT_SUGGESTIONS_PER_PAGE)
const suggestionsTotal = ref(0)
const suggestionsTotalPages = ref(0)
const suggestionsLoading = ref(false)
const suggestionsError = ref<string | null>(null)
const suggestionsOutOfRange = ref(false)

let latestRequestId = 0
let latestPatchId = 0
let latestCancelId = 0
let latestSuggestionsRequestId = 0
let latestConfirmationId = 0
let activeConfirmationOwnerId: number | null = null
let activeConfirmOwner: 'cancel' | 'suggestion' | null = null
let activeConfirmResolver: ((value: boolean) => void) | null = null
let unmounted = false

const parsedRouteId = computed(() => parsePositiveReportId(route.params.id))
const isInvalidId = computed(() => parsedRouteId.value === null)
const canEdit = computed(() => !editing.value && report.value?.status === 'OPEN' && !loading.value && !error.value && !notFound.value)
const canViewSuggestions = computed(
  () =>
    report.value !== null &&
    report.value.status === 'OPEN' &&
    report.value.confirmedItemId === null,
)
const pageTitle = computed(() => {
  if (parsedRouteId.value === null) return 'Detalhes da perda'
  return editing.value ? `Editar perda #${parsedRouteId.value}` : `Detalhes da perda #${parsedRouteId.value}`
})
const buildingLabel = computed(() => {
  if (!report.value) return ''
  return report.value.buildingId !== null
    ? `Prédio #${report.value.buildingId}`
    : 'Qualquer prédio'
})

const categoriesFailed = computed(
  () => categoriesAttempted.value && !categoriesStore.loading && (categoriesStore.error || !categoriesStore.loaded),
)
const buildingsFailed = computed(
  () => buildingsAttempted.value && !buildingsStore.loading && (buildingsStore.error || !buildingsStore.loaded),
)
const optionsLoadFailed = computed(() => categoriesFailed.value || buildingsFailed.value)

const descriptionError = computed(() => {
  const len = draft.value.description.trim().length
  if (len < 10) return 'A descrição deve conter pelo menos 10 caracteres.'
  if (len > 2000) return 'A descrição deve conter no máximo 2000 caracteres.'
  return null
})

const categoryError = computed(() => {
  if (categoriesFailed.value) return null
  if (!isPositiveSafeId(draft.value.categoryId)) return 'Selecione uma categoria válida.'
  if (
    categoriesStore.loaded &&
    !categoriesStore.items.some((cat) => cat.id === draft.value.categoryId)
  ) {
    return 'Categoria selecionada é inválida.'
  }
  return null
})

const lossDateError = computed(() => {
  if (!isValidCalendarDate(draft.value.lossDate)) return 'Informe uma data válida no formato YYYY-MM-DD.'
  return null
})

const buildingError = computed(() => {
  if (buildingsFailed.value) return null
  const val = draft.value.buildingId
  if (val !== null && !isPositiveSafeId(val)) return 'Selecione um prédio válido.'
  return null
})

const hasValidationError = computed(
  () => Boolean(descriptionError.value || categoryError.value || lossDateError.value || buildingError.value),
)

const patchPayload = computed(() => {
  if (!report.value) return {}
  return buildLostReportPatchPayload(report.value, draft.value, {
    allowCategory: !categoriesFailed.value,
    allowBuilding: !buildingsFailed.value,
  })
})

const hasChanges = computed(() => Object.keys(patchPayload.value).length > 0)

function captureSession(reportId: number): SessionSnapshot {
  return {
    requestId: ++latestRequestId,
    reportId,
    token: auth.token,
    userId: auth.user?.id ?? null,
    generation: auth.sessionGeneration,
  }
}

function isCurrentRequest(snapshot: SessionSnapshot): boolean {
  if (unmounted || snapshot.requestId !== latestRequestId) return false
  if (parsedRouteId.value !== snapshot.reportId) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
  return true
}

function isCurrentPatch(snapshot: SessionSnapshot, patchId: number): boolean {
  if (unmounted || patchId !== latestPatchId) return false
  if (parsedRouteId.value !== snapshot.reportId) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
  return true
}

function isCurrentCancelPost(snapshot: SessionSnapshot, cancelId: number): boolean {
  if (unmounted || cancelId !== latestCancelId) return false
  if (parsedRouteId.value !== snapshot.reportId) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
  return true
}

function isCurrentCancelDecision(snapshot: SessionSnapshot, cancelId: number): boolean {
  if (!isCurrentCancelPost(snapshot, cancelId)) return false
  if (editing.value || saving.value || cancelling.value || confirmingSuggestion.value || submittingConfirmation.value) {
    return false
  }
  if (!report.value || report.value.id !== snapshot.reportId || report.value.status !== 'OPEN') return false
  if (snapshot.userId !== null && report.value.userId !== snapshot.userId) return false
  return true
}

function isCurrentConfirmationPost(snapshot: ConfirmationSnapshot): boolean {
  if (unmounted || snapshot.confirmationId !== latestConfirmationId) return false
  if (parsedRouteId.value !== snapshot.reportId) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
  return true
}

function isCurrentConfirmationDecision(snapshot: ConfirmationSnapshot, initialPage: number): boolean {
  if (!isCurrentConfirmationPost(snapshot)) return false
  if (editing.value || saving.value || cancelling.value || confirmingCancel.value || loading.value) {
    return false
  }
  if (!report.value || !isEligibleForSuggestions(report.value)) return false
  if (report.value.id !== snapshot.reportId) return false
  if (report.value.categoryId !== snapshot.itemCategoryId) return false
  if (snapshot.userId !== null && report.value.userId !== snapshot.userId) return false
  if (suggestionsPage.value !== initialPage) return false
  return true
}

function dismissOwnedConfirmDialog(targetOwner?: 'cancel' | 'suggestion') {
  if (targetOwner && activeConfirmOwner !== targetOwner) return
  const resolvedOwner = activeConfirmOwner
  if (
    (confirmingCancel.value || confirmingSuggestion.value) &&
    activeConfirmResolver !== null &&
    ui.confirmDialog.show &&
    ui.confirmDialog.resolve === activeConfirmResolver
  ) {
    ui.confirmDialog.show = false
    ui.confirmDialog.open = false
    activeConfirmResolver(false)
  }
  activeConfirmResolver = null
  if (resolvedOwner === 'cancel' || !targetOwner) {
    confirmingCancel.value = false
  }
  if (resolvedOwner === 'suggestion' || !targetOwner) {
    confirmingSuggestion.value = false
    selectedSuggestionId.value = null
  }
  if (!targetOwner || resolvedOwner === targetOwner) {
    activeConfirmOwner = null
  }
}

function syncDraftFromReport(source: LostReport) {
  draft.value = {
    categoryId: source.categoryId,
    buildingId: source.buildingId,
    description: source.description,
    lossDate: source.lossDate,
  }
}

function isEligibleForSuggestions(value: LostReport | null): value is LostReport {
  return value !== null && value.status === 'OPEN' && value.confirmedItemId === null
}

function invalidatePendingConfirmation() {
  ++latestConfirmationId
  dismissOwnedConfirmDialog('suggestion')
}

function releaseConfirmationSubmission(confirmationId: number) {
  if (unmounted || activeConfirmationOwnerId !== confirmationId) return
  activeConfirmationOwnerId = null
  submittingConfirmation.value = false
  selectedSuggestionId.value = null
}

function resetSuggestionsState() {
  ++latestSuggestionsRequestId
  invalidatePendingConfirmation()
  suggestions.value = []
  suggestionsPage.value = 1
  suggestionsPerPage.value = DEFAULT_SUGGESTIONS_PER_PAGE
  suggestionsTotal.value = 0
  suggestionsTotalPages.value = 0
  suggestionsLoading.value = false
  suggestionsError.value = null
  suggestionsOutOfRange.value = false
}

function captureSuggestionsSnapshot(reportData: LostReport): SuggestionsRequestSnapshot {
  return {
    requestId: ++latestSuggestionsRequestId,
    sessionGeneration: auth.sessionGeneration,
    routeId: route.params.id,
    reportId: reportData.id,
    categoryId: reportData.categoryId,
  }
}

function isCurrentSuggestionsRequest(snapshot: SuggestionsRequestSnapshot): boolean {
  if (unmounted || !auth.token) return false
  if (snapshot.requestId !== latestSuggestionsRequestId) return false
  if (snapshot.sessionGeneration !== auth.sessionGeneration) return false
  if (snapshot.routeId !== route.params.id) return false
  if (!isEligibleForSuggestions(report.value)) return false
  if (report.value.id !== snapshot.reportId) return false
  if (report.value.categoryId !== snapshot.categoryId) return false
  return true
}

async function loadSuggestions(
  targetReport: LostReport,
  page = suggestionsPage.value,
  perPage = suggestionsPerPage.value,
) {
  if (unmounted || !auth.token || !isEligibleForSuggestions(targetReport)) {
    resetSuggestionsState()
    return
  }

  const snapshot = captureSuggestionsSnapshot(targetReport)
  suggestionsPage.value = page
  suggestionsPerPage.value = perPage
  suggestionsLoading.value = true
  suggestionsError.value = null
  suggestionsOutOfRange.value = false

  try {
    const result = await itemService.list({
      categoryId: snapshot.categoryId,
      page,
      per_page: perPage,
    })
    if (!isCurrentSuggestionsRequest(snapshot)) return

    if (!isValidPublicCatalogPage(result, snapshot.categoryId)) {
      suggestions.value = []
      suggestionsTotal.value = 0
      suggestionsTotalPages.value = 0
      suggestionsOutOfRange.value = false
      suggestionsError.value = GENERIC_SUGGESTIONS_ERROR
      return
    }

    suggestionsTotal.value = result.pagination.total
    suggestionsTotalPages.value = result.pagination.total_pages

    if (isOutOfRangeCatalogPage(result)) {
      suggestions.value = []
      suggestionsOutOfRange.value = true
      return
    }

    suggestions.value = result.data
  } catch {
    if (!isCurrentSuggestionsRequest(snapshot)) return
    suggestions.value = []
    suggestionsTotal.value = 0
    suggestionsTotalPages.value = 0
    suggestionsOutOfRange.value = false
    suggestionsError.value = GENERIC_SUGGESTIONS_ERROR
  } finally {
    if (!unmounted && snapshot.requestId === latestSuggestionsRequestId) {
      suggestionsLoading.value = false
    }
  }
}

function refreshSuggestions() {
  if (!isEligibleForSuggestions(report.value) || submittingConfirmation.value) return
  invalidatePendingConfirmation()
  confirmationError.value = null
  void loadSuggestions(report.value, suggestionsPage.value, suggestionsPerPage.value)
}

function changeSuggestionsPage(nextPage: number) {
  if (!isEligibleForSuggestions(report.value) || submittingConfirmation.value) return
  if (!Number.isSafeInteger(nextPage) || nextPage < 1) return
  invalidatePendingConfirmation()
  confirmationError.value = null
  void loadSuggestions(report.value, nextPage, suggestionsPerPage.value)
}

function changeSuggestionsPerPage(nextLimit: number) {
  if (!isEligibleForSuggestions(report.value) || submittingConfirmation.value) return
  if (!Number.isSafeInteger(nextLimit) || nextLimit < 1 || nextLimit > 100) return
  invalidatePendingConfirmation()
  confirmationError.value = null
  void loadSuggestions(report.value, 1, nextLimit)
}

function resetDetailState() {
  ++latestPatchId
  ++latestCancelId
  ++latestConfirmationId
  activeConfirmationOwnerId = null
  dismissOwnedConfirmDialog()
  report.value = null
  error.value = null
  notFound.value = false
  loading.value = false
  editing.value = false
  saving.value = false
  cancelling.value = false
  confirmingSuggestion.value = false
  submittingConfirmation.value = false
  selectedSuggestionId.value = null
  saveError.value = null
  cancelError.value = null
  confirmationError.value = null
  conflictError.value = null
  conflictReloadFailed.value = false
  attemptedSave.value = false
  resetSuggestionsState()
}

async function loadEditOptions(force = false) {
  await Promise.allSettled([
    categoriesStore.ensureLoaded(force).finally(() => {
      categoriesAttempted.value = true
    }),
    buildingsStore.ensureLoaded(force).finally(() => {
      buildingsAttempted.value = true
    }),
  ])
}

async function enterEditMode() {
  if (
    !report.value ||
    report.value.status !== 'OPEN' ||
    cancelling.value ||
    confirmingCancel.value ||
    confirmingSuggestion.value ||
    submittingConfirmation.value
  ) {
    return
  }
  syncDraftFromReport(report.value)
  saveError.value = null
  cancelError.value = null
  confirmationError.value = null
  conflictError.value = null
  conflictReloadFailed.value = false
  attemptedSave.value = false
  editing.value = true
  await loadEditOptions(false)
}

function cancelEditMode() {
  if (saving.value) return
  editing.value = false
  saveError.value = null
  attemptedSave.value = false
  if (report.value) {
    syncDraftFromReport(report.value)
  }
}

async function loadReport() {
  const reportId = parsedRouteId.value
  if (unmounted || reportId === null || !auth.token) {
    resetDetailState()
    return
  }

  const snapshot = captureSession(reportId)
  report.value = null
  error.value = null
  notFound.value = false
  conflictError.value = null
  conflictReloadFailed.value = false
  editing.value = false
  saveError.value = null
  cancelError.value = null
  confirmationError.value = null
  loading.value = true

  try {
    const data = await lostReportService.getById(reportId)
    if (!isCurrentRequest(snapshot)) return
    const ownerMatches = auth.user !== null && data.userId === auth.user.id
    if (!isValidLostReport(data) || !ownerMatches) {
      report.value = null
      resetSuggestionsState()
      error.value = GENERIC_DETAIL_ERROR
      return
    }
    report.value = data
    if (isEligibleForSuggestions(data)) {
      void loadSuggestions(data, 1, DEFAULT_SUGGESTIONS_PER_PAGE)
    } else {
      resetSuggestionsState()
    }
  } catch (err: unknown) {
    if (!isCurrentRequest(snapshot)) return
    report.value = null
    resetSuggestionsState()
    if (getErrorStatus(err) === 404) {
      notFound.value = true
      error.value = null
      return
    }
    error.value = extractLostReportErrorMessage(err, GENERIC_DETAIL_ERROR)
  } finally {
    if (!unmounted && snapshot.requestId === latestRequestId) {
      loading.value = false
    }
  }
}

type ReloadOwnReportResult =
  | { status: 'ok'; report: LostReport; previousCategoryId: number | undefined }
  | { status: 'stale' | 'invalid' | 'not_found' | 'error' }

async function reloadOwnReport(
  reportId: number,
  isCurrent: () => boolean,
  options?: { setConflictReloadFailedOnError?: boolean },
): Promise<ReloadOwnReportResult> {
  conflictReloadFailed.value = false
  try {
    const fresh = await lostReportService.getById(reportId)
    if (!isCurrent()) return { status: 'stale' }
    const ownerMatches = auth.user !== null && fresh.userId === auth.user.id
    if (!isValidLostReport(fresh) || !ownerMatches) {
      if (options?.setConflictReloadFailedOnError !== false) {
        conflictReloadFailed.value = true
      }
      return { status: 'invalid' }
    }
    const previousCategoryId = report.value?.categoryId
    report.value = fresh
    if (fresh.status !== 'OPEN') {
      editing.value = false
      saveError.value = null
      attemptedSave.value = false
    }
    if (!isEligibleForSuggestions(fresh)) {
      resetSuggestionsState()
    } else if (fresh.categoryId !== previousCategoryId) {
      void loadSuggestions(fresh, 1, suggestionsPerPage.value)
    }
    return { status: 'ok', report: fresh, previousCategoryId }
  } catch (err: unknown) {
    if (!isCurrent()) return { status: 'stale' }
    if (getErrorStatus(err) === 404) {
      resetDetailState()
      notFound.value = true
      return { status: 'not_found' }
    }
    if (options?.setConflictReloadFailedOnError !== false) {
      conflictReloadFailed.value = true
    }
    return { status: 'error' }
  }
}

async function reloadAfterConflict(snapshot: SessionSnapshot) {
  await reloadOwnReport(snapshot.reportId, () => isCurrentRequest(snapshot))
}

async function submitEdit() {
  if (unmounted || saving.value || !editing.value || !report.value || !auth.token) return
  if (report.value.status !== 'OPEN') return

  attemptedSave.value = true
  saveError.value = null
  if (hasValidationError.value || !hasChanges.value) return

  const payload = patchPayload.value
  const previousCategoryId = report.value.categoryId
  const snapshot = captureSession(report.value.id)
  const patchId = ++latestPatchId
  saving.value = true

  try {
    const updated = await lostReportService.update(snapshot.reportId, payload)
    if (!isCurrentPatch(snapshot, patchId)) return
    const ownerMatches = auth.user !== null && updated.userId === auth.user.id
    if (!isValidLostReport(updated) || updated.id !== snapshot.reportId || !ownerMatches) {
      saveError.value = GENERIC_SAVE_ERROR
      return
    }
    report.value = updated
    editing.value = false
    attemptedSave.value = false
    saveError.value = null
    conflictError.value = null
    ui.showSnackbar('Perda atualizada com sucesso.', 'success')
    if (!isEligibleForSuggestions(updated)) {
      resetSuggestionsState()
    } else if (updated.categoryId !== previousCategoryId) {
      void loadSuggestions(updated, 1, suggestionsPerPage.value)
    }
  } catch (err: unknown) {
    if (!isCurrentPatch(snapshot, patchId)) return
    const status = getErrorStatus(err)
    if (status === 404) {
      resetDetailState()
      notFound.value = true
      return
    }
    if (status === 409) {
      const msg = extractLostReportErrorMessage(err, DEFAULT_CONFLICT_ERROR)
      conflictError.value = msg
      saveError.value = msg
      await reloadAfterConflict(snapshot)
      return
    }
    saveError.value = extractLostReportErrorMessage(err, GENERIC_SAVE_ERROR)
  } finally {
    if (!unmounted && patchId === latestPatchId) {
      saving.value = false
    }
  }
}

async function requestCancel() {
  if (
    unmounted ||
    confirmingCancel.value ||
    cancelling.value ||
    confirmingSuggestion.value ||
    submittingConfirmation.value ||
    editing.value ||
    saving.value ||
    loading.value ||
    ui.confirmDialog.show ||
    ui.confirmDialog.open ||
    !report.value ||
    !auth.token ||
    report.value.status !== 'OPEN'
  ) {
    return
  }

  const snapshot = captureSession(report.value.id)
  const cancelId = ++latestCancelId
  cancelError.value = null
  confirmationError.value = null
  conflictError.value = null
  conflictReloadFailed.value = false
  confirmingCancel.value = true

  let confirmed = false
  let ownResolver: ((confirmed: boolean) => void) | null = null
  try {
    const confirmPromise = ui.confirm({
      title: 'Cancelar perda',
      message: 'Tem certeza de que deseja cancelar este relato? Esta ação não poderá ser desfeita.',
      confirmText: 'Sim, cancelar perda',
      cancelText: 'Manter perda',
      danger: true,
    })
    activeConfirmOwner = 'cancel'
    ownResolver = ui.confirmDialog.resolve
    activeConfirmResolver = ownResolver
    confirmed = await confirmPromise
  } finally {
    if (ownResolver && ui.confirmDialog.resolve === ownResolver) {
      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
    }
    if (!unmounted && cancelId === latestCancelId) {
      if (activeConfirmOwner === 'cancel') {
        activeConfirmOwner = null
      }
      activeConfirmResolver = null
      confirmingCancel.value = false
    }
  }

  if (!confirmed || !isCurrentCancelDecision(snapshot, cancelId)) return

  cancelling.value = true
  try {
    const updated = await lostReportService.cancel(snapshot.reportId)
    if (!isCurrentCancelPost(snapshot, cancelId)) return
    const ownerMatches = auth.user !== null && updated.userId === auth.user.id
    if (
      !isValidLostReport(updated) ||
      updated.id !== snapshot.reportId ||
      !ownerMatches ||
      updated.status !== 'CANCELLED'
    ) {
      cancelError.value = GENERIC_CANCEL_ERROR
      return
    }
    report.value = updated
    cancelError.value = null
    conflictError.value = null
    conflictReloadFailed.value = false
    resetSuggestionsState()
    ui.showSnackbar('Perda cancelada com sucesso.', 'success')
  } catch (err: unknown) {
    if (!isCurrentCancelPost(snapshot, cancelId)) return
    const status = getErrorStatus(err)
    if (status === 404) {
      resetDetailState()
      notFound.value = true
      return
    }
    if (status === 409) {
      conflictError.value = extractLostReportErrorMessage(err, DEFAULT_CANCEL_CONFLICT_ERROR)
      cancelError.value = null
      await reloadAfterConflict(snapshot)
      return
    }
    cancelError.value = extractLostReportErrorMessage(err, GENERIC_CANCEL_ERROR)
  } finally {
    if (!unmounted && cancelId === latestCancelId) {
      cancelling.value = false
    }
  }
}

async function handleConfirmSuggestionNotFound(snapshot: ConfirmationSnapshot) {
  const result = await reloadOwnReport(
    snapshot.reportId,
    () => isCurrentConfirmationPost(snapshot),
    { setConflictReloadFailedOnError: false },
  )
  if (result.status === 'stale' || result.status === 'not_found') return
  if (result.status !== 'ok') {
    confirmationError.value = GENERIC_CONFIRM_SUGGESTION_ERROR
    return
  }
  if (isEligibleForSuggestions(result.report)) {
    confirmationError.value = ITEM_UNAVAILABLE_ERROR
    if (result.report.categoryId === result.previousCategoryId) {
      void loadSuggestions(result.report, suggestionsPage.value, suggestionsPerPage.value)
    }
    return
  }
  conflictError.value = DEFAULT_SUGGESTION_CONFLICT_ERROR
  confirmationError.value = null
}

async function requestSuggestionConfirmation(item: PublicCatalogItem) {
  if (
    unmounted ||
    confirmingSuggestion.value ||
    submittingConfirmation.value ||
    confirmingCancel.value ||
    cancelling.value ||
    editing.value ||
    saving.value ||
    loading.value ||
    ui.confirmDialog.show ||
    ui.confirmDialog.open ||
    !report.value ||
    !auth.token ||
    !isEligibleForSuggestions(report.value)
  ) {
    return
  }
  if (!isPositiveSafeId(item.id) || item.categoryId !== report.value.categoryId) {
    return
  }

  const confirmationId = ++latestConfirmationId
  const snapshot: ConfirmationSnapshot = {
    confirmationId,
    reportId: report.value.id,
    itemId: item.id,
    itemCategoryId: item.categoryId,
    token: auth.token,
    userId: auth.user?.id ?? null,
    generation: auth.sessionGeneration,
  }
  const initialPage = suggestionsPage.value

  confirmationError.value = null
  conflictError.value = null
  conflictReloadFailed.value = false
  confirmingSuggestion.value = true
  selectedSuggestionId.value = item.id

  let confirmed = false
  let ownResolver: ((confirmed: boolean) => void) | null = null
  try {
    const itemTitle = item.title.trim() || `Item #${item.id}`
    const confirmPromise = ui.confirm({
      title: 'Confirmar item encontrado',
      message: `Deseja confirmar "${itemTitle}" como possível correspondente à sua perda?`,
      confirmText: 'Sim, é meu item',
      cancelText: 'Voltar',
    })
    activeConfirmOwner = 'suggestion'
    ownResolver = ui.confirmDialog.resolve
    activeConfirmResolver = ownResolver
    confirmed = await confirmPromise
  } finally {
    if (ownResolver && ui.confirmDialog.resolve === ownResolver) {
      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
    }
    if (!unmounted && confirmationId === latestConfirmationId) {
      if (activeConfirmOwner === 'suggestion') {
        activeConfirmOwner = null
      }
      activeConfirmResolver = null
      confirmingSuggestion.value = false
      if (!confirmed) {
        selectedSuggestionId.value = null
      }
    }
  }

  if (!confirmed || !isCurrentConfirmationDecision(snapshot, initialPage)) {
    if (!unmounted && confirmationId === latestConfirmationId) {
      selectedSuggestionId.value = null
    }
    return
  }

  activeConfirmationOwnerId = confirmationId
  submittingConfirmation.value = true
  try {
    const updated = await lostReportService.confirmSuggestion(snapshot.reportId, snapshot.itemId)
    if (!isCurrentConfirmationPost(snapshot)) return

    const ownerMatches = auth.user !== null && updated.userId === auth.user.id
    if (
      !isValidLostReport(updated) ||
      updated.id !== snapshot.reportId ||
      !ownerMatches ||
      updated.confirmedItemId !== snapshot.itemId ||
      updated.status !== 'OPEN'
    ) {
      confirmationError.value = GENERIC_CONFIRM_SUGGESTION_ERROR
      return
    }

    report.value = updated
    confirmationError.value = null
    conflictError.value = null
    conflictReloadFailed.value = false
    releaseConfirmationSubmission(confirmationId)
    resetSuggestionsState()
    ui.showSnackbar('Item confirmado com sucesso.', 'success')
  } catch (err: unknown) {
    if (!isCurrentConfirmationPost(snapshot)) return
    const status = getErrorStatus(err)
    if (status === 404) {
      await handleConfirmSuggestionNotFound(snapshot)
      return
    }
    if (status === 409) {
      conflictError.value = extractLostReportErrorMessage(err, DEFAULT_SUGGESTION_CONFLICT_ERROR)
      confirmationError.value = null
      await reloadOwnReport(snapshot.reportId, () => isCurrentConfirmationPost(snapshot))
      return
    }
    confirmationError.value = extractLostReportErrorMessage(err, GENERIC_CONFIRM_SUGGESTION_ERROR)
  } finally {
    releaseConfirmationSubmission(confirmationId)
  }
}

watch(
  () => route.params.id,
  () => {
    ++latestRequestId
    resetDetailState()
    void loadReport()
  },
  { flush: 'sync' },
)

watch(
  () => auth.sessionGeneration,
  async (targetGeneration) => {
    ++latestRequestId
    resetDetailState()

    await nextTick()
    if (unmounted || auth.sessionGeneration !== targetGeneration) return
    if (!auth.token) return

    void loadReport()
  },
  { flush: 'sync' },
)

onMounted(() => {
  if (!auth.token) return
  void loadReport()
})

onBeforeUnmount(() => {
  unmounted = true
  ++latestRequestId
  ++latestPatchId
  ++latestCancelId
  ++latestSuggestionsRequestId
  ++latestConfirmationId
  activeConfirmationOwnerId = null
  dismissOwnedConfirmDialog()
})
</script>

<template>
  <div>
    <v-btn
      variant="text"
      color="primary"
      class="text-none mb-2 px-0"
      prepend-icon="mdi-arrow-left"
      :to="{ name: 'my-lost-reports' }"
    >
      Voltar para Minhas perdas
    </v-btn>

    <PageHeader
      :title="pageTitle"
      subtitle="Acompanhe as informações do objeto perdido."
    >
      <template v-if="canEdit" #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-pencil-outline"
            :disabled="cancelling || confirmingCancel || confirmingSuggestion || submittingConfirmation"
            @click="enterEditMode"
          >
            Editar perda
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-close-circle-outline"
            :loading="cancelling"
            :disabled="cancelling || confirmingCancel || confirmingSuggestion || submittingConfirmation"
            @click="requestCancel"
          >
            Cancelar perda
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <ErrorAlert
      v-if="error"
      :error="error"
      @retry="loadReport"
    />

    <v-alert
      v-if="cancelError && !editing"
      type="error"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ cancelError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :disabled="cancelling"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <v-alert
      v-if="conflictError && !editing"
      type="warning"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ conflictError }}</span>
        <v-btn
          v-if="conflictReloadFailed"
          size="small"
          variant="text"
          color="warning"
          class="text-none"
          :disabled="cancelling || submittingConfirmation || loading"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <v-alert
      v-if="confirmationError && !editing"
      type="error"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ confirmationError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :disabled="submittingConfirmation || loading"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <LoadingOverlay :loading="loading" text="Carregando detalhes da perda...">
      <v-card v-if="isInvalidId" class="pa-6 rounded-lg border text-center" variant="flat">
        <v-icon icon="mdi-alert-circle-outline" size="48" color="warning" class="mb-3" />
        <h2 class="text-h6 font-weight-medium mb-2">Identificador de perda inválido.</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Verifique o endereço acessado e retorne para a listagem de perdas.
        </p>
        <v-btn color="primary" class="text-none" :to="{ name: 'my-lost-reports' }">
          Voltar para Minhas perdas
        </v-btn>
      </v-card>

      <v-card v-else-if="notFound" class="pa-6 rounded-lg border text-center" variant="flat">
        <v-icon icon="mdi-file-search-outline" size="48" color="grey-darken-1" class="mb-3" />
        <h2 class="text-h6 font-weight-medium mb-2">Relato de perda não encontrado.</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          O relato solicitado não foi encontrado ou não está disponível.
        </p>
        <v-btn color="primary" class="text-none" :to="{ name: 'my-lost-reports' }">
          Voltar para Minhas perdas
        </v-btn>
      </v-card>

      <v-card v-else-if="report && editing" class="pa-6 rounded-lg border" variant="flat">
        <v-alert
          v-if="saveError"
          type="error"
          variant="tonal"
          class="mb-4 rounded-lg"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <span>{{ saveError }}</span>
            <v-btn
              size="small"
              variant="text"
              color="error"
              class="text-none"
              :disabled="saving"
              @click="loadReport"
            >
              Recarregar relato
            </v-btn>
          </div>
        </v-alert>

        <v-alert
          v-if="optionsLoadFailed"
          type="warning"
          variant="tonal"
          class="mb-4 rounded-lg"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <span>Não foi possível carregar todas as opções. Os valores originais foram preservados.</span>
            <v-btn
              size="small"
              variant="text"
              color="warning"
              class="text-none"
              @click="loadEditOptions(true)"
            >
              Recarregar opções
            </v-btn>
          </div>
        </v-alert>

        <v-form @submit.prevent="submitEdit">
          <v-row>
            <v-col cols="12" md="6">
              <CategorySelect
                v-model="draft.categoryId"
                label="Categoria"
                :required="true"
                :clearable="false"
                :show-load-error="false"
                :disabled="saving || categoriesFailed || categoriesStore.loading"
                :error-messages="(attemptedSave || draft.categoryId !== report?.categoryId) && categoryError ? categoryError : undefined"
              />
            </v-col>

            <v-col cols="12" md="6">
              <BuildingSelect
                v-model="draft.buildingId"
                label="Prédio provável"
                hint="Opcional — deixar vazio para qualquer prédio"
                persistent-hint
                :clearable="true"
                :show-load-error="false"
                :disabled="saving || buildingsFailed || buildingsStore.loading"
                :error-messages="(attemptedSave || draft.buildingId !== report?.buildingId) && buildingError ? buildingError : undefined"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="draft.description"
                label="Descrição *"
                rows="4"
                auto-grow
                variant="outlined"
                density="comfortable"
                :disabled="saving"
                :error-messages="(attemptedSave || draft.description !== report?.description) && descriptionError ? descriptionError : undefined"
              />
            </v-col>

            <v-col cols="12" md="6">
              <DatePickerField
                v-model="draft.lossDate"
                label="Data da perda"
                :required="true"
                :clearable="false"
                :disabled="saving"
              />
              <div v-if="(attemptedSave || draft.lossDate !== report?.lossDate) && lossDateError" class="text-caption text-error mt-1">
                {{ lossDateError }}
              </div>
            </v-col>
          </v-row>

          <div class="d-flex flex-wrap justify-end ga-3 mt-4">
            <v-btn
              variant="text"
              class="text-none"
              :disabled="saving"
              @click="cancelEditMode"
            >
              Cancelar edição
            </v-btn>
            <v-btn
              type="submit"
              color="primary"
              class="text-none"
              :loading="saving"
              :disabled="saving || !hasChanges || hasValidationError"
            >
              Salvar alterações
            </v-btn>
          </div>
        </v-form>
      </v-card>

      <v-card v-else-if="report && !error" class="pa-6 rounded-lg border" variant="flat">
        <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-5">
          <span class="text-subtitle-2 text-medium-emphasis">Relato #{{ report.id }}</span>
          <StatusChip :status="report.status" kind="lostReport" />
        </div>

        <v-row>
          <v-col cols="12">
            <div class="text-caption text-medium-emphasis mb-1">Descrição</div>
            <p class="text-body-1 detail-description">{{ report.description }}</p>
          </v-col>

          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">Categoria</div>
            <div class="text-body-1 font-weight-medium">Categoria #{{ report.categoryId }}</div>
          </v-col>

          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">Prédio provável</div>
            <div class="text-body-1 font-weight-medium">{{ buildingLabel }}</div>
          </v-col>

          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">Data da perda</div>
            <div class="text-body-1">{{ formatDate(report.lossDate) }}</div>
          </v-col>

          <v-col cols="12" sm="6">
            <div class="text-caption text-medium-emphasis mb-1">Registrado em</div>
            <div class="text-body-1">{{ formatDateTime(report.createdAt) }}</div>
          </v-col>

          <v-col v-if="report.confirmedItemId !== null" cols="12">
            <v-alert
              type="success"
              variant="tonal"
              border="start"
              class="rounded-lg"
            >
              <div class="text-caption font-weight-medium mb-1">Confirmação</div>
              <div class="text-body-1 font-weight-medium">
                Item confirmado: #{{ report.confirmedItemId }}
              </div>
              <div class="text-body-2 mt-1">
                Você confirmou um item encontrado para esta perda.
              </div>
              <div class="text-body-2">
                Aguarde as próximas orientações da instituição.
              </div>
            </v-alert>
          </v-col>
        </v-row>
      </v-card>

      <section
        v-if="report && !editing && !error && !notFound && canViewSuggestions"
        class="suggestions-section mt-8"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
          <div>
            <h2 class="text-h6 font-weight-bold text-primary">Possíveis correspondências</h2>
            <p class="text-body-2 text-medium-emphasis mb-0">
              Itens encontrados atualmente disponíveis nesta categoria.
            </p>
          </div>
          <v-btn
            variant="outlined"
            color="primary"
            prepend-icon="mdi-refresh"
            :disabled="suggestionsLoading || submittingConfirmation"
            @click="refreshSuggestions"
          >
            Atualizar sugestões
          </v-btn>
        </div>

        <v-progress-linear v-if="suggestionsLoading" indeterminate color="primary" class="mb-4" />

        <ErrorAlert
          v-if="suggestionsError"
          :error="suggestionsError"
          @retry="refreshSuggestions"
        />

        <v-alert v-else-if="suggestionsOutOfRange" type="info" variant="tonal" class="mb-4 rounded-lg">
          <div class="d-flex align-center justify-space-between flex-wrap ga-3">
            <span>Esta página não está mais disponível no catálogo atual.</span>
            <v-btn
              variant="outlined"
              color="primary"
              size="small"
              @click="changeSuggestionsPage(1)"
            >
              Voltar para a página 1
            </v-btn>
          </div>
        </v-alert>

        <EmptyState
          v-else-if="!suggestionsLoading && suggestions.length === 0"
          icon="mdi-package-variant"
          title="Nenhuma correspondência disponível no momento."
          description="Novos itens cadastrados nesta categoria aparecerão aqui automaticamente."
          compact
        />

        <v-row v-else-if="suggestions.length > 0">
          <v-col
            v-for="item in suggestions"
            :key="item.id"
            cols="12"
            sm="6"
            md="4"
          >
            <SuggestionCard
              :item="item"
              mode="confirm"
              :confirming="submittingConfirmation && selectedSuggestionId === item.id"
              :disabled="submittingConfirmation || confirmingSuggestion || cancelling || confirmingCancel || editing || saving || loading"
              @confirm="requestSuggestionConfirmation(item)"
            />
          </v-col>
        </v-row>

        <PaginationFooter
          v-if="!suggestionsError && !suggestionsOutOfRange && suggestionsTotal > 0"
          :page="suggestionsPage"
          :total-pages="suggestionsTotalPages"
          :total-elements="suggestionsTotal"
          :limit="suggestionsPerPage"
          @update:page="changeSuggestionsPage"
          @update:limit="changeSuggestionsPerPage"
        />
      </section>
    </LoadingOverlay>
  </div>
</template>

<style scoped>
.detail-description {
  white-space: pre-line;
  word-break: break-word;
}
</style>
