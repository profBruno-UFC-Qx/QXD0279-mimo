import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LostReport } from '@/types'
import { lostReportService } from '@/services/lostReport.service'
import { useAuthStore } from '@/stores/authStore'
import { extractLostReportErrorMessage, isValidLostReportList } from '@/utils/lostReport'

export type UserLostReportStatusFilter = 'ALL' | 'OPEN' | 'RESOLVED' | 'CANCELLED'

interface SessionSnapshot {
  requestId: number
  token: string | null
  userId: number | null
  generation: number
}

const GENERIC_LOAD_ERROR = 'Não foi possível carregar suas perdas. Tente novamente.'

export function useMyLostReports() {
  const auth = useAuthStore()

  const reports = ref<LostReport[]>([])
  const selectedStatus = ref<UserLostReportStatusFilter>('ALL')
  const loading = ref(false)
  const error = ref<string | null>(null)

  const filteredReports = computed(() =>
    selectedStatus.value === 'ALL'
      ? reports.value
      : reports.value.filter((report) => report.status === selectedStatus.value),
  )

  let latestRequestId = 0
  let unmounted = false

  function captureSession(): SessionSnapshot {
    return {
      requestId: ++latestRequestId,
      token: auth.token,
      userId: auth.user?.id ?? null,
      generation: auth.sessionGeneration,
    }
  }

  function isCurrentRequest(snapshot: SessionSnapshot): boolean {
    if (unmounted || snapshot.requestId !== latestRequestId) return false
    if (auth.sessionGeneration !== snapshot.generation) return false
    if (!auth.token || auth.token !== snapshot.token) return false
    if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
    return true
  }

  function resetListingState() {
    reports.value = []
    selectedStatus.value = 'ALL'
    error.value = null
    loading.value = false
  }

  async function loadReports() {
    if (unmounted || !auth.token) {
      resetListingState()
      return
    }

    const snapshot = captureSession()
    loading.value = true
    error.value = null

    try {
      const data = await lostReportService.mine()
      if (!isCurrentRequest(snapshot)) return
      if (!isValidLostReportList(data)) {
        reports.value = []
        error.value = GENERIC_LOAD_ERROR
        return
      }
      reports.value = data
    } catch (err: unknown) {
      if (!isCurrentRequest(snapshot)) return
      reports.value = []
      error.value = extractLostReportErrorMessage(err, GENERIC_LOAD_ERROR)
    } finally {
      if (!unmounted && snapshot.requestId === latestRequestId) {
        loading.value = false
      }
    }
  }

  watch(
    () => auth.sessionGeneration,
    async (targetGeneration) => {
      ++latestRequestId
      resetListingState()

      await nextTick()
      if (unmounted || auth.sessionGeneration !== targetGeneration) return
      if (!auth.token) return

      void loadReports()
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    if (!auth.token) return
    void loadReports()
  })

  onBeforeUnmount(() => {
    unmounted = true
    ++latestRequestId
  })

  return {
    auth,
    reports,
    selectedStatus,
    filteredReports,
    loading,
    error,
    loadReports,
  }
}
