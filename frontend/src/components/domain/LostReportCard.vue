<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { LostReport } from '@/types'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { formatDate } from '@/utils/format'
import StatusChip from './StatusChip.vue'

const props = defineProps<{ lostReport: LostReport }>()

const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()

const categoryLabel = computed(() => {
  const name =
    props.lostReport.category?.name ??
    categoriesStore.items.find((category) => category.id === props.lostReport.categoryId)?.name
  return name ?? `Categoria #${props.lostReport.categoryId}`
})

const buildingLabel = computed(() => {
  if (props.lostReport.buildingId === null) return 'Qualquer prédio'
  const name =
    props.lostReport.building?.name ??
    buildingsStore.items.find((building) => building.id === props.lostReport.buildingId)?.name
  return name ?? `Prédio #${props.lostReport.buildingId}`
})

onMounted(() => {
  void categoriesStore.ensureLoaded()
  void buildingsStore.ensureLoaded()
})
</script>

<template>
  <v-card class="h-100 d-flex flex-column rounded-lg border" variant="flat">
    <v-card-text class="d-flex flex-column flex-grow-1 pa-5">
      <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-3">
        <v-chip size="small" variant="outlined" color="grey-darken-1" rounded="sm">
          {{ categoryLabel }}
        </v-chip>
        <StatusChip :status="lostReport.status" kind="lostReport" />
      </div>

      <p class="lost-report-description text-body-1 font-weight-medium mb-4">
        {{ lostReport.description }}
      </p>

      <div class="mt-auto d-flex flex-column ga-1 text-body-2 text-medium-emphasis">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-office-building-outline" size="16" />
          <span>{{ buildingLabel }}</span>
        </div>
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-calendar-outline" size="16" />
          <span>Perdido em {{ formatDate(lostReport.lossDate) }}</span>
        </div>
      </div>
    </v-card-text>
    <v-card-actions v-if="$slots.actions" class="px-5 pb-4 pt-0">
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.lost-report-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
</style>
