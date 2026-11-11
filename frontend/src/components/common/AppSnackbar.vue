<!--
  Exibe notificações globais de feedback (sucesso, erro, aviso) no rodapé da aplicação,
  controlado centralmente pela uiStore.
-->
<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore'

const ui = useUiStore()
</script>

<template>
  <v-snackbar
    v-model="ui.snackbar.show"
    :color="ui.snackbar.color"
    :timeout="ui.snackbar.timeout"
    elevation="2"
  >
    <span class="text-on-primary">{{ ui.snackbar.message }}</span>
    <template v-slot:actions>
      <v-btn
        variant="text"
        color="on-primary"
        class="text-none"
        @click="ui.snackbar.show = false"
      >
        Fechar
      </v-btn>
    </template>
  </v-snackbar>
</template>
