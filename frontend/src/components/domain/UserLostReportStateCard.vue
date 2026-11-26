<script setup lang="ts">
defineProps<{
  icon: string
  iconColor: string
  title: string
  description: string
}>()
</script>

<template>
  <v-card class="pa-6 rounded-lg border text-center" variant="flat">
    <v-icon :icon="icon" size="48" :color="iconColor" class="mb-3" />
    <h2 class="text-h6 font-weight-medium mb-2">{{ title }}</h2>
    <p class="text-body-2 text-medium-emphasis mb-4">
      {{ description }}
    </p>
    <v-btn color="primary" class="text-none" :to="{ name: 'my-lost-reports' }">
      Voltar para Minhas perdas
    </v-btn>
  </v-card>
</template>
