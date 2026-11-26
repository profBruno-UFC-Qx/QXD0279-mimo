<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
import type { DispositionRule } from '@/types'
import { type ActiveFilter } from '@/types/adminFilters'

defineProps<{
  rules: DispositionRule[]
}>()

const activeFilter = defineModel<ActiveFilter>('activeFilter', { required: true })
</script>

<template>
  <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
    <v-btn-toggle
      v-model="activeFilter"
      mandatory
      color="primary"
      variant="outlined"
      density="comfortable"
      divided
      class="flex-wrap"
    >
      <v-btn value="all" class="text-none">Todas</v-btn>
      <v-btn value="active" class="text-none">Ativas</v-btn>
      <v-btn value="inactive" class="text-none">Inativas</v-btn>
    </v-btn-toggle>
    <AppPill color="primary">
      {{ rules.length }} {{ rules.length === 1 ? 'regra' : 'regras' }}
    </AppPill>
  </div>
</template>
