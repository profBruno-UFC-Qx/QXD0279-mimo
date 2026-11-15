<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LostReport } from '@/types'
import { lostReportService } from '@/services/lostReport.service'
import { useAuthStore } from '@/stores/authStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LostReportCard from '@/components/domain/LostReportCard.vue'
import { extractLostReportErrorMessage, isValidLostReportList } from '@/utils/lostReport'

interface SessionSnapshot {
  requestId: number
  token: string | null
  userId: number | null
  generation: number
}

const auth = useAuthStore()

type StatusFilter = 'ALL' | 'OPEN' | 'RESOLVED' | 'CANCELLED'

const reports = ref<LostReport[]>([])
const selectedStatus = ref<StatusFilter>('ALL')
const loading = ref(false)
const error = ref<string | null>(null)

const filteredReports = computed(() =>
  selectedStatus.value === 'ALL'
    ? reports.value
    : reports.value.filter((report) => report.status === selectedStatus.value),
)

let latestRequestId = 0
let unmounted = false

function captureSession(): SessionSnapshot {
  return {
    requestId: ++latestRequestId,
    token: auth.token,
    userId: auth.user?.id ?? null,
    generation: auth.sessionGeneration,
  }
}

function isCurrentRequest(snapshot: SessionSnapshot): boolean {
  if (unmounted || snapshot.requestId !== latestRequestId) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (snapshot.userId !== null && auth.user?.id !== snapshot.userId) return false
  return true
}

const GENERIC_LOAD_ERROR = 'Não foi possível carregar suas perdas. Tente novamente.'

function resetListingState() {
  reports.value = []
  selectedStatus.value = 'ALL'
  error.value = null
  loading.value = false
}

async function loadReports() {
  if (unmounted || !auth.token) {
    resetListingState()
    return
  }

  const snapshot = captureSession()
  loading.value = true
  error.value = null

  try {
    const data = await lostReportService.mine()
    if (!isCurrentRequest(snapshot)) return
    if (!isValidLostReportList(data)) {
      reports.value = []
      error.value = GENERIC_LOAD_ERROR
      return
    }
    reports.value = data
  } catch (err: unknown) {
    if (!isCurrentRequest(snapshot)) return
    reports.value = []
    error.value = extractLostReportErrorMessage(err, GENERIC_LOAD_ERROR)
  } finally {
    if (!unmounted && snapshot.requestId === latestRequestId) {
      loading.value = false
    }
  }
}

watch(
  () => auth.sessionGeneration,
  async (targetGeneration) => {
    ++latestRequestId
    resetListingState()

    await nextTick()
    if (unmounted || auth.sessionGeneration !== targetGeneration) return
    if (!auth.token) return

    void loadReports()
  },
  { flush: 'sync' },
)

onMounted(() => {
  if (!auth.token) return
  void loadReports()
})

onBeforeUnmount(() => {
  unmounted = true
  ++latestRequestId
})
</script>

<template>
  <div>
    <PageHeader
      title="Minhas perdas"
      subtitle="Acompanhe os objetos perdidos que você registrou."
    >
      <template #actions>
        <v-btn
          color="primary"
          class="text-none"
          prepend-icon="mdi-plus"
          :to="{ name: 'new-lost-report' }"
        >
          Registrar perda
        </v-btn>
      </template>
    </PageHeader>

    <ErrorAlert
      v-if="error"
      :error="error"
      @retry="loadReports"
    />

    <LoadingOverlay :loading="loading" text="Carregando suas perdas...">
      <template v-if="!error">
        <template v-if="reports.length > 0">
          <v-btn-toggle
            v-model="selectedStatus"
            mandatory
            color="primary"
            variant="outlined"
            density="comfortable"
            divided
            class="mb-5 flex-wrap"
          >
            <v-btn value="ALL" class="text-none">Todas</v-btn>
            <v-btn value="OPEN" class="text-none">Abertas</v-btn>
            <v-btn value="RESOLVED" class="text-none">Resolvidas</v-btn>
            <v-btn value="CANCELLED" class="text-none">Canceladas</v-btn>
          </v-btn-toggle>

          <v-row v-if="filteredReports.length > 0">
            <v-col
              v-for="report in filteredReports"
              :key="report.id"
              cols="12"
              md="6"
            >
              <LostReportCard :lost-report="report">
                <template #actions>
                  <v-btn
                    size="small"
                    variant="text"
                    color="primary"
                    class="text-none"
                    prepend-icon="mdi-eye-outline"
                    :to="{ name: 'lost-report-detail', params: { id: report.id } }"
                  >
                    Ver detalhes
                  </v-btn>
                </template>
              </LostReportCard>
            </v-col>
          </v-row>

          <EmptyState
            v-else
            icon="mdi-filter-off-outline"
            title="Nenhuma perda encontrada para este filtro."
            compact
          >
            <template #action>
              <v-btn
                variant="outlined"
                color="primary"
                class="text-none"
                @click="selectedStatus = 'ALL'"
              >
                Mostrar todas
              </v-btn>
            </template>
          </EmptyState>
        </template>

        <EmptyState
          v-else-if="!loading && auth.token"
          icon="mdi-alert-box-outline"
          title="Nenhuma perda registrada"
          description="Quando você registrar um objeto perdido, ele aparecerá aqui para acompanhamento."
        >
          <template #action>
            <v-btn
              color="primary"
              class="text-none"
              prepend-icon="mdi-plus"
              :to="{ name: 'new-lost-report' }"
            >
              Registrar perda
            </v-btn>
          </template>
        </EmptyState>
      </template>
    </LoadingOverlay>
  </div>
</template>
