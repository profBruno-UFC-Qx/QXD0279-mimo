import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Notification, PageQuery } from '../types'
import { notificationService } from '../services/notification.service'
import type { RouteLocationRaw } from 'vue-router'

// Store destinada a compartilhar notificações, contagem de não lidas e polling
export const useNotificationsStore = defineStore('notifications', () => {
  // state
  const items = ref<Notification[]>([])
  const unreadCount = ref(0)
  const loading = ref(false)
  let pollInterval: any = null

  // actions: Atualiza o contador
  async function fetchUnreadCount() {
    try {
      const res = await notificationService.unreadCount()
      unreadCount.value = typeof res.count === 'number' ? res.count : (res as any).unreadCount || 0
    } catch {}
  }

  // Busca notificações para a lista
  async function fetchAll(query?: PageQuery) {
    loading.value = true
    try {
      const res = await notificationService.list(query)
      items.value = res.data || (res as any).content || []
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  // Marca uma notificação no backend e atualiza o item e o contador local somente
  // depois do sucesso, evitando que a interface indique uma alteração não confirmada.
  async function markRead(id: number) {
    try {
      await notificationService.markRead(id)
      const item = items.value.find((n) => n.id === id)
      if (item && !item.read) {
        item.read = true
        if (unreadCount.value > 0) unreadCount.value--
      }
    } catch {}
  }

  // Marca todas no backend e sincroniza a lista e o contador em memória após o sucesso.
  async function markAllRead() {
    try {
      await notificationService.markAllRead()
      items.value.forEach((n) => (n.read = true))
      unreadCount.value = 0
    } catch {}
  }

  // Escolhe para onde navegar a partir das referências presentes na notificação;
  // notificações sem referência reconhecida levam à página geral de notificações.
  function routeFor(n: Notification): RouteLocationRaw {
    const type = (n as any).type || (n as any).title || ''
    const relatedId = (n as any).itemId || (n as any).lostReportId || (n as any).referenceId

    if (type.toString().includes('MATCH') || type.toString().includes('perda') || relatedId) {
      if (relatedId) {
        return { name: 'lost-report-detail', params: { id: relatedId } }
      }
    }
    return { name: 'notifications' }
  }

  // Reinicia o timer antes de iniciar outro para evitar polling duplicado.
  // Faz uma consulta imediata e depois atualiza a contagem a cada 30 segundos.
  function startPolling() {
    stopPolling()
    fetchUnreadCount()
    pollInterval = setInterval(() => {
      fetchUnreadCount()
    }, 30000)
  }

  // Para o polling e limpa a referência para permitir que startPolling seja chamado novamente.
  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  return {
    items,
    unreadCount,
    loading,
    fetchUnreadCount,
    fetchAll,
    markRead,
    markAllRead,
    routeFor,
    startPolling,
    stopPolling,
  }
})
