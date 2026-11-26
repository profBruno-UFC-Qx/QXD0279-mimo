import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { formatDateTime } from '@/utils/format'
import {
  getNotificationPresentation,
  isNotificationRead,
  resolveNotificationRoute,
} from '@/utils/notifications'
import type { Notification } from '@/types'

export type NotificationFilter = 'all' | 'unread' | 'read'

export interface NotificationDisplayEntry {
  notification: Notification
  read: boolean
  presentation: ReturnType<typeof getNotificationPresentation>
  targetRoute: ReturnType<typeof resolveNotificationRoute>
  formattedDate: string
}

export function useNotifications() {
  const auth = useAuthStore()
  const notificationsStore = useNotificationsStore()
  const {
    items,
    loading,
    countLoading,
    error,
    pendingReadIds,
    markingAll,
    reconciling,
    writeError,
    reconcilePendingAfterMarkAll,
    hasUnread,
    isWriting,
  } = storeToRefs(notificationsStore)

  const selectedFilter = ref<NotificationFilter>('all')
  let unmounted = false
  let stopPolling: (() => void) | null = null

  const filteredItems = computed(() => {
    if (selectedFilter.value === 'unread') {
      return items.value.filter((n) => !isNotificationRead(n))
    }
    if (selectedFilter.value === 'read') {
      return items.value.filter((n) => isNotificationRead(n))
    }
    return items.value
  })

  const emptyFilterTitle = computed(() =>
    selectedFilter.value === 'unread'
      ? 'Nenhuma notificação não lida.'
      : 'Nenhuma notificação lida.',
  )

  const displayItems = computed<NotificationDisplayEntry[]>(() =>
    filteredItems.value.map((notification) => ({
      notification,
      read: isNotificationRead(notification),
      presentation: getNotificationPresentation(notification.type),
      targetRoute: resolveNotificationRoute(notification.linkUrl, auth.role),
      formattedDate: formatDateTime(notification.createdAt),
    })),
  )

  function loadCurrentSession() {
    if (unmounted || !auth.token || !auth.user) return
    void Promise.all([notificationsStore.fetchAll(), notificationsStore.fetchUnreadCount()])
  }

  function refresh() {
    if (unmounted || loading.value || isWriting.value || !auth.token) return
    if (reconcilePendingAfterMarkAll.value) {
      void notificationsStore.retryReconcile()
      return
    }
    void Promise.all([notificationsStore.fetchAll(), notificationsStore.fetchUnreadCount()])
  }

  function retrySync() {
    if (unmounted || !auth.token || !auth.user) return
    if (reconcilePendingAfterMarkAll.value) {
      void notificationsStore.retryReconcile()
      return
    }
    notificationsStore.clearWriteError()
    void Promise.all([notificationsStore.fetchAll(), notificationsStore.fetchUnreadCount()])
  }

  function handleMarkRead(id: number) {
    if (unmounted || !auth.token || !auth.user) return
    void notificationsStore.markRead(id)
  }

  function handleMarkAllRead() {
    if (unmounted || !auth.token || !auth.user) return
    void notificationsStore.markAllRead()
  }

  function clearWriteError() {
    notificationsStore.clearWriteError()
  }

  onMounted(() => {
    stopPolling = notificationsStore.startPolling({ includeList: true })
    loadCurrentSession()
  })

  watch(
    () => [auth.token, auth.user?.id ?? null, auth.sessionGeneration] as const,
    () => {
      selectedFilter.value = 'all'
      loadCurrentSession()
    },
  )

  onBeforeUnmount(() => {
    unmounted = true
    stopPolling?.()
    stopPolling = null
  })

  return {
    items,
    loading,
    countLoading,
    error,
    pendingReadIds,
    markingAll,
    reconciling,
    writeError,
    reconcilePendingAfterMarkAll,
    hasUnread,
    isWriting,
    selectedFilter,
    filteredItems,
    emptyFilterTitle,
    displayItems,
    refresh,
    retrySync,
    handleMarkRead,
    handleMarkAllRead,
    clearWriteError,
  }
}
