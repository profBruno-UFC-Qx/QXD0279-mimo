<!--Caixa de alerta padronizada para exibir mensagens de erro em formulários e telas com opção de retry-->
<script setup lang="ts">
defineProps<{ error?: string | null }>()

defineEmits<{
  (e: 'retry'): void
}>()
</script>

<template>
  <v-alert
    type="error"
    variant="tonal"
    class="my-4 rounded-lg"
    title="Não foi possível carregar os dados"
  >
    <div class="d-flex align-center justify-space-between flex-wrap">
      <span>{{ error || 'Ocorreu um erro inesperado.' }}</span>
      <v-btn
        size="small"
        variant="text"
        color="error"
        class="text-none ml-2"
        @click="$emit('retry')"
      >
        Tentar novamente
      </v-btn>
    </div>
  </v-alert>
</template>
