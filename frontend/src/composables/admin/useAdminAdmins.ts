import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdminSession, type AdminSessionSnapshot } from './useAdminSession'
import { useUiStore } from '@/stores/uiStore'
import { adminService } from '@/services/admin.service'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import {
  buildCreateAdminPayload,
  filterAdminAccounts,
  isValidAdminAccount,
  isValidAdminAccountList,
  sortAdminAccounts,
  validateAdminEmail,
  validateAdminInitialPassword,
  validateAdminName,
} from '@/utils/adminAccounts'
import type { User } from '@/types'

export function useAdminAdmins() {
  interface RequestSnapshot extends AdminSessionSnapshot {
    requestId: number
    mutationEpoch?: number
  }

  const { auth, hasAccess: hasSuperAdminAccess, captureSession, isSameSession } = useAdminSession(true)
  const ui = useUiStore()

  const admins = ref<User[]>([])
  const loadingList = ref(false)
  const listError = ref<string | null>(null)
  const searchQuery = ref('')

  const detailOpen = ref(false)
  const detailAdminId = ref<number | null>(null)
  const detailAdmin = ref<User | null>(null)
  const loadingDetail = ref(false)
  const detailError = ref<string | null>(null)
  const showReloadOnDetailError = ref(false)

  const createOpen = ref(false)
  const createName = ref('')
  const createEmail = ref('')
  const createInitialPassword = ref('')
  const showInitialPassword = ref(false)
  const nameError = ref<string | undefined>(undefined)
  const emailError = ref<string | undefined>(undefined)
  const passwordError = ref<string | undefined>(undefined)

  const submittingCreate = ref(false)
  const createError = ref<string | null>(null)
  const showReloadActionOnCreateError = ref(false)

  const deletingAdminId = ref<number | null>(null)
  const confirmingDelete = ref(false)
  const deleteError = ref<string | null>(null)
  const showVerifyDeleteError = ref(false)

  let latestListReqId = 0
  let listMutationEpoch = 0
  let latestDetailReqId = 0
  let latestCreateReqId = 0
  let activeCreateOwnerId: number | null = null
  let latestDeleteReqId = 0
  let activeDeleteOwnerId: number | null = null
  let latestConfirmId = 0
  let activeDeleteConfirmationId: number | null = null
  let latestSessionWatchId = 0
  let activeConfirmResolver: ((value: boolean) => void) | null = null
  let unmounted = false

  const filteredAdmins = computed(() => filterAdminAccounts(admins.value, searchQuery.value))

  function isSameSuperAdminSession(snapshot: AdminSessionSnapshot): boolean {
    return !unmounted && isSameSession(snapshot)
  }

  function isCurrentListRequest(snapshot: RequestSnapshot): boolean {
    return (
      isSameSuperAdminSession(snapshot) &&
      snapshot.requestId === latestListReqId &&
      snapshot.mutationEpoch === listMutationEpoch
    )
  }

  function isCurrentDetailRequest(snapshot: RequestSnapshot): boolean {
    return isSameSuperAdminSession(snapshot) && snapshot.requestId === latestDetailReqId
  }

  function isCurrentCreateRequest(snapshot: RequestSnapshot): boolean {
    return isSameSuperAdminSession(snapshot) && snapshot.requestId === latestCreateReqId
  }

  function isCurrentDeleteRequest(snapshot: RequestSnapshot): boolean {
    return isSameSuperAdminSession(snapshot) && snapshot.requestId === latestDeleteReqId
  }

  function dismissOwnedConfirmDialog() {
    if (
      activeDeleteConfirmationId !== null &&
      activeConfirmResolver !== null &&
      ui.confirmDialog.resolve === activeConfirmResolver
    ) {
      const resolve = activeConfirmResolver
      activeConfirmResolver = null
      activeDeleteConfirmationId = null
      ui.closeConfirmation(resolve)
      resolve(false)
      return
    }

    activeConfirmResolver = null
    activeDeleteConfirmationId = null
  }

  function forceResetCreateState() {
    createOpen.value = false
    createName.value = ''
    createEmail.value = ''
    createInitialPassword.value = ''
    showInitialPassword.value = false
    nameError.value = undefined
    emailError.value = undefined
    passwordError.value = undefined
    createError.value = null
    showReloadActionOnCreateError.value = false
  }

  function forceResetDetailState() {
    ++latestDetailReqId
    detailOpen.value = false
    detailAdminId.value = null
    detailAdmin.value = null
    loadingDetail.value = false
    detailError.value = null
    showReloadOnDetailError.value = false
  }

  function resetAllAdminState() {
    ++latestListReqId
    ++listMutationEpoch
    ++latestCreateReqId
    ++latestDeleteReqId
    ++latestConfirmId
    activeCreateOwnerId = null
    activeDeleteOwnerId = null
    dismissOwnedConfirmDialog()

    loadingList.value = false
    listError.value = null
    admins.value = []
    searchQuery.value = ''

    forceResetDetailState()

    submittingCreate.value = false
    forceResetCreateState()

    deletingAdminId.value = null
    confirmingDelete.value = false
    deleteError.value = null
    showVerifyDeleteError.value = false
  }

  function confirmWithOwnership(options: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
  }): { confirmId: number; promise: Promise<boolean> } {
    const confirmId = ++latestConfirmId
    activeDeleteConfirmationId = confirmId
    const promise = ui.confirm(options)
    activeConfirmResolver = ui.confirmDialog.resolve
    return { confirmId, promise }
  }

  async function loadAdmins(options: { preserveOtherErrors?: boolean } = {}) {
    if (!hasSuperAdminAccess.value) {
      return
    }

    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestListReqId,
      mutationEpoch: listMutationEpoch,
    }

    loadingList.value = true
    listError.value = null
    if (!options.preserveOtherErrors) {
      deleteError.value = null
      showVerifyDeleteError.value = false
    }

    try {
      const result = await adminService.list()
      if (!isCurrentListRequest(snapshot)) {
        return
      }
      if (!isValidAdminAccountList(result)) {
        admins.value = []
        listError.value = 'Resposta inválida ao carregar administradores.'
        return
      }
      admins.value = sortAdminAccounts(result)
    } catch (err: unknown) {
      if (!isCurrentListRequest(snapshot)) {
        return
      }
      listError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os administradores.',
      )
    } finally {
      if (isSameSuperAdminSession(snapshot) && snapshot.requestId === latestListReqId) {
        loadingList.value = false
      }
    }
  }

  async function openDetail(admin: User) {
    if (!hasSuperAdminAccess.value || !isPositiveSafeId(admin.id)) {
      return
    }

    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestDetailReqId,
    }

    detailAdminId.value = admin.id
    detailAdmin.value = null
    detailError.value = null
    showReloadOnDetailError.value = false
    loadingDetail.value = true
    detailOpen.value = true

    try {
      const result = await adminService.getById(admin.id)
      if (!isCurrentDetailRequest(snapshot) || !detailOpen.value) {
        return
      }
      if (!isValidAdminAccount(result, admin.id)) {
        detailAdmin.value = null
        detailError.value = 'Resposta inválida ao carregar os detalhes do administrador.'
        return
      }
      detailAdmin.value = result
    } catch (err: unknown) {
      if (!isCurrentDetailRequest(snapshot) || !detailOpen.value) {
        return
      }
      const status = getErrorStatus(err)
      detailError.value = extractLostReportErrorMessage(
        err,
        status === 404
          ? 'Administrador não encontrado.'
          : 'Não foi possível carregar os detalhes do administrador.',
      )
      showReloadOnDetailError.value = status === 404
    } finally {
      if (isCurrentDetailRequest(snapshot)) {
        loadingDetail.value = false
      }
    }
  }

  function closeDetail() {
    forceResetDetailState()
  }

  function retryDetail() {
    if (detailAdminId.value === null) return
    const target = admins.value.find((item) => item.id === detailAdminId.value) ?? {
      id: detailAdminId.value,
      name: '',
      email: '',
      phone: null,
      role: 'ADMIN' as const,
      createdAt: '',
      updatedAt: '',
    }
    void openDetail(target)
  }

  async function reloadListFromDetailError() {
    closeDetail()
    await loadAdmins()
  }

  function openCreate() {
    if (
      !hasSuperAdminAccess.value ||
      confirmingDelete.value ||
      deletingAdminId.value !== null
    ) {
      return
    }
    forceResetCreateState()
    createOpen.value = true
  }

  function closeCreate() {
    if (submittingCreate.value) return
    forceResetCreateState()
  }

  async function submitCreate() {
    if (
      !hasSuperAdminAccess.value ||
      submittingCreate.value ||
      confirmingDelete.value ||
      deletingAdminId.value !== null
    ) {
      return
    }

    const nameCheck = validateAdminName(createName.value)
    const emailCheck = validateAdminEmail(createEmail.value)
    const passwordCheck = validateAdminInitialPassword(createInitialPassword.value)

    nameError.value = nameCheck.valid ? undefined : nameCheck.error
    emailError.value = emailCheck.valid ? undefined : emailCheck.error
    passwordError.value = passwordCheck.valid ? undefined : passwordCheck.error

    const payload = buildCreateAdminPayload({
      name: createName.value,
      email: createEmail.value,
      initialPassword: createInitialPassword.value,
    })
    if (!payload) {
      return
    }

    const snapshot: RequestSnapshot = {
      ...captureSession(),
      requestId: ++latestCreateReqId,
    }

    submittingCreate.value = true
    activeCreateOwnerId = snapshot.requestId
    createError.value = null
    showReloadActionOnCreateError.value = false

    try {
      const created = await adminService.create(payload)
      if (!isCurrentCreateRequest(snapshot)) {
        return
      }

      if (!isValidAdminAccount(created)) {
        ++listMutationEpoch
        createError.value =
          'Resposta inválida ao cadastrar administrador. Recarregue a listagem para confirmar o estado atual.'
        showReloadActionOnCreateError.value = true
        void loadAdmins({ preserveOtherErrors: true })
        return
      }

      ++listMutationEpoch
      admins.value = sortAdminAccounts([
        created,
        ...admins.value.filter((item) => item.id !== created.id),
      ])
      forceResetCreateState()
      ui.notifySuccess('Administrador cadastrado com sucesso.')
      await loadAdmins({ preserveOtherErrors: true })
    } catch (err: unknown) {
      if (!isCurrentCreateRequest(snapshot)) {
        return
      }
      const status = getErrorStatus(err)
      const fallback =
        status === 409
          ? 'Já existe uma conta cadastrada com este e-mail.'
          : status === 400
            ? 'Dados inválidos para cadastro de administrador.'
            : status === 401 || status === 403
              ? 'Sessão sem permissão para cadastrar administradores.'
              : 'Não foi possível confirmar o cadastro do administrador.'

      createError.value = extractLostReportErrorMessage(err, fallback)
      showReloadActionOnCreateError.value =
        status === null || status >= 500
    } finally {
      if (activeCreateOwnerId === snapshot.requestId) {
        submittingCreate.value = false
        activeCreateOwnerId = null
      }
    }
  }

  async function reloadFromCreateError() {
    if (!hasSuperAdminAccess.value || submittingCreate.value) return
    forceResetCreateState()
    await loadAdmins()
  }

  async function requestDeleteAdmin(admin: User) {
    if (
      !hasSuperAdminAccess.value ||
      submittingCreate.value ||
      confirmingDelete.value ||
      deletingAdminId.value !== null ||
      ui.confirmDialog.show ||
      ui.confirmDialog.open ||
      !isPositiveSafeId(admin.id)
    ) {
      return
    }

    const sessionAtOpen = captureSession()
    confirmingDelete.value = true
    const { confirmId, promise } = confirmWithOwnership({
      title: 'Excluir administrador',
      message: `Deseja realmente excluir a conta administrativa "${admin.name}" (${admin.email})? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })

    let confirmed = false
    try {
      confirmed = await promise
    } finally {
      if (confirmId === latestConfirmId) {
        confirmingDelete.value = false
        if (activeDeleteConfirmationId === confirmId) {
          activeDeleteConfirmationId = null
          activeConfirmResolver = null
        }
      }
    }

    if (
      !confirmed ||
      !isSameSuperAdminSession(sessionAtOpen) ||
      confirmId !== latestConfirmId ||
      submittingCreate.value ||
      deletingAdminId.value !== null
    ) {
      return
    }

    const snapshot: RequestSnapshot = {
      ...sessionAtOpen,
      requestId: ++latestDeleteReqId,
    }

    deletingAdminId.value = admin.id
    activeDeleteOwnerId = snapshot.requestId
    deleteError.value = null
    showVerifyDeleteError.value = false

    try {
      await adminService.remove(admin.id)
      if (!isCurrentDeleteRequest(snapshot)) {
        return
      }

      ++listMutationEpoch
      if (detailOpen.value && detailAdminId.value === admin.id) {
        closeDetail()
      }
      admins.value = admins.value.filter((item) => item.id !== admin.id)
      ui.notifySuccess('Administrador excluído com sucesso.')
      await loadAdmins({ preserveOtherErrors: true })
    } catch (err: unknown) {
      if (!isCurrentDeleteRequest(snapshot)) {
        return
      }

      const status = getErrorStatus(err)
      if (status === 404) {
        ++listMutationEpoch
        if (detailOpen.value && detailAdminId.value === admin.id) {
          closeDetail()
        }
        admins.value = admins.value.filter((item) => item.id !== admin.id)
        deleteError.value = extractLostReportErrorMessage(
          err,
          'Administrador já não está mais cadastrado. Listagem atualizada.',
        )
        showVerifyDeleteError.value = false
        await loadAdmins({ preserveOtherErrors: true })
        return
      }

      if (status === 409) {
        deleteError.value = extractLostReportErrorMessage(
          err,
          'Este administrador possui registros vinculados e não pode ser excluído.',
        )
        showVerifyDeleteError.value = false
        return
      }

      if (status === 401 || status === 403) {
        deleteError.value = extractLostReportErrorMessage(
          err,
          'Sessão sem permissão para excluir administradores.',
        )
        showVerifyDeleteError.value = false
        return
      }

      deleteError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível confirmar a exclusão do administrador.',
      )
      showVerifyDeleteError.value = true
    } finally {
      if (activeDeleteOwnerId === snapshot.requestId) {
        deletingAdminId.value = null
        activeDeleteOwnerId = null
      }
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
        !hasSuperAdminAccess.value
      ) {
        return
      }

      void loadAdmins()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    if (!hasSuperAdminAccess.value) return
    void loadAdmins()
  })

  onBeforeUnmount(() => {
    unmounted = true
    resetAllAdminState()
  })

  return {
    hasSuperAdminAccess,
    loadingList,
    loadAdmins,
    confirmingDelete,
    deletingAdminId,
    openCreate,
    admins,
    searchQuery,
    deleteError,
    showVerifyDeleteError,
    listError,
    filteredAdmins,
    submittingCreate,
    openDetail,
    requestDeleteAdmin,
    detailOpen,
    loadingDetail,
    detailError,
    showReloadOnDetailError,
    detailAdmin,
    closeDetail,
    retryDetail,
    reloadListFromDetailError,
    createOpen,
    createName,
    createEmail,
    createInitialPassword,
    showInitialPassword,
    createError,
    showReloadActionOnCreateError,
    nameError,
    emailError,
    passwordError,
    closeCreate,
    submitCreate,
    reloadFromCreateError,
  }
}
