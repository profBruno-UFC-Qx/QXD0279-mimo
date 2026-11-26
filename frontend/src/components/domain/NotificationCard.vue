<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
import type { NotificationDisplayEntry } from '@/composables/user/useNotifications'

defineProps<{
  entry: NotificationDisplayEntry
  markingRead: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  markRead: [id: number]
}>()
</script>

<template>
  <v-card
    variant="flat"
    class="pa-4 rounded-lg border"
    :class="entry.read ? 'bg-surface' : 'notification-unread border-primary'"
  >
    <div class="d-flex align-start justify-space-between flex-wrap ga-3">
      <div class="d-flex align-start ga-3 flex-grow-1">
        <v-avatar
          :color="entry.read ? 'surface-muted' : 'primary'"
          variant="tonal"
          size="40"
        >
          <v-icon
            :icon="entry.presentation.icon"
            :color="entry.read ? undefined : 'primary'"
            size="20"
          />
        </v-avatar>

        <div class="flex-grow-1">
          <div class="d-flex align-center flex-wrap ga-2 mb-1">
            <span class="text-subtitle-1 font-weight-bold">
              {{ entry.presentation.title }}
            </span>
            <AppPill
              size="x-small"
              :color="entry.read ? 'on-surface' : 'primary'"
            >
              {{ entry.read ? 'Lida' : 'Não lida' }}
            </AppPill>
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
          :loading="markingRead"
          :disabled="disabled"
          @click="emit('markRead', entry.notification.id)"
        >
          Marcar como lida
        </v-btn>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.notification-unread {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
