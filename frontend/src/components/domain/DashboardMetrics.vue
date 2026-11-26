<script setup lang="ts">
import StatCard from '@/components/domain/StatCard.vue'
import { METRIC_DEFINITIONS, type MetricKey, type MetricState } from '@/types/adminDashboard'

defineProps<{
  metrics: Record<MetricKey, MetricState>
}>()

function formatStatValue(state: MetricState): string | number {
  if (state.loading) return '...'
  if (state.error !== null || state.value === null) return '—'
  return state.value
}
</script>

<template>
  <v-row class="mb-6">
    <v-col
      v-for="def in METRIC_DEFINITIONS"
      :key="def.key"
      cols="12"
      sm="6"
      lg="3"
    >
      <div class="d-flex flex-column ga-2 h-100">
        <StatCard
          :label="def.label"
          :value="formatStatValue(metrics[def.key])"
          :icon="def.icon"
          :color="def.color"
        />
        <div class="d-flex justify-end px-1">
          <v-btn
            :to="def.to"
            size="small"
            variant="text"
            :color="def.color"
            append-icon="mdi-arrow-right"
          >
            {{ def.linkLabel }}
          </v-btn>
        </div>
      </div>
    </v-col>
  </v-row>
</template>
