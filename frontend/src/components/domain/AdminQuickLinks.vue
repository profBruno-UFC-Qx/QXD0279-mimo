<script setup lang="ts">
defineProps<{
  isAnyMetricLoading: boolean
}>()
</script>

<template>
  <v-col cols="12" lg="4">
    <v-card variant="outlined" class="pa-5 h-100">
      <h2 class="text-h6 font-weight-bold mb-2">Atalhos operacionais</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Acesse diretamente os módulos relacionados aos indicadores exibidos acima.
      </p>
      <div class="d-flex flex-column ga-2">
        <v-btn
          to="/admin/perdas"
          variant="tonal"
          color="warning"
          prepend-icon="mdi-alert-box"
          class="justify-start"
        >
          Gerenciar relatos de perdas
        </v-btn>
        <v-btn
          to="/admin/itens"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-package-variant-closed"
          class="justify-start"
        >
          Gerenciar itens em custódia
        </v-btn>
      </div>
      <div v-if="isAnyMetricLoading" class="text-caption text-medium-emphasis mt-4">
        Atualizando indicadores...
      </div>
    </v-card>
  </v-col>
</template>
