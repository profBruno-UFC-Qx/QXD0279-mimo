<script setup lang="ts">
import { computed } from 'vue'
import type { PublicCatalogItem, PublicSuggestedItem } from '@/types'
import { formatDate } from '@/utils/format'
import { getSafePrimaryPhotoUrl } from '@/utils/suggestions'
import StatusChip from './StatusChip.vue'

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
    class="suggestion-card h-100 rounded-lg border"
    :class="{ 'suggestion-card--discarded': isInteractive && state === 'discarded' }"
    variant="flat"
  >
    <div class="d-flex flex-column flex-sm-row h-100">
      <div class="suggestion-card__media flex-shrink-0">
        <v-img
          v-if="primaryPhotoUrl"
          :src="primaryPhotoUrl"
          :alt="`Foto de ${item.title}`"
          eager
          width="100%"
          height="100%"
          cover
        />
        <div
          v-else
          class="d-flex flex-column align-center justify-center bg-surface-muted h-100 pa-3 text-center"
          role="img"
          :aria-label="`Sem foto de ${item.title}`"
        >
          <v-icon icon="mdi-image-outline" size="40" color="outline" />
          <span class="text-caption text-medium-emphasis mt-1">Sem foto</span>
        </div>
      </div>

      <div class="pa-4 d-flex flex-column flex-grow-1">
        <div class="d-flex flex-wrap ga-2 mb-2">
          <StatusChip :status="item.status" kind="item" />
          <v-chip v-if="isInteractive && state === 'confirmed'" color="success" size="small" variant="tonal">
            CONFIRMADO
          </v-chip>
          <v-chip v-else-if="isInteractive && state === 'discarded'" color="outline" size="small" variant="tonal">
            DESCARTADA
          </v-chip>
        </div>

        <h3 class="text-subtitle-1 font-weight-bold mb-1">{{ item.title }}</h3>

        <p v-if="descriptionText" class="text-body-2 text-medium-emphasis mb-2">
          {{ descriptionText }}
        </p>

        <div class="text-body-2 text-medium-emphasis d-flex flex-column ga-1 mb-3">
          <div>Categoria: {{ item.category?.name ?? 'Categoria não informada' }}</div>
          <div>Prédio: {{ item.building?.name ?? 'Prédio não informado' }}</div>
          <div>Local: {{ foundLocationText }}</div>
          <div>Encontrado em: {{ formatDate(item.foundDate) }}</div>
        </div>

        <p v-if="isInteractive && score !== undefined" class="text-body-2 mb-2">
          Compatibilidade: {{ score }}%
        </p>

        <v-alert
          v-if="isInteractive && state === 'confirmed'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          Leve um documento ao balcão do prédio.
        </v-alert>

        <div class="d-flex flex-wrap ga-2 mt-auto">
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
        </div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.suggestion-card__media {
  width: 100%;
  height: 180px;
}

@media (min-width: 600px) {
  .suggestion-card__media {
    width: 160px;
    height: auto;
    min-height: 180px;
  }
}

.suggestion-card--discarded {
  opacity: 0.55;
}
</style>
