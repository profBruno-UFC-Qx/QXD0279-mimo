<!--Modal de confirmação reutilizável para ações críticas (ex.: exclusão, cancelamento),
gerenciado pela uiStore-->
<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '@/stores/uiStore'

const ui = useUiStore()
const confirming = ref(false)

async function handleConfirm() {
  if (confirming.value || !ui.confirmDialog.show) return
  confirming.value = true
  const expectedResolve = ui.confirmDialog.resolve
  let ok = true
  try {
    await ui.confirmDialog.onConfirm()
  } catch {
    ok = false
  } finally {
    confirming.value = false
    if (ui.confirmDialog.resolve === expectedResolve) {
      close(ok)
    }
  }
}

function close(confirmed: boolean) {
  if (confirming.value) return
  const resolve = ui.confirmDialog.resolve
  ui.confirmDialog.show = false
  ui.confirmDialog.open = false
  ui.confirmDialog.resolve = () => {}
  resolve(confirmed)
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
          :disabled="confirming"
          @click="close(false)"
        >
          {{ ui.confirmDialog.cancelText }}
        </v-btn>
        <v-btn
          :color="ui.confirmDialog.danger ? 'error' : 'primary'"
          class="text-none px-4 ml-2"
          :loading="confirming"
          :disabled="confirming"
          @click="handleConfirm"
        >
          {{ ui.confirmDialog.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
