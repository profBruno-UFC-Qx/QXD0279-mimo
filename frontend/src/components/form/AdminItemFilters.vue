<script setup lang="ts">
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import { ITEM_STATUS_META } from '@/utils/status'
import type { ItemStatus } from '@/types'

const search = defineModel<string>('search', { required: true })
const categoryId = defineModel<number | null>('categoryId', { required: true })
const buildingId = defineModel<number | null>('buildingId', { required: true })
const status = defineModel<ItemStatus | null>('status', { required: true })

const statusOptions: Array<{ title: string; value: ItemStatus | null }> = [
  { title: 'Todos', value: null },
  ...(Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((status) => ({
    title: ITEM_STATUS_META[status].label,
    value: status,
  })),
]
</script>

<template>
  <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
    <v-row density="compact" align="center">
      <v-col cols="12" md="4">
        <v-text-field
          v-model="search"
          label="Buscar por título ou descrição"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <CategorySelect
          v-model="categoryId"
          label="Categoria"
          placeholder="Todas"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <BuildingSelect
          v-model="buildingId"
          label="Prédio"
          placeholder="Todos"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-select
          v-model="status"
          :items="statusOptions"
          item-title="title"
          item-value="value"
          label="Status"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
    </v-row>
  </v-card>
</template>
