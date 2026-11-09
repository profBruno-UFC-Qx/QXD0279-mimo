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
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
  })

  function showSnackbar(message: string, color = 'success') {
    snackbar.value = {
      show: true,
      message,
      color,
      timeout: 4000,
    }
  }

  function confirm(options: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void | Promise<void>
  }) {
    confirmDialog.value = {
      show: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'Confirmar',
      cancelText: options.cancelText || 'Cancelar',
      onConfirm: options.onConfirm,
    }
  }

  return {
    snackbar,
    confirmDialog,
    showSnackbar,
    confirm,
  }
})
