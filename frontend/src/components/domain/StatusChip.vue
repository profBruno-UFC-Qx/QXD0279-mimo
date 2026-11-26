<script setup lang="ts">
import { computed } from 'vue'
import { ITEM_STATUS_META, LOST_REPORT_STATUS_META } from '@/utils/status'
import AppPill from '@/components/common/AppPill.vue'

const props = defineProps<{
  status: string
  kind: 'item' | 'lostReport'
}>()

const metadata = computed(() => {
  const map: Record<string, { label: string; color: string }> =
    props.kind === 'item' ? ITEM_STATUS_META : LOST_REPORT_STATUS_META
  return map[props.status] ?? { label: props.status, color: 'on-surface' }
})
</script>

<template>
  <AppPill :color="metadata.color">
    {{ metadata.label }}
  </AppPill>
</template>
