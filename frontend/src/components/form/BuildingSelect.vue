<script setup lang="ts">
import { onMounted } from 'vue'
import { useBuildingsStore } from '@/stores/buildingsStore'

defineProps<{
  label?: string
  rules?: any[]
  clearable?: boolean
  placeholder?: string
}>()

const modelValue = defineModel<number | null | undefined>()
const buildingsStore = useBuildingsStore()

onMounted(() => {
  buildingsStore.ensureLoaded()
})
</script>

<template>
  <v-select
    v-model="modelValue"
    :items="buildingsStore.items"
    item-title="name"
    item-value="id"
    :label="label ?? 'Prédio'"
    :rules="rules"
    :clearable="clearable ?? true"
    :placeholder="placeholder ?? 'Selecione o prédio'"
    :loading="buildingsStore.loading"
    variant="outlined"
    density="comfortable"
  />
</template>
