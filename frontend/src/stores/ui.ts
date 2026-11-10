import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success',
    timeout: 4000,
  })

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

  function showSnackbar(message: string, color = 'success') {
    snackbar.value = {
      show: true,
      message,
      color,
      timeout: 4000,
    }
  }

  function notifySuccess(message: string) {
    showSnackbar(message, 'success')
  }

  function notifyError(message: string) {
    showSnackbar(message, 'error')
  }

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

  return {
    snackbar,
    confirmDialog,
    showSnackbar,
    notifySuccess,
    notifyError,
    confirm,
  }
})
