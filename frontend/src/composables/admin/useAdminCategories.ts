import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdminSession, type AdminSessionSnapshot } from './useAdminSession'
import { useUiStore } from '@/stores/uiStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { categoryService } from '@/services/category.service'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import {
  buildCategoryPayload,
  hasCategoryNameChanged,
  isValidCategory,
  isValidCategoryList,
  sortCategoriesByName,
  validateCategoryName,
} from '@/utils/adminCategories'
import type { Category, CategoryPayload } from '@/types'

export function useAdminCategories() {
  interface RequestSnapshot extends AdminSessionSnapshot {
    requestId: number
    mutationEpoch?: number
  }

  const { auth, hasAccess: hasAdminAccess, captureSession, isSameSession } = useAdminSession()
  const ui = useUiStore()
  const categoriesStore = useCategoriesStore()

  const categories = ref<Category[]>([])
  const loadingList = ref(false)
  const listError = ref<string | null>(null)
  const searchQuery = ref('')

  const editorOpen = ref(false)
  const editorMode = ref<'create' | 'edit'>('create')
  const editingCategoryId = ref<number | null>(null)
  const editingOriginal = ref<Category | null>(null)
  const formName = ref('')
  const nameError = ref<string | undefined>(undefined)

  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  const showReloadActionOnSubmitError = ref(false)

  const deletingCategoryId = ref<number | null>(null)
  const confirmingDelete = ref(false)
  const deleteError = ref<string | null>(null)
  const showVerifyDeleteError = ref(false)

  let latestListReqId = 0
  let listMutationEpoch = 0
  let latestSubmitReqId = 0
  let activeSubmitOwnerId: number | null = null
  let latestDeleteReqId = 0
  let activeDeleteOwnerId: number | null = null
  let latestConfirmId = 0
  let activeDeleteConfirmationId: number | null = null
  let latestSessionWatchId = 0
  let activeConfirmResolver: ((value: boolean) => void) | null = null
  let unmounted = false


  const filteredCategories = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return categories.value
    return categories.value.filter((category) => category.name.toLowerCase().includes(q))
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

  function releaseSubmitOwnership(snapshot: RequestSnapshot) {
    if (!unmounted && isSameAdminSession(snapshot) && activeSubmitOwnerId === snapshot.requestId) {
      submitting.value = false
      activeSubmitOwnerId = null
    }
  }

  function releaseDeleteOwnership(snapshot: RequestSnapshot) {
    if (!unmounted && isSameAdminSession(snapshot) && activeDeleteOwnerId === snapshot.requestId) {
      deletingCategoryId.value = null
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
    ++latestSubmitReqId
    activeSubmitOwnerId = null
    submitting.value = false
    editorOpen.value = false
    editorMode.value = 'create'
    editingCategoryId.value = null
    editingOriginal.value = null
    formName.value = ''
    nameError.value = undefined
    submitError.value = null
    showReloadActionOnSubmitError.value = false
  }

  function resetAllAdminState() {
    dismissOwnedConfirmDialog()
    ++latestListReqId
    ++listMutationEpoch
    ++latestDeleteReqId
    ++latestConfirmId
    activeDeleteOwnerId = null

    categories.value = []
    loadingList.value = false
    listError.value = null
    searchQuery.value = ''

    deletingCategoryId.value = null
    deleteError.value = null
    showVerifyDeleteError.value = false

    resetEditorState()
  }

  function isDefinitiveClientRejection(status: number | null | undefined): boolean {
    return status === 400 || status === 401 || status === 403 || status === 409
  }

  function invalidateCatalogIfUncertain(status: number | null | undefined, revalidateIfObserved = true) {
    if (!isDefinitiveClientRejection(status)) {
      categoriesStore.invalidateCatalog({ revalidateIfObserved })
    }
  }

  async function loadCategories() {
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
      const res = await categoryService.list()
      if (!isCurrentListRequest(snapshot)) return

      if (!isValidCategoryList(res)) {
        categories.value = []
        listError.value = 'Não foi possível validar as categorias recebidas do servidor.'
        return
      }

      const sorted = sortCategoriesByName(res)
      categories.value = sorted
      categoriesStore.syncCatalog(sorted)
    } catch (err: unknown) {
      if (!isCurrentListRequest(snapshot)) return
      const status = getErrorStatus(err)
      categories.value = []
      if (status === 403) {
        listError.value = 'Sua sessão não possui permissão administrativa para gerenciar categorias.'
        return
      }
      listError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar as categorias cadastradas. Tente novamente.',
      )
    } finally {
      if (ownsListRequest(snapshot)) {
        loadingList.value = false
      }
    }
  }

  function applyConfirmedCategoryMutation(nextList: Category[]) {
    const sorted = sortCategoriesByName(nextList)
    ++latestListReqId
    ++listMutationEpoch
    loadingList.value = false
    categories.value = sorted
    categoriesStore.syncCatalog(sorted)
  }

  function openCreate() {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      submitting.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null ||
      deletingCategoryId.value !== null
    ) {
      return
    }
    resetEditorState()
    editorMode.value = 'create'
    editorOpen.value = true
  }

  function openEdit(category: Category) {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      submitting.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null ||
      deletingCategoryId.value !== null ||
      !isPositiveSafeId(category.id)
    ) {
      return
    }

    resetEditorState()
    editorMode.value = 'edit'
    editingCategoryId.value = category.id
    editingOriginal.value = { ...category }
    formName.value = category.name
    editorOpen.value = true
  }

  function closeEditor() {
    if (submitting.value) return
    resetEditorState()
  }

  async function reloadFromModalError() {
    if (unmounted || !hasAdminAccess.value) return
    resetEditorState()
    await loadCategories()
  }

  async function submitCategory() {
    if (unmounted || !hasAdminAccess.value || submitting.value || !editorOpen.value) {
      return
    }

    const validation = validateCategoryName(formName.value)
    nameError.value = validation.error
    if (!validation.valid) return

    const payload = buildCategoryPayload(formName.value)
    if (!payload) return

    if (editorMode.value === 'create') {
      await executeCreateCategory(payload)
      return
    }

    const targetId = editingCategoryId.value
    const original = editingOriginal.value
    if (!isPositiveSafeId(targetId) || !original || !categories.value.some((c) => c.id === targetId)) {
      submitError.value = 'Esta categoria não pertence mais à listagem atual. Recarregue a listagem.'
      showReloadActionOnSubmitError.value = true
      return
    }

    if (!hasCategoryNameChanged(original, formName.value)) {
      closeEditor()
      return
    }

    await executeUpdateCategory(targetId, payload)
  }

  async function executeCreateCategory(payload: CategoryPayload) {
    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestSubmitReqId,
    }

    activeSubmitOwnerId = snapshot.requestId
    submitting.value = true
    submitError.value = null
    showReloadActionOnSubmitError.value = false
    categoriesStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      categoriesStore.endWrite()
    }

    try {
      const created = await categoryService.create(payload)
      closeWrite()
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        categoriesStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      if (!isValidCategory(created)) {
        categoriesStore.invalidateCatalog({ revalidateIfObserved: true })
        submitError.value =
          'Resposta inválida ao cadastrar a categoria. Atualize a listagem antes de tentar novamente.'
        showReloadActionOnSubmitError.value = true
        return
      }

      const merged = [...categories.value.filter((item) => item.id !== created.id), created]
      applyConfirmedCategoryMutation(merged)

      releaseSubmitOwnership(snapshot)
      resetEditorState()
      ui.notifySuccess('Categoria cadastrada com sucesso.')
      await loadCategories()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      invalidateCatalogIfUncertain(status)
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        submitError.value = 'Sua sessão não possui permissão administrativa para cadastrar categorias.'
        return
      }
      if (status === 409) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Já existe uma categoria com esse nome.',
        )
        return
      }
      if (status === 400) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Dados inválidos para o cadastro da categoria.',
        )
        return
      }

      submitError.value =
        'Não foi possível confirmar o cadastro da categoria. Atualize a listagem para verificar o estado atual.'
      showReloadActionOnSubmitError.value = true
    } finally {
      closeWrite()
      releaseSubmitOwnership(snapshot)
    }
  }

  async function executeUpdateCategory(categoryId: number, payload: CategoryPayload) {
    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestSubmitReqId,
    }

    activeSubmitOwnerId = snapshot.requestId
    submitting.value = true
    submitError.value = null
    showReloadActionOnSubmitError.value = false
    categoriesStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      categoriesStore.endWrite()
    }

    try {
      const updated = await categoryService.update(categoryId, payload)
      closeWrite()
      if (
        unmounted ||
        !isSameAdminSession(snapshot) ||
        snapshot.requestId !== latestSubmitReqId ||
        !editorOpen.value ||
        editorMode.value !== 'edit' ||
        editingCategoryId.value !== categoryId
      ) {
        categoriesStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      if (!isValidCategory(updated, categoryId)) {
        categoriesStore.invalidateCatalog({ revalidateIfObserved: true })
        submitError.value =
          'Resposta inválida ao atualizar a categoria. Atualize a listagem antes de tentar novamente.'
        showReloadActionOnSubmitError.value = true
        return
      }

      const replaced = categories.value.map((item) => (item.id === updated.id ? updated : item))
      applyConfirmedCategoryMutation(replaced)

      releaseSubmitOwnership(snapshot)
      resetEditorState()
      ui.notifySuccess('Categoria atualizada com sucesso.')
      await loadCategories()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      invalidateCatalogIfUncertain(status)
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestSubmitReqId) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        submitError.value = 'Sua sessão não possui permissão administrativa para editar categorias.'
        return
      }
      if (status === 404) {
        submitError.value = 'Esta categoria não existe mais no servidor. Recarregue a listagem.'
        showReloadActionOnSubmitError.value = true
        return
      }
      if (status === 409) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Já existe uma categoria com esse nome.',
        )
        return
      }
      if (status === 400) {
        submitError.value = extractLostReportErrorMessage(
          err,
          'Dados inválidos para atualização da categoria.',
        )
        return
      }

      submitError.value =
        'Não foi possível confirmar a atualização da categoria. Atualize a listagem para verificar o estado atual.'
      showReloadActionOnSubmitError.value = true
    } finally {
      closeWrite()
      releaseSubmitOwnership(snapshot)
    }
  }

  async function requestDeleteCategory(category: Category) {
    if (
      unmounted ||
      !hasAdminAccess.value ||
      confirmingDelete.value ||
      activeDeleteConfirmationId !== null ||
      deletingCategoryId.value !== null ||
      submitting.value ||
      ui.confirmDialog.show ||
      ui.confirmDialog.open ||
      !isPositiveSafeId(category.id)
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
    try {
      const promptPromise = ui.confirm({
        title: 'Excluir categoria?',
        message: `Deseja realmente excluir "${category.name}"? Categorias vinculadas a itens encontrados ou relatos de perdas não podem ser excluídas.`,
        danger: true,
        confirmText: 'Excluir categoria',
        cancelText: 'Cancelar',
      })
      if (activeDeleteConfirmationId === confirmId) {
        activeConfirmResolver = ui.confirmDialog.resolve
      }
      confirmed = await promptPromise
    } finally {
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
    deletingCategoryId.value = category.id
    categoriesStore.beginWrite()
    let writeEnded = false
    const closeWrite = () => {
      if (writeEnded) return
      writeEnded = true
      categoriesStore.endWrite()
    }

    try {
      await categoryService.remove(category.id)
      closeWrite()
      if (unmounted || !isSameAdminSession(snapshot) || snapshot.requestId !== latestDeleteReqId) {
        categoriesStore.invalidateCatalog({ revalidateIfObserved: true })
        return
      }

      const nextList = categories.value.filter((item) => item.id !== category.id)
      applyConfirmedCategoryMutation(nextList)
      ui.notifySuccess('Categoria excluída com sucesso.')
      await loadCategories()
    } catch (err: unknown) {
      closeWrite()
      const status = getErrorStatus(err)
      const ownsDeleteCatch =
        !unmounted && isSameAdminSession(snapshot) && snapshot.requestId === latestDeleteReqId
      invalidateCatalogIfUncertain(status, !(status === 404 && ownsDeleteCatch))
      if (!ownsDeleteCatch) {
        return
      }

      if (status === 401) return
      if (status === 403) {
        deleteError.value = 'Sua sessão não possui permissão administrativa para excluir categorias.'
        return
      }
      if (status === 409) {
        deleteError.value =
          'Não é possível excluir esta categoria porque ela possui itens encontrados ou relatos de perdas vinculados.'
        return
      }
      if (status === 404) {
        deleteError.value = 'Esta categoria já foi removida anteriormente.'
        await loadCategories()
        return
      }

      deleteError.value =
        'Não foi possível confirmar a exclusão da categoria. Verifique o estado atual antes de tentar novamente.'
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

      void loadCategories()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    if (!hasAdminAccess.value) return
    void loadCategories()
  })

  onBeforeUnmount(() => {
    unmounted = true
    ++latestListReqId
    ++listMutationEpoch
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
    loadCategories,
    confirmingDelete,
    deletingCategoryId,
    openCreate,
    categories,
    searchQuery,
    deleteError,
    showVerifyDeleteError,
    listError,
    filteredCategories,
    submitting,
    openEdit,
    requestDeleteCategory,
    editorOpen,
    formName,
    editorMode,
    submitError,
    showReloadActionOnSubmitError,
    nameError,
    closeEditor,
    reloadFromModalError,
    submitCategory,
  }
}
