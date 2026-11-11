<script setup lang="ts">
import type { LostReport, User } from '@/types'
import { formatDate } from '@/utils/format'
import StatusChip from './StatusChip.vue'

interface PossibleOwner extends LostReport {
  user?: Pick<User, 'name' | 'email'>
}

defineProps<{ owners: PossibleOwner[] }>()
const emit = defineEmits<{ closeReport: [report: PossibleOwner] }>()
</script>

<template>
  <v-table>
    <thead>
      <tr><th>Relato</th><th>Pessoa</th><th>E-mail</th><th>Data da perda</th><th>Status</th><th>Ação</th></tr>
    </thead>
    <tbody>
      <tr v-for="report in owners" :key="report.id">
        <td>{{ report.title }}</td>
        <td>{{ report.user?.name ?? '—' }}</td>
        <td>{{ report.user?.email ?? '—' }}</td>
        <td>{{ formatDate(report.lostDate) }}</td>
        <td><StatusChip :status="report.status" kind="lostReport" /></td>
        <td><v-btn size="small" variant="tonal" @click="emit('closeReport', report)">Encerrar perda</v-btn></td>
      </tr>
      <tr v-if="owners.length === 0"><td colspan="6" class="text-center text-medium-emphasis">Nenhum possível dono encontrado.</td></tr>
    </tbody>
  </v-table>
</template>
