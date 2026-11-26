import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdminSession, type AdminSessionSnapshot } from './useAdminSession'
import { useUiStore } from '@/stores/uiStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { buildingService } from '@/services/building.service'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import {
  buildBuildingCreatePayload,
  buildBuildingPatchPayload,
  isValidBuilding,
  isValidBuildingList,
  sortBuildingsByName,
  validateBuildingForm,
  type BuildingFormDraft,
  type BuildingValidationErrors,
} from '@/utils/adminBuildings'
import type { Building } from '@/types'

export function useAdminBuildings() {
  interface RequestSnapshot extends AdminSessionSnapshot {
    requestId: number
    mutationEpoch?: number
  }

  const emptyDraft = (): BuildingFormDraft => ({
    name: '',
    address: '',
    pickupPoint: '',
    serviceHours: '',
  })

  const { auth, hasAccess: hasAdminAccess, captureSession, isSameSession } = useAdminSession()
  const ui = useUiStore()
  const buildingsStore = useBuildingsStore()

  const buildings = ref<Building[]>([])
  const loadingList = ref(false)
  const listError = ref<string | null>(null)
  const searchQuery = ref('')

  const editorOpen = ref(false)
  const editorMode = ref<'create' | 'edit'>('create')
  const editingBuildingId = ref<number | null>(null)
  const editingOriginal = ref<Building | null>(null)
  const loadingDetail = ref(false)
  const detailError = ref<string | null>(null)
  const formDraft = ref<BuildingFormDraft>(emptyDraft())
  const formErrors = ref<BuildingValidationErrors>({})

  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  const showReloadActionOnSubmitError = ref(false)

  const deletingBuildingId = ref<number | null>(null)
  const confirmingDelete = ref(false)
  const deleteError = ref<string | null>(null)
  const showVerifyDeleteError = ref(false)

  let latestListReqId = 0
  let listMutationEpoch = 0
  let latestDetailReqId = 0
  let latestSubmitReqId = 0
  let activeSubmitOwnerId: number | null = null
  let latestDeleteReqId = 0
  let activeDeleteOwnerId: number | null = null
  let latestConfirmId = 0
  let activeDeleteConfirmationId: number | null = null
  let latestSessionWatchId = 0
  let activeConfirmResolver: ((value: boolean) => void) | null = null
  let unmounted = false


  const filteredBuildings = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return buildings.value
    return buildings.value.filter(
      (b) => b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q),
    )
  })

  function isSameAdminSession(snapshot: AdminSessionSnapshot): boolean {
    return !unmounted && isSameSession(snapshot)
  }

  function isCurrentListRequest(snapshot: RequestSnapshot): boolean {
    return (
      snapshot.requestId === latestListReqId &&
      snapshot.mutationEpoch === listMutationEpoch &&
      isSameAdminSession(snapshot)
    )
  }

  function ownsListRequest(snapshot: RequestSnapshot): boolean {
    return !unmounted && snapshot.requestId === latestListReqId && isSameAdminSession(snapshot)
  }

  function isCurrentDetailRequest(snapshot: RequestSnapshot, buildingId: number): boolean {
    return (
      snapshot.requestId === latestDetailReqId &&
      editorOpen.value &&
      editorMode.value === 'edit' &&
      editingBuildingId.value === buildingId &&
      isSameAdminSession(snapshot)
    )
  }

  function releaseSubmitOwnership(snapshot: RequestSnapshot) {
    if (!unmounted && isSameAdminSession(snapshot) && activeSubmitOwnerId === snapshot.requestId) {
      submitting.value = false
      activeSubmitOwnerId = null
    }
  }

  function releaseDeleteOwnership(snapshot: RequestSnapshot) {
    if (!unmounted && isSameAdminSession(snapshot) && activeDeleteOwnerId === snapshot.requestId) {
      deletingBuildingId.value = null
      activeDeleteOwnerId = null
    }
  }

  function dismissOwnedConfirmDialog() {
    const resolver = activeConfirmResolver
    activeConfirmResolver = null
    activeDeleteConfirmationId = null
    confirmingDelete.value = false
    if (resolver === null) return

    ui.closeConfirmation(resolver)
    resolver(false)
  }

  function resetEditorState() {
    ++latestDetailReqId
    editorOpen.value = false
    editorMode.value = 'create'
    editingBuildingId.value = null
    editingOriginal.value = null
    loadingDetail.value = false
    detailError.value = null
    formDraft.value = emptyDraft()
    formErrors.value = {}
    submitError.value = null
    showReloadActionOnSubmitError.value = false
  }

  function resetAllAdminState() {
    dismissOwnedConfirmDialog()
    ++latestListReqId
    ++listMutationEpoch
    ++latestSubmitReqId
    ++latestDeleteReqId
    ++latestConfirmId
    activeSubmitOwnerId = null
    activeDeleteOwnerId = null

    buildings.value = []
    loadingList.value = false
    listError.value = null
    searchQuery.value = ''

    submitting.value = false
    deletingBuildingId.value = null
    deleteError.value = null
    showVerifyDeleteError.value = false

    resetEditorState()
  }

  async function loadBuildings() {
    if (unmounted || !hasAdminAccess.value) {
      resetAllAdminState()
      return
    }

    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestListReqId,
      mutationEpoch: listMutationEpoch,
    }

    loadingList.value = true
    listError.value = null

    try {
      const res = await buildingService.list()
      if (!isCurrentListRequest(snapshot)) return

      if (!isValidBuildingList(res)) {
        buildings.value = []
        listError.value = 'Não foi possível validar os prédios recebidos do servidor.'
        return
      }

      buildings.value = res
      buildingsStore.syncCatalog(res)
    } catch (err: unknown) {
      if (!isCurrentListRequest(snapshot)) return
      const status = getErrorStatus(err)
      buildings.value = []
      if (status === 403) {
        listError.value = 'Sua sessão não possui permissão administrativa para gerenciar prédios.'
        return
      }
      listError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os prédios cadastrados. Tente novamente.',
      )
    } finally {
      if (ownsListRequest(snapshot)) {
        loadingList.value = false
      }
    }
  }

  function applyConfirmedBuildingMutation(nextList: Building[]) {
    ++latestListReqId
    ++listMutationEpoch
    loadingList.value = false
    buildings.value = nextList
    buildingsStore.syncCatalog(nextList)
  }

  function openCreate() {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      submitting.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null
    ) {
      return
    }
    resetEditorState()
    editorMode.value = 'create'
    editorOpen.value = true
  }

  async function loadBuildingForEdit(buildingId: number) {
    if (unmounted || !hasAdminAccess.value || !isPositiveSafeId(buildingId)) return

    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestDetailReqId,
    }

    loadingDetail.value = true
    detailError.value = null

    try {
      const fresh = await buildingService.getById(buildingId)
      if (!isCurrentDetailRequest(snapshot, buildingId)) return

      if (!isValidBuilding(fresh, buildingId)) {
        detailError.value = 'Não foi possível validar os dados atuais deste prédio.'
        return
      }

      editingOriginal.value = fresh
      formDraft.value = {
        name: fresh.name,
        address: fresh.address,
        pickupPoint: fresh.pickupPoint,
        serviceHours: fresh.serviceHours,
      }
      formErrors.value = {}
    } catch (err: unknown) {
      if (!isCurrentDetailRequest(snapshot, buildingId)) return
      const status = getErrorStatus(err)
      if (status === 404) {
        detailError.value = 'Este prédio não existe mais no servidor.'
        return
      }
      detailError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os dados atuais do prédio.',
      )
    } finally {
      if (!unmounted && snapshot.requestId === latestDetailReqId && isSameAdminSession(snapshot)) {
        loadingDetail.value = false
      }
    }
  }

  function openEdit(building: Building) {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      submitting.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null ||
      deletingBuildingId.value !== null ||
      !isPositiveSafeId(building.id)
    ) {
      return
    }

    resetEditorState()
    editorMode.value = 'edit'
    editingBuildingId.value = building.id
    editorOpen.value = true
    void loadBuildingForEdit(building.id)
  }

  function closeEditor() {
    if (submitting.value) return
    resetEditorState()
  }

  async function reloadFromModalError() {
    if (unmounted || !hasAdminAccess.value) return
    resetEditorState()
    await loadBuildings()
  }

  async function submitBuilding() {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      submitting.value ||
      loadingDetail.value ||
      !editorOpen.value
    ) {
      return
    }

    const validation = validateBuildingForm(formDraft.value)
    formErrors.value = validation.errors
    if (!validation.valid || !validation.payload) {
      return
    }

    if (editorMode.value === 'create') {
      const payload = buildBuildingCreatePayload(formDraft.value)
      if (!payload) return
      await executeCreateBuilding(payload)
      return
    }

    const targetId = editingBuildingId.value
    const original = editingOriginal.value
    if (!isPositiveSafeId(targetId) || !original) return

    const patch = buildBuildingPatchPayload(original, formDraft.value)
    if (!patch) return

    // PATCH vazio é rejeitado pelo backend (400); fechar sem enviar requisição nem sucesso fictício.
    if (Object.keys(patch).length === 0) {
      closeEditor()
      return
    }

    await executeUpdateBuilding(targetId, patch)
  }

  function isDefinitiveClientRejection(status: number | null | undefined): boolean {
    return status === 400 || status === 401 || status === 403 || status === 409
  }

  function invalidateCatalogIfUncertain(status: number | null | undefined, revalidateIfObserved = true) {
    if (!isDefinitiveClientRejection(status)) {
      buildingsStore.invalidateCatalog({ revalidateIfObserved })
    }
  }

  async function executeCreateBuilding(payload: NonNullable<ReturnType<typeof buildBuildingCreatePayload>>) {
    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestSubmitReqId,
    }

    activeSubmitOwnerId = snapshot.requestId
    submitting.value = true
    submitError.value = null
    showReloadActionOnSubmitError.value = false
    buildingsStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      buildingsStore.endWrite()
    }

    try {
      const created = await buildingService.create(payload)
      closeWrite()
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        buildingsStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      if (!isValidBuilding(created)) {
        buildingsStore.invalidateCatalog({ revalidateIfObserved: true })
        submitError.value = 'Resposta inválida ao cadastrar o prédio. Atualize a listagem antes de tentar novamente.'
        showReloadActionOnSubmitError.value = true
        return
      }

      const merged = sortBuildingsByName([
        ...buildings.value.filter((item) => item.id !== created.id),
        created,
      ])
      applyConfirmedBuildingMutation(merged)

      releaseSubmitOwnership(snapshot)
      resetEditorState()
      ui.notifySuccess('Prédio cadastrado com sucesso.')
      await loadBuildings()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      invalidateCatalogIfUncertain(status)
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        submitError.value = 'Sua sessão não possui permissão administrativa para cadastrar prédios.'
        return
      }
      if (status === 409) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Já existe um prédio cadastrado com esse nome.',
        )
        return
      }
      if (status === 400) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Dados inválidos para o cadastro do prédio.',
        )
        return
      }

      submitError.value =
        'Não foi possível confirmar o cadastro do prédio. Atualize a listagem para verificar o estado atual.'
      showReloadActionOnSubmitError.value = true
    } finally {
      closeWrite()
      releaseSubmitOwnership(snapshot)
    }
  }

  async function executeUpdateBuilding(
    buildingId: number,
    patch: NonNullable<ReturnType<typeof buildBuildingPatchPayload>>,
  ) {
    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestSubmitReqId,
    }

    activeSubmitOwnerId = snapshot.requestId
    submitting.value = true
    submitError.value = null
    showReloadActionOnSubmitError.value = false
    buildingsStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      buildingsStore.endWrite()
    }

    try {
      const updated = await buildingService.update(buildingId, patch)
      closeWrite()
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        buildingsStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      if (!isValidBuilding(updated, buildingId)) {
        buildingsStore.invalidateCatalog({ revalidateIfObserved: true })
        submitError.value =
          'Resposta inválida ao atualizar o prédio. Atualize a listagem antes de tentar novamente.'
        showReloadActionOnSubmitError.value = true
        return
      }

      const replaced = sortBuildingsByName(
        buildings.value.map((item) => (item.id === updated.id ? updated : item)),
      )
      applyConfirmedBuildingMutation(replaced)

      releaseSubmitOwnership(snapshot)
      resetEditorState()
      ui.notifySuccess('Prédio atualizado com sucesso.')
      await loadBuildings()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      invalidateCatalogIfUncertain(status)
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        submitError.value = 'Sua sessão não possui permissão administrativa para editar prédios.'
        return
      }
      if (status === 404) {
        submitError.value = 'Este prédio não existe mais no servidor. Recarregue a listagem.'
        showReloadActionOnSubmitError.value = true
        return
      }
      if (status === 409) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Já existe um prédio cadastrado com esse nome.',
        )
        return
      }
      if (status === 400) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Dados inválidos para atualização do prédio.',
        )
        return
      }

      submitError.value =
        'Não foi possível confirmar a atualização do prédio. Atualize a listagem para verificar o estado atual.'
      showReloadActionOnSubmitError.value = true
    } finally {
      closeWrite()
      releaseSubmitOwnership(snapshot)
    }
  }

  async function requestDeleteBuilding(building: Building) {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null ||
      deletingBuildingId.value !== null ||
      submitting.value ||
      ui.confirmDialog.show ||
      ui.confirmDialog.open ||
      !isPositiveSafeId(building.id)
    ) {
      return
    }

    deleteError.value = null
    showVerifyDeleteError.value = false

    const sessionAtPrompt = captureSession()
    const confirmId = ++latestConfirmId
    activeDeleteConfirmationId = confirmId
    confirmingDelete.value = true

    let confirmed = false
    let ownResolver: ((confirmed: boolean) => void) | null = null
    try {
      const promptPromise = ui.confirm({
        title: 'Excluir prédio?',
        message: `Deseja realmente excluir "${building.name}"? A exclusão não será permitida caso existam itens encontrados ou relatos de perdas vinculados.`,
        danger: true,
        confirmText: 'Excluir prédio',
        cancelText: 'Cancelar',
      })
      ownResolver = ui.confirmDialog.resolve
      if (activeDeleteConfirmationId === confirmId) {
        activeConfirmResolver = ownResolver
      }
      confirmed = await promptPromise
    } finally {
      ui.closeConfirmation(ownResolver)
      if (activeDeleteConfirmationId === confirmId) {
        activeDeleteConfirmationId = null
        confirmingDelete.value = false
        activeConfirmResolver = null
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

    const snapshot: RequestSnapshot = {
      ...sessionAtPrompt,
      requestId: ++latestDeleteReqId,
    }

    activeDeleteOwnerId = snapshot.requestId
    deletingBuildingId.value = building.id
    buildingsStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      buildingsStore.endWrite()
    }

    try {
      await buildingService.remove(building.id)
      closeWrite()
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestDeleteReqId) {
        buildingsStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      const nextList = buildings.value.filter((item) => item.id !== building.id)
      applyConfirmedBuildingMutation(nextList)
      ui.notifySuccess('Prédio excluído com sucesso.')
      await loadBuildings()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      const ownsDeleteCatch = !unmounted && isSameAdminSession(snapshot) && snapshot.requestId === latestDeleteReqId
      invalidateCatalogIfUncertain(status, !(status === 404 && ownsDeleteCatch))
      if (!ownsDeleteCatch) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        deleteError.value = 'Sua sessão não possui permissão administrativa para excluir prédios.'
        return
      }
      if (status === 409) {
        deleteError.value =
          'Não é possível excluir este prédio porque ele possui itens ou relatos de perdas vinculados.'
        return
      }
      if (status === 404) {
        deleteError.value = 'Este prédio já foi removido anteriormente.'
        await loadBuildings()
        return
      }

      deleteError.value =
        'Não foi possível confirmar a exclusão do prédio. Verifique o estado atual antes de tentar novamente.'
      showVerifyDeleteError.value = true
    } finally {
      closeWrite()
      releaseDeleteOwnership(snapshot)
    }
  }

  watch(
    () => [auth.sessionGeneration, auth.token, auth.user?.id, auth.user?.role],
    async () => {
      const watchId = ++latestSessionWatchId
      const generationAtChange = auth.sessionGeneration
      const tokenAtChange = auth.token
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

      void loadBuildings()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void loadBuildings()
  })

  onBeforeUnmount(() => {
    unmounted = true
    ++latestListReqId
    ++listMutationEpoch
    ++latestDetailReqId
    ++latestSubmitReqId
    ++latestDeleteReqId
    ++latestConfirmId
    activeSubmitOwnerId = null
    activeDeleteOwnerId = null
    dismissOwnedConfirmDialog()
  })

  return {
    hasAdminAccess,
    loadingList,
    loadBuildings,
    confirmingDelete,
    openCreate,
    buildings,
    searchQuery,
    deleteError,
    showVerifyDeleteError,
    listError,
    filteredBuildings,
    submitting,
    deletingBuildingId,
    openEdit,
    requestDeleteBuilding,
    editorOpen,
    formDraft,
    editorMode,
    loadingDetail,
    detailError,
    editingBuildingId,
    submitError,
    showReloadActionOnSubmitError,
    formErrors,
    closeEditor,
    loadBuildingForEdit,
    reloadFromModalError,
    submitBuilding,
  }
}
