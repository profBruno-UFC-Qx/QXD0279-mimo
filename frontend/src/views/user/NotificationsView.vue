<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import NotificationCard from '@/components/domain/NotificationCard.vue'
import { useNotifications } from '@/composables/user/useNotifications'

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
  selectedFilter,
  filteredItems,
  emptyFilterTitle,
  displayItems,
  refresh,
  retrySync,
  handleMarkRead,
  handleMarkAllRead,
  clearWriteError,
} = useNotifications()
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
      @click:close="clearWriteError"
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
        <NotificationCard
          v-for="entry in displayItems"
          :key="entry.notification.id"
          :entry="entry"
          :marking-read="pendingReadIds.has(entry.notification.id)"
          :disabled="markingAll || reconciling || pendingReadIds.has(entry.notification.id)"
          @mark-read="handleMarkRead"
        />
      </div>
    </LoadingOverlay>
  </div>
</template>
