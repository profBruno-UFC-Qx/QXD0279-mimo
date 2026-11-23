<script setup lang="ts">
defineProps<{ action?: string; actionDisabled?: boolean }>()
defineEmits<{ action: [] }>()
</script>

<template>
  <v-alert type="warning" variant="tonal" class="mb-4 rounded-lg">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span><slot /></span>
      <v-btn v-if="action" size="small" variant="outlined" color="warning" class="text-none"
        :disabled="actionDisabled" @click="$emit('action')"
      >
        {{ action }}
      </v-btn>
    </div>
  </v-alert>
</template>
