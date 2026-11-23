<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { formatDate, formatDateTime } from '@/utils/format'
import type { LostReport } from '@/types'

defineProps<{
  selectedReportId: number | null
  detailReport: LostReport | null
  loadingDetail: boolean
  detailNotFound: boolean
  detailError: string | null
  formatCategoryLabel: (id: number) => string
  formatBuildingLabel: (id: number | null) => string
}>()

defineEmits<{
  'close-details': []
  'retry-detail': []
}>()

const detailDialogOpen = defineModel<boolean>('detailDialogOpen', { required: true })
</script>

<template>
  <AdminDialog
    v-model="detailDialogOpen"
    max-width="640"
    persistent
    title-class="d-flex align-center justify-space-between"
    actions-class="ga-2"
  >
    <template #title>
      <span class="text-h6 font-weight-bold text-primary">
        Detalhes do relato {{ selectedReportId ? `#${selectedReportId}` : '' }}
      </span>
      <StatusChip v-if="detailReport" :status="detailReport.status" type="lost_report" />
    </template>

    <LoadingOverlay :loading="loadingDetail" text="Carregando detalhes...">
      <div v-if="detailNotFound" class="py-4">
        <v-alert type="warning" variant="tonal" class="rounded-lg">
          Relato de perda não encontrado.
        </v-alert>
      </div>

      <ErrorAlert
        v-else-if="detailError"
        :error="detailError"
        @retry="$emit('retry-detail')"
      />

      <div v-else-if="detailReport" class="d-flex flex-column ga-2 text-body-1">
        <div><strong>ID:</strong> #{{ detailReport.id }}</div>
        <div><strong>Autor:</strong> Usuário #{{ detailReport.userId }}</div>
        <div><strong>Categoria:</strong> {{ formatCategoryLabel(detailReport.categoryId) }}</div>
        <div><strong>Prédio:</strong> {{ formatBuildingLabel(detailReport.buildingId) }}</div>
        <div><strong>Data da perda:</strong> {{ formatDate(detailReport.lossDate) }}</div>
        <div><strong>Registrado em:</strong> {{ formatDateTime(detailReport.createdAt) }}</div>
        <div>
          <strong>Item confirmado:</strong>
          {{
            detailReport.confirmedItemId !== null
              ? `Item confirmado #${detailReport.confirmedItemId}`
              : 'Nenhum item confirmado'
          }}
        </div>
        <v-divider class="my-2" />
        <div>
          <div class="text-subtitle-2 text-medium-emphasis mb-1">Descrição</div>
          <p class="mb-0">{{ detailReport.description }}</p>
        </div>
      </div>
    </LoadingOverlay>

    <template #actions>
      <v-spacer />
      <v-btn
        variant="outlined"
        color="primary"
        class="text-none"
        @click="$emit('close-details')"
      >
        Fechar
      </v-btn>
    </template>
  </AdminDialog>
</template>
