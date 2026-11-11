<script setup lang="ts">
import type { Item } from '@/types'
import StatusChip from './StatusChip.vue'

withDefaults(defineProps<{
  item: Item
  score?: number
  state: 'waiting' | 'confirmed' | 'discarded'
}>(), { score: undefined })

const emit = defineEmits<{ confirm: []; discard: [] }>()
</script>

<template>
  <v-card class="suggestion-card" :class="{ 'suggestion-card--discarded': state === 'discarded' }">
    <div class="d-flex flex-column flex-sm-row">
      <v-img
        v-if="item.photos?.[0]?.url || item.photos?.[0]?.photoUrl"
        :src="item.photos?.[0]?.url ?? item.photos?.[0]?.photoUrl"
        :alt="`Foto de ${item.title}`"
        width="150"
        max-width="150"
        height="150"
        cover
      />
      <div v-else class="d-flex align-center justify-center bg-surface-muted" style="width: 150px; height: 150px">
        <v-icon icon="mdi-image" size="40" color="outline" />
      </div>
      <div class="pa-4 flex-grow-1">
        <div class="d-flex flex-wrap ga-2 mb-2">
          <StatusChip :status="item.status" kind="item" />
          <v-chip v-if="state === 'confirmed'" color="success" size="small" variant="tonal">CONFIRMADO</v-chip>
          <v-chip v-else-if="state === 'discarded'" color="outline" size="small" variant="tonal">DESCARTADA</v-chip>
        </div>
        <h3 class="text-h6 mb-1">{{ item.title }}</h3>
        <p class="text-body-2 text-medium-emphasis">
          {{ item.category?.name ?? 'Categoria não informada' }} · {{ item.building?.name ?? 'Prédio não informado' }}
        </p>
        <p v-if="score !== undefined" class="text-body-2">Compatibilidade: {{ score }}%</p>
        <v-alert v-if="state === 'confirmed'" type="info" variant="tonal" density="compact" class="mt-3">
          Leve um documento ao balcão do prédio.
        </v-alert>
        <div v-if="state === 'waiting'" class="d-flex flex-wrap ga-2 mt-3">
          <v-btn color="primary" @click="emit('confirm')">✓ É este!</v-btn>
          <v-btn variant="tonal" @click="emit('discard')">✕ Não é meu</v-btn>
        </div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.suggestion-card--discarded { opacity: 0.55; }
</style>
