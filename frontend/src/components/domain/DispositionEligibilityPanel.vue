<script setup lang="ts">
import { formatDateTime } from '@/utils/format'
import { type LastJobResult } from '@/types/adminDashboard'

defineProps<{
  runningJob: boolean
  confirmingJob: boolean
  jobError: string | null
  jobUncertainError: string | null
  lastJobSummaryText: string
  lastJobResult: LastJobResult | null
}>()

defineEmits<{
  'handle-run-eligibility-job': []
  'load-metrics': []
}>()
</script>

<template>
  <v-col cols="12" lg="8">
    <v-card variant="outlined" class="pa-5">
      <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-4">
        <div>
          <h2 class="text-h6 font-weight-bold mb-1">Processamento de elegibilidade</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">
            Dispara manualmente a verificação dos itens disponíveis para marcar elegibilidade conforme as regras vigentes.
          </p>
        </div>
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-playlist-check"
          :loading="runningJob"
          :disabled="confirmingJob || runningJob"
          @click="$emit('handle-run-eligibility-job')"
        >
          Executar processamento
        </v-btn>
      </div>

      <v-alert
        v-if="jobError"
        data-test="job-error-alert"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ jobError }}
      </v-alert>

      <v-alert
        v-if="jobUncertainError"
        data-test="job-uncertain-alert"
        type="warning"
        variant="tonal"
        class="mb-4"
      >
        <div class="d-flex flex-column ga-2">
          <div>{{ jobUncertainError }}</div>
          <div>
            <v-btn
              size="small"
              variant="outlined"
              color="warning"
              prepend-icon="mdi-refresh"
              :disabled="runningJob"
              @click="$emit('load-metrics')"
            >
              Atualizar indicadores
            </v-btn>
          </div>
        </div>
      </v-alert>

      <v-sheet color="surfaceMuted" rounded="lg" class="pa-4 border">
        <div class="text-caption text-medium-emphasis mb-1">Resultado na sessão atual</div>
        <div class="text-body-1 font-weight-medium">{{ lastJobSummaryText }}</div>
        <div v-if="lastJobResult" class="text-caption text-medium-emphasis mt-1">
          Última execução confirmada em {{ formatDateTime(lastJobResult.executedAt) }}
        </div>
      </v-sheet>
    </v-card>
  </v-col>
</template>
