<!--
  Caixa de alerta padronizada para exibir mensagens de erro em formulários e telas com opção de retry.
-->
<script setup lang="ts">
defineProps<{
  error?: string | null
  title?: string
}>()

defineEmits<{
  (e: 'retry'): void
}>()
</script>

<template>
  <v-alert
    v-if="error"
    type="error"
    variant="tonal"
    class="my-4 rounded-lg"
    :title="title || 'Ocorreu um erro'"
  >
    <div class="d-flex align-center justify-space-between flex-wrap">
      <span>{{ error }}</span>
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
