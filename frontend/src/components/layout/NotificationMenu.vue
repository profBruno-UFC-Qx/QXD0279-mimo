<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { notificationService } from '@/services/notification.service'
import type { Notification } from '@/types'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const unreadCount = ref(0)
const notifications = ref<Notification[]>([])
const loading = ref(false)
let pollInterval: any = null

async function fetchUnreadCount() {
  if (!auth.isAuthenticated) {
    unreadCount.value = 0
    return
  }
  try {
    const res = await notificationService.unreadCount()
    unreadCount.value = res.count
  } catch {
    // ignore
  }
}

async function fetchNotifications() {
  if (!auth.isAuthenticated) return
  loading.value = true
  try {
    const res = await notificationService.list({ page: 1, size: 5 })
    notifications.value = res.data ?? (res as any).content ?? []
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function handleMenuOpen(isOpen: boolean) {
  if (isOpen && auth.isAuthenticated) {
    await fetchNotifications()
  }
}

async function markAsRead(notification: Notification) {
  if (notification.read) return
  try {
    await notificationService.markAsRead(notification.id)
    notification.read = true
    if (unreadCount.value > 0) unreadCount.value--
  } catch {
    // ignore
  }
}

async function markAllAsRead() {
  try {
    await notificationService.markAllAsRead()
    notifications.value.forEach((n) => (n.read = true))
    unreadCount.value = 0
  } catch {
    // ignore
  }
}

onMounted(() => {
  fetchUnreadCount()
  pollInterval = setInterval(fetchUnreadCount, 60000) // poll every minute
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>

<template>
  <v-menu
    v-if="auth.isAuthenticated"
    location="bottom end"
    transition="slide-y-transition"
    :close-on-content-click="false"
    @update:model-value="handleMenuOpen"
  >
    <template v-slot:activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        variant="text"
        color="on-primary"
        class="text-none mr-2"
        aria-label="Notificações"
      >
        <v-badge
          :content="unreadCount"
          :model-value="unreadCount > 0"
          color="error"
          dot
          offset-x="2"
          offset-y="2"
        >
          <v-icon icon="mdi-bell-outline" size="24" color="on-primary" />
        </v-badge>
      </v-btn>
    </template>

    <v-card width="320" max-width="90vw" class="elevation-4 rounded-lg">
      <div class="d-flex align-center justify-space-between px-4 py-3 border-bottom">
        <span class="text-subtitle-1 font-weight-bold">Notificações</span>
        <v-btn
          v-if="unreadCount > 0"
          variant="text"
          density="compact"
          color="primary"
          class="text-caption text-none"
          @click="markAllAsRead"
        >
          Marcar todas como lidas
        </v-btn>
      </div>

      <v-divider />

      <v-card-text class="pa-0" style="max-height: 350px; overflow-y: auto;">
        <div v-if="loading" class="d-flex justify-center py-6">
          <v-progress-circular indeterminate color="primary" size="24" />
        </div>
        <div v-else-if="notifications.length === 0" class="text-center py-6 text-medium-emphasis text-body-2">
          Nenhuma notificação encontrada.
        </div>
        <v-list v-else density="compact" class="py-0">
          <v-list-item
            v-for="item in notifications"
            :key="item.id"
            class="py-3 px-4 border-bottom"
            :class="{ 'bg-surface-muted': !item.read }"
            @click="markAsRead(item)"
          >
            <template v-slot:prepend>
              <v-icon
                :color="item.read ? 'grey' : 'primary'"
                icon="mdi-bell-badge-outline"
                class="mr-3"
              />
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium mb-1">
              {{ item.title }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-wrap text-medium-emphasis">
              {{ item.message }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-menu>
</template>
