<script setup lang="ts">
import type { LostReportStatus } from '@/types'
import { type LostReportFilters } from '@/types/adminFilters'

defineProps<{
  hasAdminAccess: boolean
  categoryOptions: Array<{ title: string; value: number | null }>
  buildingOptions: Array<{ title: string; value: number | null }>
}>()

defineEmits<{
  'apply-filters': []
  'clear-filters': []
}>()

const draftFilters = defineModel<LostReportFilters>('draftFilters', { required: true })

const STATUS_FILTER_ITEMS: Array<{ title: string; value: LostReportStatus | null }> = [
  { title: 'Todos', value: null },
  { title: 'Aberto', value: 'OPEN' },
  { title: 'Resolvido', value: 'RESOLVED' },
  { title: 'Cancelado', value: 'CANCELLED' },
]
</script>

<template>
  <v-card v-if="hasAdminAccess" class="mb-6 pa-4 rounded-lg" variant="outlined">
    <v-row density="compact" align="center">
      <v-col cols="12" md="4">
        <v-select
          :model-value="draftFilters.status"
          @update:model-value="draftFilters = { ...draftFilters, status: $event }"
          data-test="filter-status"
          :items="STATUS_FILTER_ITEMS"
          item-title="title"
          item-value="value"
          label="Status"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="4">
        <v-select
          :model-value="draftFilters.categoryId"
          @update:model-value="draftFilters = { ...draftFilters, categoryId: $event }"
          data-test="filter-category"
          :items="categoryOptions"
          item-title="title"
          item-value="value"
          label="Categoria"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="4">
        <v-select
          :model-value="draftFilters.buildingId"
          @update:model-value="draftFilters = { ...draftFilters, buildingId: $event }"
          data-test="filter-building"
          :items="buildingOptions"
          item-title="title"
          item-value="value"
          label="Prédio"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
    </v-row>
    <div class="d-flex justify-end flex-wrap ga-2 mt-4">
      <v-btn
        variant="text"
        class="text-none"
        :disabled="!hasAdminAccess"
        @click="$emit('clear-filters')"
      >
        Limpar filtros
      </v-btn>
      <v-btn
        color="primary"
        class="text-none"
        prepend-icon="mdi-filter-outline"
        :disabled="!hasAdminAccess"
        @click="$emit('apply-filters')"
      >
        Filtrar
      </v-btn>
    </div>
  </v-card>
</template>
