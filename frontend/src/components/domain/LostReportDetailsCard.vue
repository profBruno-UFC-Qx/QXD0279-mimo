<script setup lang="ts">
import type { LostReport } from '@/types'
import { formatDate, formatDateTime } from '@/utils/format'
import StatusChip from '@/components/domain/StatusChip.vue'

defineProps<{
  report: LostReport
  categoryLabel: string
  buildingLabel: string
}>()
</script>

<template>
  <v-card class="pa-6 rounded-lg border" variant="flat">
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-5">
      <span class="text-subtitle-2 text-medium-emphasis">Relato #{{ report.id }}</span>
      <StatusChip :status="report.status" kind="lostReport" />
    </div>

    <v-row>
      <v-col cols="12">
        <div class="text-caption text-medium-emphasis mb-1">Descrição</div>
        <p class="text-body-1 detail-description">{{ report.description }}</p>
      </v-col>

      <v-col cols="12" sm="6">
        <div class="text-caption text-medium-emphasis mb-1">Categoria</div>
        <div class="text-body-1 font-weight-medium">{{ categoryLabel }}</div>
      </v-col>

      <v-col cols="12" sm="6">
        <div class="text-caption text-medium-emphasis mb-1">Prédio provável</div>
        <div class="text-body-1 font-weight-medium">{{ buildingLabel }}</div>
      </v-col>

      <v-col cols="12" sm="6">
        <div class="text-caption text-medium-emphasis mb-1">Data da perda</div>
        <div class="text-body-1">{{ formatDate(report.lossDate) }}</div>
      </v-col>

      <v-col cols="12" sm="6">
        <div class="text-caption text-medium-emphasis mb-1">Registrado em</div>
        <div class="text-body-1">{{ formatDateTime(report.createdAt) }}</div>
      </v-col>

      <v-col v-if="report.confirmedItemId !== null" cols="12">
        <v-alert
          type="success"
          variant="tonal"
          border="start"
          class="rounded-lg"
        >
          <div class="text-caption font-weight-medium mb-1">Confirmação</div>
          <div class="text-body-1 font-weight-medium">
            Item confirmado: #{{ report.confirmedItemId }}
          </div>
          <div class="text-body-2 mt-1">
            Você confirmou um item encontrado para esta perda.
          </div>
          <div class="text-body-2">
            Aguarde as próximas orientações da instituição.
          </div>
        </v-alert>
      </v-col>
    </v-row>
  </v-card>
</template>

<style scoped>
.detail-description {
  white-space: pre-line;
  word-break: break-word;
}
</style>
