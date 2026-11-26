<script setup lang="ts">
import type { Building } from '@/types'

defineProps<{ building: Building }>()
</script>

<template>
  <v-card variant="flat" class="h-100 rounded-lg border pa-1">
    <v-card-title class="text-h6 font-weight-bold text-primary pb-2 d-flex align-center ga-2">
      <v-icon icon="mdi-domain" size="22" color="primary" />
      <span>{{ building.name }}</span>
    </v-card-title>
    <v-card-text>
      <p class="d-flex align-start ga-2 text-body-2 text-medium-emphasis mb-0">
        <v-icon icon="mdi-map-marker-outline" size="18" class="mt-0.5 flex-shrink-0" />
        <span>{{ building.address }}</span>
      </p>
      <v-divider class="my-4" />
      <p class="d-flex align-center ga-2 text-body-2 mb-2">
        <v-icon icon="mdi-package-variant-closed" size="18" color="primary" />
        <span><strong>Retirada:</strong> {{ building.pickupPoint }}</span>
      </p>
      <p class="d-flex align-center ga-2 text-body-2 mb-0">
        <v-icon icon="mdi-clock-outline" size="18" color="primary" />
        <span><strong>Atendimento:</strong> {{ building.serviceHours }}</span>
      </p>
    </v-card-text>
  </v-card>
</template>
