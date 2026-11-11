<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

const props = withDefaults(defineProps<{
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
  placeholder?: string
}>(), { required: false })

const modelValue = defineModel<number | null | undefined>()
const buildingsStore = useBuildingsStore()
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Prédio'}${props.required ? ' *' : ''}`)

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
    :label="fieldLabel"
    :rules="rules"
    :clearable="clearable ?? true"
    :placeholder="placeholder ?? 'Selecione o prédio'"
    :loading="buildingsStore.loading"
    variant="outlined"
    density="comfortable"
  />
</template>
