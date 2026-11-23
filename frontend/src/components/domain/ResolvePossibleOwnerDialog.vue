<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { formatDate } from '@/utils/format'
import type { LostReport } from '@/types'

defineProps<{
  selectedReport: LostReport | null
  reportLoading: boolean
  reportError: string | null
  categoryLabel: (id: number) => string
  buildingLabel: (id: number | null) => string
  reportChecking: boolean
  resolvingReport: boolean
}>()

defineEmits<{
  'close-report-dialog': []
  'confirm-resolve-report': []
  'retry-report-load': []
}>()

const reportDialogOpen = defineModel<boolean>('reportDialogOpen', { required: true })
</script>

<template>
  <AdminDialog v-model="reportDialogOpen" max-width="560" persistent>
    <template #title>
      Relato de perda {{ selectedReport ? `#${selectedReport.id}` : '' }}
    </template>

    <LoadingOverlay :loading="reportLoading" text="Consultando relato...">
      <v-alert v-if="reportError" type="error" variant="tonal" class="rounded-lg">
        {{ reportError }}
      </v-alert>

      <template v-else-if="selectedReport">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
          <span class="text-body-2 text-medium-emphasis">
            Possível correspondência; propriedade não comprovada.
          </span>
          <StatusChip :status="selectedReport.status" type="lost_report" />
        </div>

        <div class="d-flex flex-column ga-2 text-body-1">
          <div><strong>Descrição:</strong> {{ selectedReport.description }}</div>
          <div><strong>Categoria:</strong> {{ categoryLabel(selectedReport.categoryId) }}</div>
          <div><strong>Prédio:</strong> {{ buildingLabel(selectedReport.buildingId) }}</div>
          <div><strong>Data da perda:</strong> {{ formatDate(selectedReport.lossDate) }}</div>
        </div>

        <v-alert
          v-if="selectedReport.status === 'OPEN'"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4 rounded-lg"
        >
          Encerrar o relato notifica o autor e marca a perda como resolvida, mas não
          registra a entrega do item nem confirma a propriedade.
        </v-alert>
        <v-alert
          v-else
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-4 rounded-lg"
        >
          Este relato não está mais aberto.
        </v-alert>

        <div v-if="reportChecking" class="text-body-2 text-medium-emphasis mt-3">
          Consultando o estado atual do relato...
        </div>
      </template>
    </LoadingOverlay>

    <template #actions>
      <v-btn
        v-if="reportError && selectedReport"
        variant="outlined"
        color="primary"
        class="text-none"
        :disabled="reportLoading"
        @click="$emit('retry-report-load')"
      >
        Consultar novamente
      </v-btn>
      <v-spacer />
      <v-btn
        variant="text"
        class="text-none"
        :disabled="resolvingReport || reportChecking"
        @click="$emit('close-report-dialog')"
      >
        Fechar
      </v-btn>
      <v-btn
        v-if="selectedReport?.status === 'OPEN' && !reportError"
        color="primary"
        class="text-none"
        :loading="resolvingReport"
        :disabled="reportLoading || reportChecking"
        @click="$emit('confirm-resolve-report')"
      >
        Encerrar relato
      </v-btn>
    </template>
  </AdminDialog>
</template>
