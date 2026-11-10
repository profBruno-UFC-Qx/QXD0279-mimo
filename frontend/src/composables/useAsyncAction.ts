import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'

export function useAsyncAction(action: () => Promise<void>, successMsg?: string) {
  const running = ref(false)
  const run = async () => {
    running.value = true
    try {
      await action()
      if (successMsg) useUiStore().notifySuccess(successMsg)
    } catch {
      useUiStore().notifyError('Não foi possível concluir a operação.')
    } finally {
      running.value = false
    }
  }
  return { running, run }
}
