import { defineStore } from 'pinia'
import { ref } from 'vue'

// Store de estado visual compartilhado: fornece notificações e confirmação modal.
export const useUiStore = defineStore('ui', () => {
  // state: Estado observado pelos componentes globais de snackbar e diálogo de confirmação.
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success',
    timeout: 4000,
  })
  const snackbarQueue = ref<Array<{ message: string; color: string }>>([])

  const confirmDialog = ref({
    show: false,
    open: false,
    title: '',
    text: '',
    message: '',
    danger: false,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    resolve: (val: boolean) => {},
  })

  // actions: Centraliza a configuração do snackbar para que cada notificação reinicie sua duração.
  function showSnackbar(message: string, color = 'success') {
    if (snackbar.value.show) {
      snackbarQueue.value.push({ message, color })
      return
    }
    snackbar.value = {
      show: true,
      message,
      color,
      timeout: 4000,
    }
  }

  function dismissSnackbar() {
    snackbar.value.show = false
    const next = snackbarQueue.value.shift()
    if (next) showSnackbar(next.message, next.color)
  }

  function notifySuccess(message: string) {
    showSnackbar(message, 'success')
  }

  function notifyError(message: string) {
    showSnackbar(message, 'error')
  }

  // Configura o diálogo global e prepara uma Promise para o chamador aguardar a escolha.
  // O componente precisa chamar resolve quando o usuário confirmar ou cancelar.
  function confirm(options: {
    title: string
    text?: string
    message?: string
    danger?: boolean
    confirmText?: string
    cancelText?: string
    onConfirm?: () => void | Promise<void>
  }): Promise<boolean> {
    const msg = options.text || options.message || ''
    confirmDialog.value = {
      show: true,
      open: true,
      title: options.title,
      text: msg,
      message: msg,
      danger: options.danger ?? false,
      confirmText: options.confirmText || 'Confirmar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm || (() => {}),
      resolve: () => {},
    }
    return new Promise((resolve) => {
      confirmDialog.value.resolve = resolve
    })
  }

  function closeConfirmation(resolve: ((value: boolean) => void) | null) {
    if (!resolve || confirmDialog.value.resolve !== resolve) return
    confirmDialog.value.show = false
    confirmDialog.value.open = false
  }

  return {
    snackbar,
    snackbarQueue,
    confirmDialog,
    showSnackbar,
    notifySuccess,
    notifyError,
    dismissSnackbar,
    confirm,
    closeConfirmation,
  }
})
