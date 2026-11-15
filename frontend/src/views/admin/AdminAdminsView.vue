<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { adminService } from '@/services/admin.service'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { formatDate, formatDateTime } from '@/utils/format'
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

interface SessionSnapshot {
  token: string | null
  userId: number | null
  role: string | null
  generation: number
}

interface RequestSnapshot extends SessionSnapshot {
  requestId: number
  mutationEpoch?: number
}

const auth = useAuthStore()
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

const hasSuperAdminAccess = computed(() => auth.isAuthenticated && auth.isSuperAdmin)
const filteredAdmins = computed(() => filterAdminAccounts(admins.value, searchQuery.value))

function captureSession(): SessionSnapshot {
  return {
    token: auth.token,
    userId: auth.user?.id ?? null,
    role: auth.user?.role ?? null,
    generation: auth.sessionGeneration,
  }
}

function isSameSuperAdminSession(snapshot: SessionSnapshot): boolean {
  return (
    !unmounted &&
    hasSuperAdminAccess.value &&
    auth.token === snapshot.token &&
    (auth.user?.id ?? null) === snapshot.userId &&
    (auth.user?.role ?? null) === snapshot.role &&
    auth.sessionGeneration === snapshot.generation
  )
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
    ui.confirmDialog.show = false
    ui.confirmDialog.open = false
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
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Administradores"
      subtitle="Consulte, cadastre e remova contas administrativas comuns (ADMIN) do AchaDex."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-refresh"
            :disabled="!hasSuperAdminAccess"
            :loading="loadingList"
            @click="loadAdmins()"
          >
            Atualizar
          </v-btn>
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-account-plus-outline"
            :disabled="!hasSuperAdminAccess || confirmingDelete || deletingAdminId !== null"
            @click="openCreate"
          >
            Novo administrador
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <v-alert
      v-if="!hasSuperAdminAccess"
      data-test="admin-restricted-alert"
      type="warning"
      variant="tonal"
      class="my-4 rounded-lg"
      title="Acesso restrito"
    >
      Esta área é exclusiva para contas com perfil SUPERADMIN.
    </v-alert>

    <template v-else>
      <v-text-field
        v-if="admins.length > 0"
        v-model="searchQuery"
        data-test="admin-search"
        label="Buscar administrador por nome ou e-mail..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        clearable
        hide-details
        class="mb-4"
      />

      <v-alert
        v-if="deleteError"
        data-test="admin-delete-alert"
        type="warning"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>{{ deleteError }}</span>
          <v-btn
            v-if="showVerifyDeleteError"
            size="small"
            variant="outlined"
            color="warning"
            class="text-none"
            :disabled="!hasSuperAdminAccess || loadingList"
            @click="loadAdmins()"
          >
            Verificar estado atual
          </v-btn>
        </div>
      </v-alert>

      <ErrorAlert
        v-if="listError"
        :error="listError"
        @retry="loadAdmins()"
      />

      <LoadingOverlay :loading="loadingList" text="Carregando administradores...">
        <template v-if="!listError">
          <v-card v-if="filteredAdmins.length > 0" variant="flat" class="rounded-lg border">
            <div class="d-flex align-center justify-space-between px-4 py-3 bg-surface-variant-light border-b">
              <span class="text-subtitle-2 font-weight-bold text-primary">
                Administradores cadastrados
              </span>
              <v-chip size="small" variant="tonal" color="primary">
                {{ filteredAdmins.length }}
              </v-chip>
            </div>

            <template v-for="(admin, index) in filteredAdmins" :key="admin.id">
              <div
                data-test="admin-row"
                class="d-flex align-center justify-space-between flex-wrap ga-3 px-4 py-3"
              >
                <div class="d-flex flex-column ga-1">
                  <div class="d-flex align-center flex-wrap ga-2">
                    <v-icon icon="mdi-shield-account-outline" size="20" color="primary" />
                    <span class="text-body-1 font-weight-medium">{{ admin.name }}</span>
                    <v-chip size="x-small" variant="tonal" color="primary">
                      {{ admin.role }}
                    </v-chip>
                  </div>
                  <div class="d-flex align-center flex-wrap ga-3 text-body-2 text-medium-emphasis">
                    <span>{{ admin.email }}</span>
                    <span>Telefone: {{ admin.phone || 'Não informado' }}</span>
                    <span>Cadastro: {{ formatDate(admin.createdAt) }}</span>
                  </div>
                </div>

                <div class="d-flex align-center flex-wrap ga-2">
                  <v-btn
                    data-test="admin-detail-btn"
                    size="small"
                    variant="text"
                    color="primary"
                    class="text-none"
                    prepend-icon="mdi-eye-outline"
                    :disabled="!hasSuperAdminAccess || deletingAdminId === admin.id"
                    @click="openDetail(admin)"
                  >
                    Detalhes
                  </v-btn>
                  <v-btn
                    data-test="admin-delete-btn"
                    size="small"
                    variant="tonal"
                    color="error"
                    class="text-none"
                    prepend-icon="mdi-delete-outline"
                    :disabled="
                      !hasSuperAdminAccess ||
                      submittingCreate ||
                      confirmingDelete ||
                      deletingAdminId !== null
                    "
                    :loading="deletingAdminId === admin.id"
                    @click="requestDeleteAdmin(admin)"
                  >
                    Excluir
                  </v-btn>
                </div>
              </div>
              <v-divider v-if="index < filteredAdmins.length - 1" />
            </template>
          </v-card>

          <EmptyState
            v-else-if="!loadingList"
            icon="mdi-shield-account-outline"
            :title="
              admins.length === 0
                ? 'Nenhum administrador cadastrado'
                : 'Nenhum administrador encontrado'
            "
            :description="
              admins.length === 0
                ? 'Cadastre a primeira conta administrativa comum para gerenciar o sistema.'
                : 'Nenhum administrador corresponde à busca informada.'
            "
          />
        </template>
      </LoadingOverlay>
    </template>

    <v-dialog v-model="detailOpen" max-width="520">
      <v-card v-if="detailOpen" data-test="admin-detail-dialog" class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          Detalhes do administrador
        </v-card-title>

        <v-card-text class="px-4 py-3">
          <div v-if="loadingDetail" class="d-flex align-center ga-3 py-4">
            <v-progress-circular indeterminate color="primary" size="24" />
            <span class="text-body-2 text-medium-emphasis">
              Carregando detalhes do administrador...
            </span>
          </div>

          <v-alert
            v-else-if="detailError"
            type="error"
            variant="tonal"
            class="rounded-lg"
          >
            <div class="d-flex flex-column ga-2">
              <span>{{ detailError }}</span>
              <div class="d-flex flex-wrap ga-2">
                <v-btn
                  v-if="showReloadOnDetailError"
                  size="small"
                  variant="outlined"
                  color="error"
                  class="text-none"
                  @click="reloadListFromDetailError"
                >
                  Atualizar listagem
                </v-btn>
                <v-btn
                  v-else
                  size="small"
                  variant="text"
                  color="error"
                  class="text-none"
                  @click="retryDetail"
                >
                  Tentar novamente
                </v-btn>
              </div>
            </div>
          </v-alert>

          <div v-else-if="detailAdmin" class="d-flex flex-column ga-2 text-body-2">
            <div>
              <span class="font-weight-bold">ID:</span> #{{ detailAdmin.id }}
            </div>
            <div>
              <span class="font-weight-bold">Nome:</span> {{ detailAdmin.name }}
            </div>
            <div>
              <span class="font-weight-bold">E-mail:</span> {{ detailAdmin.email }}
            </div>
            <div>
              <span class="font-weight-bold">Telefone:</span>
              {{ detailAdmin.phone || 'Não informado' }}
            </div>
            <div>
              <span class="font-weight-bold">Papel:</span> {{ detailAdmin.role }}
            </div>
            <div>
              <span class="font-weight-bold">Criado em:</span>
              {{ formatDateTime(detailAdmin.createdAt) }}
            </div>
            <div>
              <span class="font-weight-bold">Atualizado em:</span>
              {{ formatDateTime(detailAdmin.updatedAt) }}
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2">
          <v-spacer />
          <v-btn
            variant="text"
            class="text-none"
            @click="closeDetail"
          >
            Fechar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="createOpen" max-width="480" persistent>
      <v-card v-if="createOpen" data-test="admin-create-dialog" class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          Novo administrador
        </v-card-title>

        <v-card-text class="px-4 py-3">
          <v-form @submit.prevent="submitCreate">
            <v-alert
              v-if="createError"
              type="error"
              variant="tonal"
              class="mb-4 rounded-lg"
            >
              <div class="d-flex align-center justify-space-between flex-wrap ga-2">
                <span>{{ createError }}</span>
                <v-btn
                  v-if="showReloadActionOnCreateError"
                  size="small"
                  variant="outlined"
                  color="error"
                  class="text-none"
                  @click="reloadFromCreateError"
                >
                  Recarregar listagem
                </v-btn>
              </div>
            </v-alert>

            <v-text-field
              v-model="createName"
              data-test="admin-create-name"
              label="Nome *"
              variant="outlined"
              density="comfortable"
              autocomplete="off"
              class="mb-3"
              :error-messages="nameError"
              :disabled="submittingCreate || !hasSuperAdminAccess"
            />

            <v-text-field
              v-model="createEmail"
              data-test="admin-create-email"
              label="E-mail *"
              type="email"
              variant="outlined"
              density="comfortable"
              autocomplete="off"
              class="mb-3"
              :error-messages="emailError"
              :disabled="submittingCreate || !hasSuperAdminAccess"
            />

            <v-text-field
              v-model="createInitialPassword"
              data-test="admin-create-password"
              label="Senha inicial *"
              :type="showInitialPassword ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              :error-messages="passwordError"
              :disabled="submittingCreate || !hasSuperAdminAccess"
            >
              <template #append-inner>
                <v-btn
                  data-test="toggle-initial-password"
                  icon
                  variant="text"
                  size="small"
                  tabindex="-1"
                  :aria-label="showInitialPassword ? 'Ocultar senha inicial' : 'Mostrar senha inicial'"
                  @click="showInitialPassword = !showInitialPassword"
                >
                  <v-icon :icon="showInitialPassword ? 'mdi-eye-off' : 'mdi-eye'" />
                </v-btn>
              </template>
            </v-text-field>
          </v-form>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2">
          <v-spacer />
          <v-btn
            data-test="admin-create-cancel"
            variant="text"
            class="text-none"
            :disabled="submittingCreate"
            @click="closeCreate"
          >
            Cancelar
          </v-btn>
          <v-btn
            data-test="admin-create-submit"
            color="primary"
            class="text-none"
            :disabled="!hasSuperAdminAccess || submittingCreate"
            :loading="submittingCreate"
            @click="submitCreate"
          >
            Cadastrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
