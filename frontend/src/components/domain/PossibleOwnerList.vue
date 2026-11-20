<script setup lang="ts">
import type { LostReport } from '@/types'
import { formatDate } from '@/utils/format'
import StatusChip from './StatusChip.vue'


defineProps<{ owners: LostReport[] }>()
const emit = defineEmits<{ closeReport: [report: LostReport] }>()
</script>

<template>
  <v-table>
    <thead>
      <tr><th>Relato</th><th>Data da perda</th><th>Status</th><th>Ação</th></tr>
    </thead>
    <tbody>
      <tr v-for="report in owners" :key="report.id">
        <td>{{ report.description }}</td>
        <td>{{ formatDate(report.lossDate) }}</td>
        <td><StatusChip :status="report.status" kind="lostReport" /></td>
        <td><v-btn size="small" variant="tonal" @click="emit('closeReport', report)">Encerrar perda</v-btn></td>
      </tr>
      <tr v-if="owners.length === 0"><td colspan="4" class="text-center text-medium-emphasis">Nenhum possível dono encontrado.</td></tr>
    </tbody>
  </v-table>
</template>
