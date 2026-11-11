<script setup lang="ts">
import { onMounted } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'

defineProps<{
  label?: string
  rules?: any[]
  clearable?: boolean
  placeholder?: string
}>()

const modelValue = defineModel<number | null | undefined>()
const categoriesStore = useCategoriesStore()

onMounted(() => {
  categoriesStore.ensureLoaded()
})
</script>

<template>
  <v-select
    v-model="modelValue"
    :items="categoriesStore.items"
    item-title="name"
    item-value="id"
    :label="label ?? 'Categoria'"
    :rules="rules"
    :clearable="clearable ?? true"
    :placeholder="placeholder ?? 'Selecione a categoria'"
    :loading="categoriesStore.loading"
    variant="outlined"
    density="comfortable"
  />
</template>
