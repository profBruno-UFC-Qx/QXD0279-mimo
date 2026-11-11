<script setup lang="ts">
import { computed } from 'vue'
import { ITEM_STATUS_META, LOST_REPORT_STATUS_META } from '@/utils/status'

const props = defineProps<{
  kind?: 'item' | 'lostReport'
  label?: string
  rules?: any[]
  clearable?: boolean
}>()

const modelValue = defineModel<string | null | undefined>()

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
    :label="label ?? 'Status'"
    :rules="rules"
    :clearable="clearable ?? true"
    variant="outlined"
    density="comfortable"
  />
</template>
