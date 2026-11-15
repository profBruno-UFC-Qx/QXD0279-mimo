<script setup lang="ts">
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
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'

type NotificationFilter = 'all' | 'unread' | 'read'

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

const displayItems = computed(() =>
  filteredItems.value.map((notification) => {
    const read = isNotificationRead(notification)
    const presentation = getNotificationPresentation(notification.type)
    const targetRoute = resolveNotificationRoute(notification.linkUrl, auth.role)
    return {
      notification,
      read,
      presentation,
      targetRoute,
      formattedDate: formatDateTime(notification.createdAt),
    }
  }),
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
</script>

<template>
  <div>
    <PageHeader
      title="Notificações"
      subtitle="Acompanhe atualizações sobre seus objetos perdidos."
    >
      <template #actions>
        <div class="d-flex flex-wrap align-center ga-2">
          <v-btn
            color="primary"
            variant="outlined"
            prepend-icon="mdi-refresh"
            class="text-none"
            :loading="loading || countLoading"
            :disabled="loading || isWriting"
            @click="refresh"
          >
            Atualizar
          </v-btn>

          <v-btn
            v-if="(hasUnread || markingAll) && !reconcilePendingAfterMarkAll"
            color="primary"
            variant="flat"
            prepend-icon="mdi-check-all"
            class="text-none"
            :loading="markingAll || reconciling"
            :disabled="loading || isWriting || !hasUnread"
            @click="handleMarkAllRead"
          >
            Marcar todas como lidas
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
      <v-btn-toggle
        v-model="selectedFilter"
        mandatory
        color="primary"
        variant="outlined"
        density="comfortable"
        divided
      >
        <v-btn value="all" class="text-none">Todas</v-btn>
        <v-btn value="unread" class="text-none">Não lidas</v-btn>
        <v-btn value="read" class="text-none">Lidas</v-btn>
      </v-btn-toggle>
    </div>

    <v-alert
      v-if="writeError"
      type="error"
      variant="tonal"
      class="mb-4 rounded-lg"
      closable
      @click:close="notificationsStore.clearWriteError()"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ writeError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :loading="reconciling || loading"
          @click="retrySync"
        >
          Atualizar visualização
        </v-btn>
      </div>
    </v-alert>

    <LoadingOverlay :loading="loading" text="Carregando suas notificações...">
      <ErrorAlert
        v-if="error"
        :error="error"
        @retry="refresh"
      />

      <EmptyState
        v-else-if="!loading && items.length === 0"
        icon="mdi-bell-outline"
        title="Nenhuma notificação por enquanto."
        description="Quando houver novidades sobre suas perdas, elas aparecerão aqui."
      />

      <v-card
        v-else-if="!loading && filteredItems.length === 0"
        class="pa-6 rounded-lg border text-center"
        variant="flat"
      >
        <v-icon icon="mdi-filter-off-outline" size="36" color="grey-darken-1" class="mb-2" />
        <div class="text-body-1 font-weight-medium">{{ emptyFilterTitle }}</div>
      </v-card>

      <div v-else-if="displayItems.length > 0" class="d-flex flex-column ga-3">
        <v-card
          v-for="entry in displayItems"
          :key="entry.notification.id"
          variant="flat"
          class="pa-4 rounded-lg border"
          :class="entry.read ? 'bg-surface' : 'notification-unread border-primary'"
        >
          <div class="d-flex align-start justify-space-between flex-wrap ga-3">
            <div class="d-flex align-start ga-3 flex-grow-1">
              <v-avatar
                :color="entry.read ? 'grey-lighten-3' : 'primary'"
                :variant="entry.read ? 'flat' : 'tonal'"
                size="40"
              >
                <v-icon
                  :icon="entry.presentation.icon"
                  :color="entry.read ? 'grey-darken-1' : 'primary'"
                  size="20"
                />
              </v-avatar>

              <div class="flex-grow-1">
                <div class="d-flex align-center flex-wrap ga-2 mb-1">
                  <span class="text-subtitle-1 font-weight-bold">
                    {{ entry.presentation.title }}
                  </span>
                  <v-chip
                    size="x-small"
                    :color="entry.read ? 'default' : 'primary'"
                    :variant="entry.read ? 'tonal' : 'flat'"
                  >
                    {{ entry.read ? 'Lida' : 'Não lida' }}
                  </v-chip>
                </div>

                <p class="text-body-2 text-medium-emphasis mb-2">
                  {{ entry.presentation.message }}
                </p>

                <div class="text-caption text-medium-emphasis">
                  {{ entry.formattedDate }}
                </div>
              </div>
            </div>

            <div class="d-flex flex-wrap align-center align-self-center ga-2">
              <v-btn
                v-if="entry.targetRoute"
                :to="entry.targetRoute"
                variant="tonal"
                color="primary"
                size="small"
                class="text-none"
                append-icon="mdi-arrow-right"
              >
                Ver detalhes
              </v-btn>
              <span v-else class="text-caption text-medium-emphasis">
                Destino indisponível
              </span>

              <v-btn
                v-if="!entry.read"
                variant="outlined"
                color="primary"
                size="small"
                class="text-none"
                prepend-icon="mdi-check"
                :loading="pendingReadIds.has(entry.notification.id)"
                :disabled="markingAll || reconciling || pendingReadIds.has(entry.notification.id)"
                @click="handleMarkRead(entry.notification.id)"
              >
                Marcar como lida
              </v-btn>
            </div>
          </div>
        </v-card>
      </div>
    </LoadingOverlay>
  </div>
</template>

<style scoped>
.notification-unread {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
