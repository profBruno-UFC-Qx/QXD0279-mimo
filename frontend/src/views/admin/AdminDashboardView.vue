<script setup lang="ts">
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import DashboardMetrics from '@/components/domain/DashboardMetrics.vue'
import DispositionEligibilityPanel from '@/components/domain/DispositionEligibilityPanel.vue'
import AdminQuickLinks from '@/components/domain/AdminQuickLinks.vue'
import { useAdminDashboard } from '@/composables/admin/useAdminDashboard'

const {
  hasAdminAccess,
  runningJob,
  loadMetrics,
  hasMetricsError,
  failedMetricLabels,
  metrics,
  confirmingJob,
  jobError,
  jobUncertainError,
  lastJobSummaryText,
  lastJobResult,
  handleRunEligibilityJob,
  isAnyMetricLoading,
} = useAdminDashboard()
</script>

<template>
  <div>
    <v-alert
      v-if="!hasAdminAccess"
      data-test="dashboard-restricted-alert"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      Acesso restrito a administradores autenticados.
    </v-alert>

    <template v-else>
      <PageHeader
        title="Dashboard Administrativo"
        subtitle="Indicadores operacionais atuais e processamento manual de elegibilidade para destinação."
      >
        <template #actions>
          <RefreshButton
            :disabled="runningJob"
            @refresh="loadMetrics()"
          >Atualizar indicadores</RefreshButton>
        </template>
      </PageHeader>

      <v-alert
        v-if="hasMetricsError"
        data-test="metrics-error-alert"
        type="warning"
        variant="tonal"
        class="mb-4"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-3">
          <span>
            Falha ao carregar: {{ failedMetricLabels.join(', ') }}. Os demais indicadores permanecem válidos.
          </span>
          <v-btn
            size="small"
            variant="text"
            color="warning"
            :disabled="runningJob"
            @click="loadMetrics()"
          >
            Tentar novamente
          </v-btn>
        </div>
      </v-alert>

      <DashboardMetrics
        :metrics="metrics"
      />

      <v-row>
        <DispositionEligibilityPanel
          :running-job="runningJob"
          :confirming-job="confirmingJob"
          :job-error="jobError"
          :job-uncertain-error="jobUncertainError"
          :last-job-summary-text="lastJobSummaryText"
          :last-job-result="lastJobResult"
          @handle-run-eligibility-job="handleRunEligibilityJob"
          @load-metrics="loadMetrics"
        />

        <AdminQuickLinks
          :is-any-metric-loading="isAnyMetricLoading"
        />
      </v-row>
    </template>
  </div>
</template>
