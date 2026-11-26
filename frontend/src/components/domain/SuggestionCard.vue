<script setup lang="ts">
import { computed } from 'vue'
import type { PublicCatalogItem, PublicSuggestedItem } from '@/types'
import { formatDate } from '@/utils/format'
import { getSafePrimaryPhotoUrl } from '@/utils/suggestions'
import StatusChip from './StatusChip.vue'
import AppPill from '@/components/common/AppPill.vue'

const props = withDefaults(
  defineProps<{
    item: PublicCatalogItem | PublicSuggestedItem
    mode?: 'preview' | 'confirm' | 'interactive'
    state?: 'waiting' | 'confirmed' | 'discarded'
    score?: number
    confirming?: boolean
    disabled?: boolean
  }>(),
  {
    mode: 'preview',
    state: 'waiting',
    score: undefined,
    confirming: false,
    disabled: false,
  },
)

const emit = defineEmits<{ confirm: []; discard: [] }>()

const primaryPhotoUrl = computed(() => getSafePrimaryPhotoUrl(props.item.photos))
const isInteractive = computed(() => props.mode === 'interactive')
const isConfirmMode = computed(() => props.mode === 'confirm')
const descriptionText = computed(() =>
  typeof props.item.description === 'string' && props.item.description.trim() !== ''
    ? props.item.description
    : null,
)
const foundLocationText = computed(() =>
  typeof props.item.foundLocation === 'string' && props.item.foundLocation.trim() !== ''
    ? props.item.foundLocation
    : 'Local não informado',
)
</script>

<template>
  <v-card
    class="suggestion-card h-100 d-flex flex-column rounded-lg border"
    :class="{ 'suggestion-card--discarded': isInteractive && state === 'discarded' }"
    variant="flat"
  >
    <v-img
      v-if="primaryPhotoUrl"
      :src="primaryPhotoUrl"
      :alt="`Foto de ${item.title}`"
      eager
      height="190"
      cover
    />
    <div
      v-else
      class="suggestion-card__placeholder d-flex align-center justify-center bg-surface-muted"
    >
      <v-icon
        icon="mdi-image-outline"
        size="48"
        color="outline"
        role="img"
        :aria-label="`Sem foto de ${item.title}`"
      />
    </div>

    <v-card-text class="d-flex flex-column flex-grow-1">
      <div class="d-flex flex-wrap ga-2 mb-3">
        <AppPill
          v-if="item.category?.name"
          color="on-surface"
        >
          {{ item.category.name }}
        </AppPill>
        <StatusChip :status="item.status" kind="item" />
        <AppPill v-if="isInteractive && state === 'confirmed'" color="success">
          CONFIRMADO
        </AppPill>
        <AppPill v-else-if="isInteractive && state === 'discarded'" color="on-surface">
          DESCARTADA
        </AppPill>
      </div>

      <h2 class="text-subtitle-1 font-weight-bold suggestion-title mb-2">{{ item.title }}</h2>

      <p v-if="descriptionText" class="text-body-2 text-medium-emphasis suggestion-description mb-3">
        {{ descriptionText }}
      </p>

      <div class="mt-auto text-body-2 text-medium-emphasis">
        <div class="d-flex align-center ga-2 mb-1">
          <v-icon icon="mdi-map-marker-outline" size="small" />
          <span>{{ item.building?.name ?? 'Prédio não informado' }}</span>
        </div>
        <div class="d-flex align-center ga-2 mb-1">
          <v-icon icon="mdi-map-marker-radius-outline" size="small" />
          <span>{{ foundLocationText }}</span>
        </div>
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-calendar-outline" size="small" />
          <span>Encontrado em {{ formatDate(item.foundDate) }}</span>
        </div>
        <div v-if="isInteractive && score !== undefined" class="mt-1">
          Compatibilidade: {{ score }}%
        </div>
      </div>

      <v-alert
        v-if="isInteractive && state === 'confirmed'"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
      >
        Leve um documento ao balcão do prédio.
      </v-alert>
    </v-card-text>

    <v-card-actions class="px-4 pb-4 pt-0 flex-wrap ga-2">
      <v-btn
        variant="tonal"
        color="primary"
        size="small"
        class="text-none"
        :to="{ name: 'item-detail', params: { id: item.id } }"
      >
        Ver detalhes do item
      </v-btn>
      <template v-if="isConfirmMode">
        <v-btn
          color="primary"
          size="small"
          class="text-none"
          :loading="confirming"
          :disabled="disabled || confirming"
          @click="emit('confirm')"
        >
          ✓ É este!
        </v-btn>
      </template>
      <template v-else-if="isInteractive && state === 'waiting'">
        <v-btn color="primary" size="small" class="text-none" @click="emit('confirm')">
          ✓ É este!
        </v-btn>
        <v-btn variant="tonal" size="small" class="text-none" @click="emit('discard')">
          ✕ Não é meu
        </v-btn>
      </template>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.suggestion-card__placeholder {
  height: 190px;
}

.suggestion-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}

.suggestion-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}

.suggestion-card--discarded {
  opacity: 0.55;
}
</style>
