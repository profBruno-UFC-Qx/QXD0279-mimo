<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
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

const MAX_PREVIEW_ITEMS = 5

const auth = useAuthStore()
const notificationsStore = useNotificationsStore()
const {
  items,
  unreadCount,
  loading,
  error,
  countError,
  pendingReadIds,
  markingAll,
  reconciling,
  writeError,
  reconcilePendingAfterMarkAll,
  hasUnread,
  isWriting,
} = storeToRefs(notificationsStore)

const menuOpen = ref(false)
let unmounted = false
let stopPolling: (() => void) | null = null

const hasBadge = computed(() => unreadCount.value !== null && unreadCount.value > 0)

const headerCountLabel = computed(() => {
  if (countError.value || unreadCount.value === null) return 'Contagem indisponível'
  if (unreadCount.value === 0) return 'Nenhuma não lida'
  return unreadCount.value === 1 ? '1 não lida' : `${unreadCount.value} não lidas`
})

const previewItems = computed(() =>
  items.value.slice(0, MAX_PREVIEW_ITEMS).map((notification) => ({
    notification,
    read: isNotificationRead(notification),
    presentation: getNotificationPresentation(notification.type),
    targetRoute: resolveNotificationRoute(notification.linkUrl, auth.role),
    formattedDate: formatDateTime(notification.createdAt),
  })),
)

function loadUnreadCountIfAuthenticated() {
  if (unmounted || !auth.isAuthenticated) return
  void notificationsStore.fetchUnreadCount()
}

function handleMenuOpen(isOpen: boolean) {
  menuOpen.value = isOpen
  if (isOpen && !unmounted && auth.isAuthenticated) {
    void notificationsStore.fetchAll()
  }
}

function retryLoad() {
  if (unmounted || !auth.isAuthenticated) return
  if (reconcilePendingAfterMarkAll.value) {
    void notificationsStore.retryReconcile()
    return
  }
  notificationsStore.clearWriteError()
  void Promise.all([notificationsStore.fetchAll(), notificationsStore.fetchUnreadCount()])
}

function handleMarkRead(id: number) {
  if (unmounted || !auth.isAuthenticated) return
  void notificationsStore.markRead(id)
}

function handleMarkAllRead() {
  if (unmounted || !auth.isAuthenticated) return
  void notificationsStore.markAllRead()
}

onMounted(() => {
  stopPolling = notificationsStore.startPolling({
    includeList: () => menuOpen.value,
  })
  loadUnreadCountIfAuthenticated()
})

watch(
  () => [auth.isAuthenticated, auth.token, auth.user?.id ?? null, auth.sessionGeneration] as const,
  ([authenticated]) => {
    if (!authenticated) {
      menuOpen.value = false
      return
    }
    loadUnreadCountIfAuthenticated()
  },
)

onBeforeUnmount(() => {
  unmounted = true
  menuOpen.value = false
  stopPolling?.()
  stopPolling = null
})
</script>

<template>
  <v-menu
    v-if="auth.isAuthenticated"
    v-model="menuOpen"
    location="bottom end"
    transition="slide-y-transition"
    :close-on-content-click="false"
    @update:model-value="handleMenuOpen"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        variant="text"
        color="primary"
        class="text-none mr-2"
        aria-label="Notificações"
      >
        <v-badge
          :content="unreadCount ?? 0"
          :model-value="hasBadge"
          color="error"
          offset-x="2"
          offset-y="2"
        >
          <v-icon icon="mdi-bell-outline" size="24" color="primary" />
        </v-badge>
      </v-btn>
    </template>

    <v-card width="360" max-width="92vw" class="elevation-4 rounded-lg">
      <div class="d-flex align-center justify-space-between px-4 py-3">
        <span class="text-subtitle-1 font-weight-bold">Notificações</span>
        <AppPill
          size="x-small"
          :color="hasBadge ? 'primary' : 'on-surface'"
        >
          {{ headerCountLabel }}
        </AppPill>
      </div>

      <div
        v-if="(hasUnread || markingAll) && !reconcilePendingAfterMarkAll"
        class="px-4 pb-2 d-flex justify-end"
      >
        <v-btn
          size="x-small"
          variant="text"
          color="primary"
          class="text-none"
          prepend-icon="mdi-check-all"
          :loading="markingAll || reconciling"
          :disabled="loading || isWriting || !hasUnread"
          @click.stop.prevent="handleMarkAllRead"
        >
          Marcar todas como lidas
        </v-btn>
      </div>

      <v-divider />

      <div v-if="writeError" class="px-4 py-2 bg-error-lighten-5 border-b">
        <div class="text-caption text-error mb-1">{{ writeError }}</div>
        <v-btn
          size="x-small"
          variant="text"
          color="error"
          class="text-none px-0"
          :loading="reconciling || loading"
          @click.stop.prevent="retryLoad"
        >
          Atualizar visualização
        </v-btn>
      </div>

      <v-card-text class="pa-0" style="max-height: 360px; overflow-y: auto;">
        <div v-if="loading" class="d-flex justify-center py-6">
          <v-progress-circular indeterminate color="primary" size="24" />
        </div>

        <div v-else-if="error" class="px-4 py-5 text-center">
          <div class="text-body-2 text-error mb-2">{{ error }}</div>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            class="text-none"
            @click.stop="retryLoad"
          >
            Tentar novamente
          </v-btn>
        </div>

        <div
          v-else-if="previewItems.length === 0"
          class="text-center py-6 px-4 text-medium-emphasis text-body-2"
        >
          Nenhuma notificação por enquanto.
        </div>

        <v-list v-else density="compact" class="py-0">
          <v-list-item
            v-for="entry in previewItems"
            :key="entry.notification.id"
            :to="entry.targetRoute ?? undefined"
            class="py-3 px-4 border-bottom"
            :class="{ 'bg-surface-muted': !entry.read }"
            @click="entry.targetRoute ? (menuOpen = false) : undefined"
          >
            <template #prepend>
              <v-icon
                :color="entry.read ? 'surface-muted' : 'primary'"
                :icon="entry.presentation.icon"
                class="mr-3"
              />
            </template>

            <v-list-item-title class="text-body-2 font-weight-medium mb-1">
              {{ entry.presentation.title }}
            </v-list-item-title>

            <v-list-item-subtitle class="text-caption text-medium-emphasis">
              <div>{{ entry.formattedDate }}</div>
              <div v-if="!entry.targetRoute" class="text-caption">Destino indisponível</div>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                v-if="!entry.read"
                size="x-small"
                variant="text"
                color="primary"
                class="text-none ml-2"
                :aria-label="`Marcar notificação ${entry.notification.id} como lida`"
                :loading="pendingReadIds.has(entry.notification.id)"
                :disabled="markingAll || reconciling || pendingReadIds.has(entry.notification.id)"
                @click.stop.prevent="handleMarkRead(entry.notification.id)"
                @keydown.enter.stop.prevent="handleMarkRead(entry.notification.id)"
                @keydown.space.stop.prevent="handleMarkRead(entry.notification.id)"
              >
                Marcar como lida
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-divider />

      <div class="pa-2 text-center">
        <v-btn
          :to="{ name: 'notifications' }"
          block
          variant="text"
          color="primary"
          class="text-none"
          @click="menuOpen = false"
        >
          Ver todas as notificações
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>
