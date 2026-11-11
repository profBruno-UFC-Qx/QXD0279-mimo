<script setup lang="ts">
import { computed } from 'vue'
import { ITEM_STATUS_META, LOST_REPORT_STATUS_META } from '@/utils/status'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'
import type { ItemStatus, LostReportStatus } from '@/types'

const props = withDefaults(defineProps<{
  kind?: 'item' | 'lostReport'
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
}>(), { required: false })

const modelValue = defineModel<ItemStatus | LostReportStatus | null | undefined>()
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Status'}${props.required ? ' *' : ''}`)

const items = computed(() => {
  const meta = props.kind === 'lostReport' ? LOST_REPORT_STATUS_META : ITEM_STATUS_META
  return Object.entries(meta).map(([key, val]) => ({
    title: val.label,
    value: key,
  }))
})
</script>

<template>
  <v-select
    v-model="modelValue"
    :items="items"
    item-title="title"
    item-value="value"
    :label="fieldLabel"
    :rules="rules"
    :clearable="clearable ?? true"
    variant="outlined"
    density="comfortable"
  />
</template>
