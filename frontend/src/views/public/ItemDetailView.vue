<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <v-container>
    <v-btn variant="text" to="/items" prepend-icon="mdi-arrow-left" class="mb-4">Voltar para itens</v-btn>
    <v-card class="pa-6 rounded-lg">
      <h1 class="text-h5 font-weight-bold mb-2">Detalhes do Item #{{ route.params.id }}</h1>
      <p class="text-body-2 text-medium-emphasis">Informações detalhadas sobre o objeto achado e local de retirada.</p>
    </v-card>
  </v-container>
</template>
