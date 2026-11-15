<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="d-flex align-center justify-space-between flex-wrap ga-4 mb-6">
    <div>
      <h1 class="text-h5 text-sm-h4 font-weight-bold text-grey-darken-3 mb-1">{{ title }}</h1>
      <p v-if="subtitle" class="text-body-1 text-medium-emphasis mb-0">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="d-flex align-center ga-2 flex-wrap">
      <slot name="actions" />
    </div>
  </div>
</template>
