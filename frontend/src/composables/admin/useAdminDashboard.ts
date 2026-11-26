import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdminSession, type AdminSessionSnapshot } from './useAdminSession'
import { useUiStore } from '@/stores/uiStore'
import { adminDashboardService } from '@/services/adminDashboard.service'
import { jobService } from '@/services/job.service'
import { extractLostReportErrorMessage, getErrorStatus } from '@/utils/lostReport'
import { type MetricKey, type MetricState, type LastJobResult, METRIC_DEFINITIONS } from '@/types/adminDashboard'

export function useAdminDashboard() {
  function createInitialMetrics(): Record<MetricKey, MetricState> {
    return {
      totalLostReports: { loading: false, value: null, error: null },
      openLostReports: { loading: false, value: null, error: null },
      availableItems: { loading: false, value: null, error: null },
      eligibleItems: { loading: false, value: null, error: null },
    }
  }

  const { auth, hasAccess: hasAdminAccess, captureSession, isSameSession } = useAdminSession()
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

  function isSameAdminSession(snapshot: AdminSessionSnapshot): boolean {
    return !unmounted && isSameSession(snapshot)
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
      ui.closeConfirmation(resolver)
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

  async function fetchSingleMetric(
    key: MetricKey,
    requestId: number,
    snapshot: AdminSessionSnapshot,
    fetcher: () => Promise<number>,
  ): Promise<void> {
    metrics.value[key] = {
      loading: true,
      value: metrics.value[key].value,
      error: null,
    }

    try {
      const total = await fetcher()
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
      fetchSingleMetric('totalLostReports', requestId, snapshot, adminDashboardService.countLostReports),
      fetchSingleMetric('openLostReports', requestId, snapshot, () =>
        adminDashboardService.countLostReports('OPEN'),
      ),
      fetchSingleMetric('availableItems', requestId, snapshot, () =>
        adminDashboardService.countItems('AVAILABLE'),
      ),
      fetchSingleMetric('eligibleItems', requestId, snapshot, () =>
        adminDashboardService.countItems('ELIGIBLE'),
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
      ui.closeConfirmation(ownResolver)
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

  return {
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
  }
}
