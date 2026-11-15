import { AxiosError } from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Notification } from '@/types'
import { notificationService } from '@/services/notification.service'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import {
  isNotificationRead,
  isValidNotification,
  isValidNotificationList,
  isValidUnreadCount,
} from '@/utils/notifications'

export const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000

export interface PollingConsumerOptions {
  includeList?: boolean | (() => boolean)
}

interface RequestSnapshot {
  requestId: number
  token: string
  userId: number | null
  generation: number
  mutationEpoch: number
}

const GENERIC_LIST_ERROR = 'Não foi possível carregar suas notificações.'
const GENERIC_COUNT_ERROR = 'Não foi possível carregar a contagem de notificações.'
const NOT_FOUND_WRITE_ERROR = 'Notificação não encontrada.'
const GENERIC_WRITE_ERROR =
  'Não foi possível atualizar a notificação. Verifique o estado e tente novamente.'
const GENERIC_MARK_ALL_ERROR =
  'Não foi possível marcar todas as notificações como lidas. Verifique o estado e tente novamente.'
const RECONCILE_AFTER_MARK_ALL_ERROR =
  'As notificações foram marcadas no servidor, mas não foi possível atualizar a visualização agora. Tente atualizar novamente.'
const MARK_ALL_SUCCESS_MESSAGE = 'Notificações marcadas como lidas.'

function isPositiveSafeId(id: number): boolean {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
}

function getHttpStatus(err: unknown): number | null {
  if (err instanceof AxiosError) {
    return err.response?.status ?? null
  }
  return null
}

/** Store compartilhada de notificações para leitura, marcação como lida e polling seguro por sessão. */
export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const ui = useUiStore()

  const items = ref<Notification[]>([])
  const unreadCount = ref<number | null>(null)
  const loading = ref(false)
  const countLoading = ref(false)
  const error = ref<string | null>(null)
  const countError = ref<string | null>(null)

  const pendingReadIds = ref<Set<number>>(new Set())
  const markingAll = ref(false)
  const reconciling = ref(false)
  const writeError = ref<string | null>(null)
  const reconcilePendingAfterMarkAll = ref(false)

  let latestListReqId = 0
  let latestCountReqId = 0
  let mutationEpoch = 0
  let activeWriteCount = 0
  let inFlightList = false
  let inFlightCount = false

  let nextConsumerId = 0
  const consumers = new Map<number, PollingConsumerOptions>()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollTimerEpoch = 0
  let pollTimerSessionKey: string | null = null

  const hasUnread = computed(() => {
    if (unreadCount.value !== null && unreadCount.value > 0) return true
    return items.value.some((notification) => !isNotificationRead(notification))
  })

  const isWriting = computed(
    () => markingAll.value || reconciling.value || pendingReadIds.value.size > 0,
  )

  function currentSessionKey(): string | null {
    if (!auth.token || !auth.user?.id) return null
    return `${auth.token}:${auth.user.id}:${auth.sessionGeneration}`
  }

  function captureSnapshot(requestId: number): RequestSnapshot | null {
    if (!auth.token) return null
    return {
      requestId,
      token: auth.token,
      userId: auth.user?.id ?? null,
      generation: auth.sessionGeneration,
      mutationEpoch,
    }
  }

  function isCurrentSession(snapshot: RequestSnapshot): boolean {
    if (!auth.token || auth.token !== snapshot.token) return false
    if (auth.sessionGeneration !== snapshot.generation) return false
    if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
    return true
  }

  function ownsListRequest(snapshot: RequestSnapshot): boolean {
    return snapshot.requestId === latestListReqId && isCurrentSession(snapshot)
  }

  function ownsCountRequest(snapshot: RequestSnapshot): boolean {
    return snapshot.requestId === latestCountReqId && isCurrentSession(snapshot)
  }

  function isCurrentListRequest(snapshot: RequestSnapshot): boolean {
    return ownsListRequest(snapshot) && snapshot.mutationEpoch === mutationEpoch
  }

  function isCurrentCountRequest(snapshot: RequestSnapshot): boolean {
    return ownsCountRequest(snapshot) && snapshot.mutationEpoch === mutationEpoch
  }

  function clearPollTimer() {
    pollTimerEpoch += 1
    pollTimerSessionKey = null
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function addPendingReadId(id: number) {
    const next = new Set(pendingReadIds.value)
    next.add(id)
    pendingReadIds.value = next
  }

  function removePendingReadId(id: number) {
    if (!pendingReadIds.value.has(id)) return
    const next = new Set(pendingReadIds.value)
    next.delete(id)
    pendingReadIds.value = next
  }

  function resetState() {
    ++latestListReqId
    ++latestCountReqId
    ++mutationEpoch
    activeWriteCount = 0
    inFlightList = false
    inFlightCount = false
    items.value = []
    unreadCount.value = null
    loading.value = false
    countLoading.value = false
    error.value = null
    countError.value = null
    pendingReadIds.value = new Set()
    markingAll.value = false
    reconciling.value = false
    writeError.value = null
    reconcilePendingAfterMarkAll.value = false
  }

  function anyConsumerWantsList(): boolean {
    for (const options of consumers.values()) {
      const want =
        typeof options.includeList === 'function'
          ? options.includeList()
          : Boolean(options.includeList)
      if (want) return true
    }
    return false
  }

  function runPollTick(expectedEpoch: number, expectedSessionKey: string) {
    if (expectedEpoch !== pollTimerEpoch) return
    const sessionKey = currentSessionKey()
    if (!sessionKey || sessionKey !== expectedSessionKey || consumers.size === 0) return
    if (activeWriteCount > 0 || markingAll.value || reconciling.value || pendingReadIds.value.size > 0) {
      return
    }

    if (anyConsumerWantsList() && !inFlightList) {
      void fetchAll()
    }
    if (!inFlightCount) {
      void fetchUnreadCount()
    }
  }

  function syncPollingTimer() {
    const sessionKey = currentSessionKey()
    if (!sessionKey || consumers.size === 0) {
      clearPollTimer()
      return
    }

    if (pollTimer !== null && pollTimerSessionKey === sessionKey) {
      return
    }

    clearPollTimer()
    const timerEpoch = pollTimerEpoch
    pollTimerSessionKey = sessionKey
    pollTimer = setInterval(() => {
      runPollTick(timerEpoch, sessionKey)
    }, NOTIFICATIONS_POLL_INTERVAL_MS)
  }

  function startPolling(options: PollingConsumerOptions = {}): () => void {
    const consumerId = ++nextConsumerId
    consumers.set(consumerId, options)
    syncPollingTimer()

    return () => {
      if (!consumers.has(consumerId)) return
      consumers.delete(consumerId)
      syncPollingTimer()
    }
  }

  watch(
    () => [auth.token, auth.user?.id ?? null, auth.sessionGeneration] as const,
    () => {
      clearPollTimer()
      resetState()
      syncPollingTimer()
    },
    { flush: 'sync' },
  )

  async function fetchAll(): Promise<boolean> {
    const requestId = ++latestListReqId
    const snapshot = captureSnapshot(requestId)
    if (!snapshot) {
      resetState()
      return false
    }

    loading.value = true
    inFlightList = true
    error.value = null

    try {
      const data = await notificationService.list()
      if (!isCurrentListRequest(snapshot)) return false

      if (!isValidNotificationList(data, snapshot.userId)) {
        items.value = []
        error.value = GENERIC_LIST_ERROR
        return false
      }

      items.value = data
      error.value = null
      return true
    } catch {
      if (!isCurrentListRequest(snapshot)) return false
      items.value = []
      error.value = GENERIC_LIST_ERROR
      return false
    } finally {
      if (ownsListRequest(snapshot)) {
        inFlightList = false
        loading.value = false
      }
    }
  }

  async function fetchUnreadCount(): Promise<boolean> {
    const requestId = ++latestCountReqId
    const snapshot = captureSnapshot(requestId)
    if (!snapshot) {
      resetState()
      return false
    }

    countLoading.value = true
    inFlightCount = true
    countError.value = null

    try {
      const res = await notificationService.unreadCount()
      if (!isCurrentCountRequest(snapshot)) return false

      if (!isValidUnreadCount(res)) {
        unreadCount.value = null
        countError.value = GENERIC_COUNT_ERROR
        return false
      }

      unreadCount.value = res.count
      countError.value = null
      return true
    } catch {
      if (!isCurrentCountRequest(snapshot)) return false
      unreadCount.value = null
      countError.value = GENERIC_COUNT_ERROR
      return false
    } finally {
      if (ownsCountRequest(snapshot)) {
        inFlightCount = false
        countLoading.value = false
      }
    }
  }

  async function markRead(id: number): Promise<boolean> {
    const snapshot = captureSnapshot(0)
    if (!snapshot || snapshot.userId === null) return false
    if (!isPositiveSafeId(id)) {
      writeError.value = GENERIC_WRITE_ERROR
      return false
    }
    if (markingAll.value || reconciling.value || pendingReadIds.value.has(id)) {
      return false
    }

    const existing = items.value.find((notification) => notification.id === id)
    if (!existing || existing.userId !== snapshot.userId || isNotificationRead(existing)) {
      return false
    }

    ++mutationEpoch
    ++latestListReqId
    ++latestCountReqId
    inFlightList = false
    inFlightCount = false
    loading.value = false
    countLoading.value = false
    activeWriteCount += 1
    addPendingReadId(id)
    writeError.value = null

    let writeSucceeded = false
    try {
      const updated = await notificationService.markRead(id)
      if (!isCurrentSession(snapshot)) return false

      const validDto =
        isValidNotification(updated) &&
        updated.id === id &&
        updated.userId === snapshot.userId &&
        isNotificationRead(updated)

      if (!validDto) {
        writeError.value = GENERIC_WRITE_ERROR
        return false
      }

      ++mutationEpoch
      items.value = items.value.map((notification) =>
        notification.id === id ? updated : notification,
      )
      writeSucceeded = true
    } catch (err) {
      if (!isCurrentSession(snapshot)) return false
      const status = getHttpStatus(err)
      if (status === 404) {
        writeError.value = NOT_FOUND_WRITE_ERROR
      } else if (status !== 401) {
        writeError.value = GENERIC_WRITE_ERROR
      }
      return false
    } finally {
      if (isCurrentSession(snapshot)) {
        removePendingReadId(id)
        activeWriteCount = Math.max(0, activeWriteCount - 1)
      }
    }

    if (writeSucceeded && isCurrentSession(snapshot)) {
      await fetchUnreadCount()
    }
    return writeSucceeded
  }

  async function retryReconcile(): Promise<boolean> {
    const snapshot = captureSnapshot(0)
    if (!snapshot || snapshot.userId === null) return false
    if (markingAll.value || reconciling.value || pendingReadIds.value.size > 0) {
      return false
    }

    reconciling.value = true
    writeError.value = null
    try {
      const [listOk, countOk] = await Promise.all([fetchAll(), fetchUnreadCount()])
      if (!isCurrentSession(snapshot)) return false

      if (!listOk || !countOk) {
        if (reconcilePendingAfterMarkAll.value) {
          writeError.value = RECONCILE_AFTER_MARK_ALL_ERROR
        } else {
          writeError.value = GENERIC_MARK_ALL_ERROR
        }
        return false
      }

      reconcilePendingAfterMarkAll.value = false
      writeError.value = null
      return true
    } finally {
      if (isCurrentSession(snapshot)) {
        reconciling.value = false
      }
    }
  }

  async function markAllRead(): Promise<boolean> {
    const snapshot = captureSnapshot(0)
    if (!snapshot || snapshot.userId === null) return false
    if (markingAll.value || reconciling.value || pendingReadIds.value.size > 0) {
      return false
    }
    if (!hasUnread.value) {
      return false
    }

    ++mutationEpoch
    ++latestListReqId
    ++latestCountReqId
    inFlightList = false
    inFlightCount = false
    loading.value = false
    countLoading.value = false
    activeWriteCount += 1
    markingAll.value = true
    writeError.value = null
    reconcilePendingAfterMarkAll.value = false

    let patchSucceeded = false
    try {
      await notificationService.markAllRead()
      if (!isCurrentSession(snapshot)) return false
      patchSucceeded = true
    } catch (err) {
      if (!isCurrentSession(snapshot)) return false
      if (getHttpStatus(err) !== 401) {
        writeError.value = GENERIC_MARK_ALL_ERROR
      }
      return false
    } finally {
      if (isCurrentSession(snapshot)) {
        markingAll.value = false
        activeWriteCount = Math.max(0, activeWriteCount - 1)
      }
    }

    if (!patchSucceeded || !isCurrentSession(snapshot)) return false

    ++mutationEpoch
    reconciling.value = true
    try {
      const [listOk, countOk] = await Promise.all([fetchAll(), fetchUnreadCount()])
      if (!isCurrentSession(snapshot)) return false

      if (!listOk || !countOk) {
        reconcilePendingAfterMarkAll.value = true
        writeError.value = RECONCILE_AFTER_MARK_ALL_ERROR
        return false
      }

      reconcilePendingAfterMarkAll.value = false
      writeError.value = null
      ui.notifySuccess(MARK_ALL_SUCCESS_MESSAGE)
      return true
    } finally {
      if (isCurrentSession(snapshot)) {
        reconciling.value = false
      }
    }
  }

  function clearWriteError() {
    writeError.value = null
  }

  return {
    items,
    unreadCount,
    loading,
    countLoading,
    error,
    countError,
    pendingReadIds,
    markingAll,
    reconciling,
    writeError,
    reconcilePendingAfterMarkAll,
    hasUnread,
    isWriting,
    fetchAll,
    fetchUnreadCount,
    markRead,
    markAllRead,
    retryReconcile,
    clearWriteError,
    startPolling,
    resetState,
  }
})
