<script setup lang="ts">
defineEmits<{ refresh: [] }>()
</script>

<template>
  <v-btn
    variant="outlined"
    color="primary"
    class="text-none"
    prepend-icon="mdi-refresh"
    @click="$emit('refresh')"
  >
    <slot>Atualizar</slot>
  </v-btn>
</template>
