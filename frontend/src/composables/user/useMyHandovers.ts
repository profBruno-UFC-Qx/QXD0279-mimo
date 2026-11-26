import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Handover } from '@/types'
import { handoverService } from '@/services/handover.service'
import { useAuthStore } from '@/stores/authStore'
import { extractLostReportErrorMessage } from '@/utils/lostReport'

export function useMyHandovers() {
  const auth = useAuthStore()

  const handovers = ref<Handover[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let latestRequestId = 0

  async function loadHandovers() {
    if (!auth.token) return

    const requestId = ++latestRequestId
    loading.value = true
    error.value = null

    try {
      const res = await handoverService.mine()
      if (requestId !== latestRequestId) return
      handovers.value = res
    } catch (err: unknown) {
      if (requestId !== latestRequestId) return
      handovers.value = []
      error.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar seu histórico de retiradas. Tente novamente.',
      )
    } finally {
      if (requestId === latestRequestId) {
        loading.value = false
      }
    }
  }

  onMounted(() => {
    if (!auth.token) return
    void loadHandovers()
  })

  onBeforeUnmount(() => {
    ++latestRequestId
  })

  return {
    handovers,
    loading,
    error,
    loadHandovers,
  }
}
