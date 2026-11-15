<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/domain/StatCard.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { adminItemService } from '@/services/adminItem.service'
import { jobService } from '@/services/job.service'
import { extractPaginationTotal } from '@/utils/dashboardMetrics'
import { extractLostReportErrorMessage, getErrorStatus } from '@/utils/lostReport'
import { formatDateTime } from '@/utils/format'
import type { StatusColorToken } from '@/theme/colors'

type MetricKey = 'totalLostReports' | 'openLostReports' | 'availableItems' | 'eligibleItems'

interface MetricState {
  loading: boolean
  value: number | null
  error: string | null
}

interface MetricDefinition {
  key: MetricKey
  label: string
  icon: string
  color: StatusColorToken
  to: string
  linkLabel: string
}

interface SessionSnapshot {
  token: string | null
  userId: number | null
  role: string | null
  generation: number
}

interface LastJobResult {
  updatedCount: number
  executedAt: string
}

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'totalLostReports',
    label: 'Relatos cadastrados',
    icon: 'mdi-alert-box-outline',
    color: 'info',
    to: '/admin/perdas',
    linkLabel: 'Ver relatos',
  },
  {
    key: 'openLostReports',
    label: 'Relatos em aberto',
    icon: 'mdi-alert-circle-outline',
    color: 'warning',
    to: '/admin/perdas',
    linkLabel: 'Analisar em aberto',
  },
  {
    key: 'availableItems',
    label: 'Itens disponíveis',
    icon: 'mdi-package-variant-closed',
    color: 'primary',
    to: '/admin/itens',
    linkLabel: 'Gerenciar itens',
  },
  {
    key: 'eligibleItems',
    label: 'Itens elegíveis',
    icon: 'mdi-delete-clock-outline',
    color: 'success',
    to: '/admin/itens',
    linkLabel: 'Ver elegíveis',
  },
]

function createInitialMetrics(): Record<MetricKey, MetricState> {
  return {
    totalLostReports: { loading: false, value: null, error: null },
    openLostReports: { loading: false, value: null, error: null },
    availableItems: { loading: false, value: null, error: null },
    eligibleItems: { loading: false, value: null, error: null },
  }
}

const auth = useAuthStore()
const ui = useUiStore()

const metrics = ref<Record<MetricKey, MetricState>>(createInitialMetrics())
const confirmingJob = ref(false)
const runningJob = ref(false)
const jobError = ref<string | null>(null)
const jobUncertainError = ref<string | null>(null)
const lastJobResult = ref<LastJobResult | null>(null)

let latestMetricsReqId = 0
let latestJobReqId = 0
let latestConfirmId = 0
let activeJobConfirmationId: number | null = null
let activeConfirmResolver: ((value: boolean) => void) | null = null
let unmounted = false

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)

const isAnyMetricLoading = computed(() =>
  METRIC_DEFINITIONS.some((def) => metrics.value[def.key].loading),
)

const failedMetricLabels = computed(() =>
  METRIC_DEFINITIONS.filter((def) => metrics.value[def.key].error !== null).map((def) => def.label),
)

const hasMetricsError = computed(() => failedMetricLabels.value.length > 0)

const lastJobSummaryText = computed(() => {
  if (!lastJobResult.value) {
    return 'Nenhum resultado de processamento disponível nesta página.'
  }
  return formatJobResultMessage(lastJobResult.value.updatedCount)
})

function formatJobResultMessage(updatedCount: number): string {
  if (updatedCount === 0) {
    return 'Nenhum item precisou ser atualizado nesta execução.'
  }
  if (updatedCount === 1) {
    return '1 item foi marcado como elegível nesta execução.'
  }
  return `${updatedCount} itens foram marcados como elegíveis nesta execução.`
}

function captureSession(): SessionSnapshot {
  return {
    token: auth.token,
    userId: auth.user?.id ?? null,
    role: auth.user?.role ?? null,
    generation: auth.sessionGeneration,
  }
}

function isSameAdminSession(snapshot: SessionSnapshot): boolean {
  return (
    !unmounted &&
    hasAdminAccess.value &&
    auth.token === snapshot.token &&
    (auth.user?.id ?? null) === snapshot.userId &&
    (auth.user?.role ?? null) === snapshot.role &&
    auth.sessionGeneration === snapshot.generation
  )
}

function dismissOwnedConfirmDialog(): void {
  if (
    activeJobConfirmationId !== null &&
    activeConfirmResolver !== null &&
    ui.confirmDialog.resolve === activeConfirmResolver
  ) {
    const resolver = activeConfirmResolver
    activeJobConfirmationId = null
    activeConfirmResolver = null
    ui.confirmDialog.show = false
    ui.confirmDialog.open = false
    resolver(false)
    return
  }

  activeJobConfirmationId = null
  activeConfirmResolver = null
}

function resetDashboardState(): void {
  latestMetricsReqId++
  latestJobReqId++
  latestConfirmId++
  dismissOwnedConfirmDialog()

  metrics.value = createInitialMetrics()
  confirmingJob.value = false
  runningJob.value = false
  jobError.value = null
  jobUncertainError.value = null
  lastJobResult.value = null
}

function formatStatValue(state: MetricState): string | number {
  if (state.loading) return '...'
  if (state.error !== null || state.value === null) return '—'
  return state.value
}

async function fetchSingleMetric(
  key: MetricKey,
  requestId: number,
  snapshot: SessionSnapshot,
  fetcher: () => Promise<unknown>,
): Promise<void> {
  metrics.value[key] = {
    loading: true,
    value: metrics.value[key].value,
    error: null,
  }

  try {
    const response = await fetcher()
    const total = extractPaginationTotal(response)
    if (requestId !== latestMetricsReqId || !isSameAdminSession(snapshot)) {
      return
    }
    metrics.value[key] = {
      loading: false,
      value: total,
      error: null,
    }
  } catch (err: unknown) {
    if (requestId !== latestMetricsReqId || !isSameAdminSession(snapshot)) {
      return
    }
    metrics.value[key] = {
      loading: false,
      value: null,
      error: extractLostReportErrorMessage(err, 'Não foi possível carregar este indicador.'),
    }
  }
}

async function loadMetrics(): Promise<void> {
  if (!hasAdminAccess.value || unmounted) return

  const requestId = ++latestMetricsReqId
  const snapshot = captureSession()

  await Promise.all([
    fetchSingleMetric('totalLostReports', requestId, snapshot, () =>
      adminLostReportService.list({ page: 1, per_page: 1 }),
    ),
    fetchSingleMetric('openLostReports', requestId, snapshot, () =>
      adminLostReportService.list({ status: 'OPEN', page: 1, per_page: 1 }),
    ),
    fetchSingleMetric('availableItems', requestId, snapshot, () =>
      adminItemService.list({ status: 'AVAILABLE', page: 1, per_page: 1 }),
    ),
    fetchSingleMetric('eligibleItems', requestId, snapshot, () =>
      adminItemService.list({ status: 'ELIGIBLE', page: 1, per_page: 1 }),
    ),
  ])
}

async function handleRunEligibilityJob(): Promise<void> {
  if (!hasAdminAccess.value || unmounted) return
  if (confirmingJob.value || runningJob.value) return
  if (ui.confirmDialog.show || ui.confirmDialog.open) return

  const confirmSnapshot = captureSession()
  const confirmId = ++latestConfirmId
  confirmingJob.value = true
  activeJobConfirmationId = confirmId

  let confirmed = false
  let ownResolver: ((value: boolean) => void) | null = null
  try {
    const confirmPromise = ui.confirm({
      title: 'Executar processamento de elegibilidade?',
      message:
        'Esta ação avalia no servidor os itens em custódia para identificar quais atingiram os critérios de destinação.',
      confirmText: 'Executar processamento',
      cancelText: 'Cancelar',
      danger: false,
    })
    ownResolver = ui.confirmDialog.resolve ?? null
    activeConfirmResolver = ownResolver
    confirmed = await confirmPromise
  } finally {
    if (ownResolver && ui.confirmDialog.resolve === ownResolver) {
      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
    }
    if (activeJobConfirmationId === confirmId) {
      activeJobConfirmationId = null
      activeConfirmResolver = null
    }
    if (confirmId === latestConfirmId) {
      confirmingJob.value = false
    }
  }

  if (!confirmed || confirmId !== latestConfirmId || !isSameAdminSession(confirmSnapshot)) {
    return
  }

  if (runningJob.value) return

  const jobSnapshot = confirmSnapshot
  const jobReqId = ++latestJobReqId
  runningJob.value = true
  jobError.value = null
  jobUncertainError.value = null

  try {
    const result = await jobService.runDispositionEligibility()
    if (jobReqId !== latestJobReqId || !isSameAdminSession(jobSnapshot)) {
      return
    }
    lastJobResult.value = {
      updatedCount: result.updatedCount,
      executedAt: new Date().toISOString(),
    }
    ui.notifySuccess(formatJobResultMessage(result.updatedCount))
    void loadMetrics()
  } catch (err: unknown) {
    if (jobReqId !== latestJobReqId || !isSameAdminSession(jobSnapshot)) {
      return
    }
    const status = getErrorStatus(err)
    if (status === 401 || status === 403) {
      jobError.value = extractLostReportErrorMessage(
        err,
        'Você não possui permissão para executar o processamento de elegibilidade.',
      )
    } else {
      jobUncertainError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível confirmar se o processamento foi concluído no servidor. Atualize os indicadores antes de tentar novamente.',
      )
    }
  } finally {
    if (jobReqId === latestJobReqId) {
      runningJob.value = false
    }
  }
}

watch(
  [
    () => auth.token,
    () => auth.user?.id ?? null,
    () => auth.user?.role ?? null,
    () => auth.sessionGeneration,
  ],
  (nextValues, prevValues) => {
    const changed = nextValues.some((value, index) => value !== prevValues[index])
    if (!changed) return
    resetDashboardState()
    if (hasAdminAccess.value) {
      void loadMetrics()
    }
  },
)

onMounted(() => {
  if (hasAdminAccess.value) {
    void loadMetrics()
  }
})

onBeforeUnmount(() => {
  unmounted = true
  resetDashboardState()
})
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
          <v-btn
            variant="outlined"
            color="primary"
            prepend-icon="mdi-refresh"
            :disabled="runningJob"
            @click="loadMetrics()"
          >
            Atualizar indicadores
          </v-btn>
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

      <v-row class="mb-6">
        <v-col
          v-for="def in METRIC_DEFINITIONS"
          :key="def.key"
          cols="12"
          sm="6"
          lg="3"
        >
          <div class="d-flex flex-column ga-2 h-100">
            <StatCard
              :label="def.label"
              :value="formatStatValue(metrics[def.key])"
              :icon="def.icon"
              :color="def.color"
            />
            <div class="d-flex justify-end px-1">
              <v-btn
                :to="def.to"
                size="small"
                variant="text"
                :color="def.color"
                append-icon="mdi-arrow-right"
              >
                {{ def.linkLabel }}
              </v-btn>
            </div>
          </div>
        </v-col>
      </v-row>

      <v-row>
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
                @click="handleRunEligibilityJob"
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
                    @click="loadMetrics()"
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

        <v-col cols="12" lg="4">
          <v-card variant="outlined" class="pa-5 h-100">
            <h2 class="text-h6 font-weight-bold mb-2">Atalhos operacionais</h2>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Acesse diretamente os módulos relacionados aos indicadores exibidos acima.
            </p>
            <div class="d-flex flex-column ga-2">
              <v-btn
                to="/admin/perdas"
                variant="tonal"
                color="warning"
                prepend-icon="mdi-alert-box"
                class="justify-start"
              >
                Gerenciar relatos de perdas
              </v-btn>
              <v-btn
                to="/admin/itens"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-package-variant-closed"
                class="justify-start"
              >
                Gerenciar itens em custódia
              </v-btn>
            </div>
            <div v-if="isAnyMetricLoading" class="text-caption text-medium-emphasis mt-4">
              Atualizando indicadores...
            </div>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>
