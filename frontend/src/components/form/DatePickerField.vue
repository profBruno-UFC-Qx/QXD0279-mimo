<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatDate } from '@/utils/format'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

const props = withDefaults(defineProps<{
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
  minDate?: string
}>(), { required: false, clearable: true })

const modelValue = defineModel<string | null | undefined>()
const menu = ref(false)
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Data'}${props.required ? ' *' : ''}`)

const formattedDate = computed(() => {
  if (!modelValue.value) return ''
  return formatDate(modelValue.value)
})

function onDateChange(value: string | Date | null) {
  if (value) {
    const d = value instanceof Date ? value : new Date(value)
    if (!isNaN(d.getTime())) {
      modelValue.value = d.toISOString().split('T')[0]
    }
  } else {
    modelValue.value = null
  }
  menu.value = false
}
</script>

<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    transition="scale-transition"
    offset-y
    min-width="auto"
  >
    <template v-slot:activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="formattedDate"
        :label="fieldLabel"
        :rules="rules"
        :clearable="props.clearable"
        readonly
        prepend-inner-icon="mdi-calendar"
        variant="outlined"
        density="comfortable"
        @click:clear="modelValue = null"
      />
    </template>
    <v-date-picker
      :model-value="modelValue"
      :min="props.minDate"
      @update:model-value="onDateChange"
      color="primary"
    />
  </v-menu>
</template>
