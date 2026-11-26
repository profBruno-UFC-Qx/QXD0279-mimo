<!--Exibe um indicador circular de carregamento centralizado enquanto dados assíncronos são processados-->
<script setup lang="ts">
defineProps<{
  loading?: boolean
  text?: string
}>()
</script>

<template>
  <div class="loading-overlay-container">
    <slot />
    <div v-if="loading" class="loading-overlay d-flex flex-column align-center justify-center">
      <v-progress-circular indeterminate color="primary" size="48" width="4" />
      <span v-if="text" class="text-body-2 text-medium-emphasis mt-4">{{ text }}</span>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay-container {
  position: relative;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  min-height: 120px;
  background: rgba(var(--v-theme-surface), 0.78);
}
</style>
