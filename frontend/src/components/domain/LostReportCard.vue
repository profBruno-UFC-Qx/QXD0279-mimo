<script setup lang="ts">
import type { LostReport } from '@/types'
import { formatDate } from '@/utils/format'
import StatusChip from './StatusChip.vue'

defineProps<{ lostReport: LostReport }>()
</script>

<template>
  <v-card class="h-100">
    <v-card-title class="text-wrap">{{ lostReport.title }}</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap ga-2 mb-3">
        <v-chip
          v-if="lostReport.category?.name"
          size="small"
          variant="outlined"
          color="grey-darken-1"
          rounded="sm"
        >
          {{ lostReport.category.name }}
        </v-chip>
        <StatusChip :status="lostReport.status" kind="lostReport" />
      </div>
      <p class="text-body-2 mb-2">Prédio provável: {{ lostReport.building?.name ?? 'Qualquer prédio' }}</p>
      <p class="text-body-2 text-medium-emphasis">Perdido em {{ formatDate(lostReport.lostDate) }}</p>
    </v-card-text>
    <v-card-actions v-if="$slots.actions"><slot name="actions" /></v-card-actions>
  </v-card>
</template>
