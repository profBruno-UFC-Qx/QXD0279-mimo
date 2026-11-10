<!--
  Modal de confirmação reutilizável para ações críticas (ex.: exclusão, cancelamento),
  gerenciado pela uiStore.
-->
<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

async function handleConfirm() {
  try {
    await ui.confirmDialog.onConfirm()
  } finally {
    ui.confirmDialog.show = false
  }
}
</script>

<template>
  <v-dialog v-model="ui.confirmDialog.show" max-width="420" persistent>
    <v-card class="rounded-lg elevation-4 pa-2">
      <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
        {{ ui.confirmDialog.title }}
      </v-card-title>
      <v-card-text class="text-body-1 text-medium-emphasis px-4 py-3">
        {{ ui.confirmDialog.message }}
      </v-card-text>
      <v-card-actions class="px-4 pb-4 pt-2">
        <v-spacer />
        <v-btn
          variant="outlined"
          color="outline"
          class="text-none px-4 text-primary"
          @click="ui.confirmDialog.show = false"
        >
          {{ ui.confirmDialog.cancelText }}
        </v-btn>
        <v-btn
          color="primary"
          class="text-none px-4 ml-2"
          @click="handleConfirm"
        >
          {{ ui.confirmDialog.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
