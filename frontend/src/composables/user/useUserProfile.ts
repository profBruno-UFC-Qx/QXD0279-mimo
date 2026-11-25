import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { userService, type UpdateProfilePayload } from '@/services/user.service'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import type { User } from '@/types'

const PHONE_REGEX = /^\+?[0-9()\s-]{8,20}$/

let latestSyncId = 0

interface SessionSnapshot {
  requestId: number
  token: string | null
  userId: number | null
  generation: number
}

function validateName(value: string): string | undefined {
  const len = value.trim().length
  if (len < 3 || len > 150) return 'Nome deve possuir entre 3 e 150 caracteres.'
}

function validatePhone(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed !== '' && !PHONE_REGEX.test(trimmed)) return 'Telefone inválido.'
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { status?: unknown; data?: unknown } }).response
    const status = response?.status
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof response?.data === 'object' &&
      response.data !== null &&
      'error' in response.data
    ) {
      const apiError = (response.data as { error?: unknown }).error
      if (typeof apiError === 'object' && apiError !== null && 'details' in apiError) {
        const details = (apiError as { details?: unknown }).details
        if (typeof details === 'string' && details.trim() !== '') {
          return details
        }
      }
    }
  }
  return 'Não foi possível atualizar o perfil. Tente novamente.'
}

export function useUserProfile() {
  const auth = useAuthStore()
  const ui = useUiStore()

  const profile = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const nameInput = ref('')
  const phoneInput = ref('')
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const attemptedSubmit = ref(false)

  let unmounted = false
  let confirmedGeneration: number | null = null

  function captureSession(): SessionSnapshot {
    return {
      requestId: ++latestSyncId,
      token: auth.token,
      userId: auth.user?.id ?? null,
      generation: auth.sessionGeneration,
    }
  }

  function isCurrentRequest(snapshot: SessionSnapshot, responseUser?: User): boolean {
    if (unmounted || snapshot.requestId !== latestSyncId) return false
    if (auth.sessionGeneration !== snapshot.generation) return false
    if (auth.token !== snapshot.token) return false
    if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
    if (responseUser && auth.user !== null && auth.user.id !== responseUser.id) return false
    return true
  }

  function resetProfileState() {
    confirmedGeneration = null
    profile.value = null
    nameInput.value = ''
    phoneInput.value = ''
    error.value = null
    saveError.value = null
    attemptedSubmit.value = false
    loading.value = false
    saving.value = false
  }

  function applyConfirmedProfile(user: User, generation: number) {
    confirmedGeneration = generation
    profile.value = user
    auth.user = user
    nameInput.value = user.name
    phoneInput.value = user.phone ?? ''
    attemptedSubmit.value = false
  }

  const normalizedPhone = computed(() => {
    const trimmed = phoneInput.value.trim()
    return trimmed === '' ? null : trimmed
  })

  const nameDirty = computed(
    () => profile.value !== null && nameInput.value.trim() !== profile.value.name,
  )
  const phoneDirty = computed(
    () => profile.value !== null && normalizedPhone.value !== profile.value.phone,
  )
  const hasChanges = computed(() => nameDirty.value || phoneDirty.value)

  const nameError = computed(() => {
    if (!profile.value) return undefined
    if (!attemptedSubmit.value && nameInput.value === profile.value.name) return undefined
    return validateName(nameInput.value)
  })

  const phoneError = computed(() => {
    if (!profile.value) return undefined
    if (!attemptedSubmit.value && phoneInput.value === (profile.value.phone ?? '')) return undefined
    return validatePhone(phoneInput.value)
  })

  async function loadProfile() {
    const snapshot = captureSession()
    loading.value = true
    error.value = null
    try {
      const data = await userService.me()
      if (!isCurrentRequest(snapshot, data)) return
      applyConfirmedProfile(data, snapshot.generation)
      saveError.value = null
    } catch {
      if (!isCurrentRequest(snapshot)) return
      error.value = 'Não foi possível carregar os dados do perfil.'
    } finally {
      if (
        !unmounted &&
        snapshot.requestId === latestSyncId &&
        auth.sessionGeneration === snapshot.generation
      ) {
        loading.value = false
      }
    }
  }

  async function saveProfile() {
    if (!profile.value || saving.value || confirmedGeneration !== auth.sessionGeneration) return
    attemptedSubmit.value = true
    saveError.value = null

    if (!hasChanges.value || validateName(nameInput.value) || validatePhone(phoneInput.value)) {
      return
    }

    const payload: UpdateProfilePayload = {}
    if (nameDirty.value) payload.name = nameInput.value.trim()
    if (phoneDirty.value) payload.phone = normalizedPhone.value

    const snapshot = captureSession()
    saving.value = true
    try {
      const updated = await userService.updateMe(payload)
      if (!isCurrentRequest(snapshot, updated)) return
      applyConfirmedProfile(updated, snapshot.generation)
      ui.notifySuccess('Perfil atualizado com sucesso.')
    } catch (err: unknown) {
      if (!isCurrentRequest(snapshot)) return
      saveError.value = extractErrorMessage(err)
    } finally {
      if (
        !unmounted &&
        snapshot.requestId === latestSyncId &&
        auth.sessionGeneration === snapshot.generation
      ) {
        saving.value = false
      }
    }
  }

  watch(
    () => auth.sessionGeneration,
    async (targetGeneration) => {
      ++latestSyncId
      resetProfileState()

      await nextTick()
      if (unmounted || auth.sessionGeneration !== targetGeneration) return
      if (!auth.token) return

      void loadProfile()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    void loadProfile()
  })

  onUnmounted(() => {
    unmounted = true
  })

  return {
    profile,
    loading,
    error,
    nameInput,
    phoneInput,
    saving,
    saveError,
    hasChanges,
    nameError,
    phoneError,
    loadProfile,
    saveProfile,
  }
}
