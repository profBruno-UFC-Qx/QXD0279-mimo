<script setup lang="ts">
defineProps<{ actionLabel?: string }>()
defineEmits<{ reset: [] }>()
</script>

<template>
  <v-alert type="info" variant="tonal" class="mb-4 rounded-lg">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span><slot /></span>
      <v-btn size="small" variant="text" color="primary" class="text-none" @click="$emit('reset')">
        {{ actionLabel ?? 'Ir para a página 1' }}
      </v-btn>
    </div>
  </v-alert>
</template>
