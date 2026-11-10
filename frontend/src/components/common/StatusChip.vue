<!--
  Exibe chips coloridos com ícones para indicar o status de itens (disponível, elegível, etc.)
  ou de relatos de perdas (aberto, resolvido, cancelado) utilizando exclusivamente as cores do tema.
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  type?: 'item' | 'lost_report'
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'AVAILABLE':
      return { label: 'Disponível', color: 'success', icon: 'mdi-check-circle-outline' }
    case 'ELIGIBLE':
      return { label: 'Elegível p/ Destinação', color: 'warning', icon: 'mdi-clock-alert-outline' }
    case 'HANDED_OVER':
      return { label: 'Devolvido', color: 'info', icon: 'mdi-handshake-outline' }
    case 'SOLD':
      return { label: 'Vendido', color: 'secondary', icon: 'mdi-currency-usd' }
    case 'AUCTIONED':
      return { label: 'Leiloado', color: 'secondary', icon: 'mdi-gavel' }
    case 'DONATED':
      return { label: 'Doado', color: 'success', icon: 'mdi-gift-outline' }
    case 'DISCARDED':
      return { label: 'Descartado', color: 'error', icon: 'mdi-delete-outline' }
    case 'OPEN':
      return { label: 'Aberto', color: 'info', icon: 'mdi-alert-circle-outline' }
    case 'RESOLVED':
      return { label: 'Resolvido', color: 'success', icon: 'mdi-check-all' }
    case 'CANCELLED':
      return { label: 'Cancelado', color: 'error', icon: 'mdi-cancel' }
    default:
      return { label: props.status, color: 'surfaceMuted', icon: 'mdi-information-outline' }
  }
})
</script>

<template>
  <v-chip
    :color="statusConfig.color"
    :prepend-icon="statusConfig.icon"
    size="small"
    class="font-weight-medium px-3"
    variant="tonal"
  >
    {{ statusConfig.label }}
  </v-chip>
</template>
