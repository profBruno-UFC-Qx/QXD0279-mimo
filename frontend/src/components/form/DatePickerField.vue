<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatDate } from '@/utils/format'
import { isValidCalendarDate } from '@/utils/lostReport'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

const props = withDefaults(defineProps<{
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
  disabled?: boolean
  minDate?: string
  maxDate?: string
  density?: 'default' | 'comfortable' | 'compact'
  hideDetails?: boolean | 'auto'
}>(), { required: false, clearable: true, disabled: false })

const modelValue = defineModel<string | null | undefined>()
const menu = ref(false)
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Data'}${props.required ? ' *' : ''}`)

const formattedDate = computed(() => {
  if (!modelValue.value) return ''
  return formatDate(modelValue.value)
})

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function onDateChange(value: string | Date | null) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      modelValue.value = formatLocalDate(value)
    }
  } else if (typeof value === 'string') {
    if (isValidCalendarDate(value)) {
      modelValue.value = value
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
    :disabled="props.disabled"
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
        :disabled="props.disabled"
        readonly
        prepend-inner-icon="mdi-calendar"
        variant="outlined"
        :density="props.density ?? 'comfortable'"
        :hide-details="props.hideDetails ?? false"
        @click:clear="modelValue = null"
      />
    </template>
    <v-date-picker
      :model-value="modelValue"
      :min="props.minDate"
      :max="props.maxDate"
      @update:model-value="onDateChange"
      color="primary"
    />
  </v-menu>
</template>
