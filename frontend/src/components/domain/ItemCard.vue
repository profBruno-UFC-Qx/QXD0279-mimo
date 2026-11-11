<script setup lang="ts">
import type { Item, PublicCatalogItem } from '@/types'
import { formatDate } from '@/utils/format'
import StatusChip from './StatusChip.vue'

defineProps<{ item: Item | PublicCatalogItem }>()
</script>

<template>
  <v-card :to="`/itens/${item.id}`" link class="h-100 d-flex flex-column">
    <v-img
      v-if="item.photos?.[0]?.url || item.photos?.[0]?.photoUrl"
      :src="item.photos?.[0]?.url ?? item.photos?.[0]?.photoUrl"
      :alt="`Foto de ${item.title}`"
      height="190"
      cover
    />
    <div v-else class="d-flex align-center justify-center bg-surface-muted" style="height: 190px">
      <v-icon icon="mdi-image" size="48" color="outline" aria-label="Sem foto" />
    </div>
    <v-card-text class="d-flex flex-column flex-grow-1">
      <div class="d-flex flex-wrap ga-2 mb-3">
        <v-chip
          v-if="item.category?.name"
          size="small"
          variant="outlined"
          color="grey-darken-1"
          rounded="sm"
        >
          {{ item.category.name }}
        </v-chip>
        <StatusChip :status="item.status" kind="item" />
      </div>
      <h2 class="text-subtitle-1 font-weight-bold item-title mb-2">{{ item.title }}</h2>
      <div class="mt-auto text-body-2 text-medium-emphasis">
        <div class="d-flex align-center ga-2 mb-1">
          <v-icon icon="mdi-map-marker-outline" size="small" />
          <span>{{ item.building?.name ?? 'Prédio não informado' }}</span>
        </div>
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-calendar-outline" size="small" />
          <span>Encontrado em {{ formatDate(item.foundDate) }}</span>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.item-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}
</style>
