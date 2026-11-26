<script setup lang="ts">
import type { StatusColorToken } from '@/theme/colors'

defineProps<{
  label: string
  value: string | number
  icon: string
  color: StatusColorToken
}>()
</script>

<template>
  <v-card class="h-100">
    <v-card-text class="d-flex align-center justify-space-between ga-4">
      <div>
        <p class="text-body-2 text-medium-emphasis">{{ label }}</p>
        <p class="text-h4 font-weight-bold">{{ value }}</p>
      </div>
      <v-avatar :color="color" variant="tonal" size="52">
        <v-icon :icon="icon" size="26" />
      </v-avatar>
    </v-card-text>
  </v-card>
</template>
