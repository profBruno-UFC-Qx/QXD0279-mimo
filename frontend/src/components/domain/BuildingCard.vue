<script setup lang="ts">
import type { Building } from '@/types'

defineProps<{ building: Building }>()
</script>

<template>
  <v-card class="h-100">
    <v-card-title class="text-h6 font-weight-bold pb-2">
      {{ building.name }}
    </v-card-title>
    <v-card-text>
      <p>{{ building.address }}</p>
      <v-divider class="my-4" />
      <p class="mb-2"><strong>Retirada:</strong> {{ building.pickupPoint }}</p>
      <p><strong>Atendimento:</strong> {{ building.serviceHours }}</p>
    </v-card-text>
  </v-card>
</template>
