<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-2">Detalhes da Perda #{{ route.params.id }}</h1>
    <v-card class="pa-6 rounded-lg text-center" variant="flat">
      <v-icon icon="mdi-eye-outline" size="48" color="primary" class="mb-2" />
      <div class="text-subtitle-1 font-weight-medium">Em construção</div>
    </v-card>
  </div>
</template>
