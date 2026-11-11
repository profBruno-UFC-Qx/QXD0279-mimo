import { ref } from 'vue'
import { useUiStore } from '@/stores/uiStore'

// Composable reutilizável para envolver uma operação assíncrona.
// Deve ser chamado na configuração de uma view/componente.
// Os melhores lugares para usar useAsyncAction são ações assíncronas iniciadas pelo usuário.
// Um exemplo é o botão “Marcar todas como lidas” em NotificationMenu.vue. 
// Em vez de manter um try/catch próprio, a ação pode ser envolvida pelo composable:
export function useAsyncAction(
  action: () => Promise<void>,
  successMsg?: string,
  errorMsg = 'Não foi possível concluir a operação.',
) {
  const running = ref(false)

  // Executa a ação recebida, notifica sucesso ou erro e sempre encerra o estado de execução.
  const run = async () => {
    running.value = true
    try {
      await action()
      if (successMsg) useUiStore().notifySuccess(successMsg)
    } catch {
      useUiStore().notifyError(errorMsg)
    } finally {
      running.value = false
    }
  }
  return { running, run }
}
