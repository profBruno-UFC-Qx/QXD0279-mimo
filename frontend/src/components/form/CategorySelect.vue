<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

const props = withDefaults(defineProps<{
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
  placeholder?: string
}>(), { required: false })

const modelValue = defineModel<number | null | undefined>()
const categoriesStore = useCategoriesStore()
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Categoria'}${props.required ? ' *' : ''}`)

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
    :label="fieldLabel"
    :rules="rules"
    :clearable="clearable ?? true"
    :placeholder="placeholder ?? 'Selecione a categoria'"
    :loading="categoriesStore.loading"
    variant="outlined"
    density="comfortable"
  />
</template>
