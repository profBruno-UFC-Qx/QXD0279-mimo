<!--Exibe um indicador circular de carregamento centralizado enquanto dados assíncronos são processados-->
<script setup lang="ts">
defineProps<{
  loading?: boolean
  text?: string
}>()
</script>

<template>
  <div v-if="loading" class="d-flex flex-column align-center justify-center py-12">
    <v-progress-circular indeterminate color="primary" size="48" width="4" />
    <span v-if="text" class="text-body-2 text-medium-emphasis mt-4">{{ text }}</span>
  </div>
  <slot v-else />
</template>
