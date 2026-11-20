<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminItemDetails, DispositionType, LostReport } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { useAuthStore } from '@/stores/authStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import ItemPhotoGallery from '@/components/domain/ItemPhotoGallery.vue'
import PossibleOwnerList from '@/components/domain/PossibleOwnerList.vue'
import { formatDate } from '@/utils/format'
import {
  extractLostReportErrorMessage,
  getErrorStatus,
  isPositiveSafeId,
  parsePositiveReportId,
} from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'

const DISPOSITION_LABELS: Record<DispositionType, string> = {
  SOLD: 'Venda',
  AUCTIONED: 'Leilão',
  DONATED: 'Doação',
  DISCARDED: 'Descarte',
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()

const details = ref<AdminItemDetails | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

const possibleOwners = ref<LostReport[]>([])
const ownersLoading = ref(false)
const ownersError = ref<string | null>(null)

const reportDialogOpen = ref(false)
const selectedReport = ref<LostReport | null>(null)
const reportLoading = ref(false)
const reportChecking = ref(false)
const resolvingReport = ref(false)
const reportError = ref<string | null>(null)

let ownersRequestId = 0
let reportRequestId = 0
let resolveRequestId = 0

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const itemId = computed(() => parsePositiveReportId(String(route.params.id ?? '')))
const isEditable = computed(() => details.value !== null && isItemEditable(details.value.item.status))
const categoryName = computed(() =>
  details.value ? categoryLabel(details.value.item.categoryId) : '-',
)
const buildingName = computed(() =>
  details.value ? buildingLabel(details.value.item.buildingId) : '-',
)

function categoryLabel(id: number): string {
  return categoriesStore.items.find((category) => category.id === id)?.name ?? `Categoria #${id}`
}

function buildingLabel(id: number | null): string {
  if (id === null) return 'Qualquer prédio'
  return buildingsStore.items.find((building) => building.id === id)?.name ?? `Prédio #${id}`
}

function resetReportDialog() {
  ++reportRequestId
  reportDialogOpen.value = false
  selectedReport.value = null
  reportLoading.value = false
  reportChecking.value = false
  reportError.value = null
}

function resetOwnersState() {
  ++ownersRequestId
  possibleOwners.value = []
  ownersLoading.value = false
  ownersError.value = null
  resetReportDialog()
}

async function loadDetails() {
  const id = itemId.value
  details.value = null
  loadError.value = null
  notFound.value = false
  deleteError.value = null
  resetOwnersState()

  if (id === null) {
    notFound.value = true
    return
  }

  loading.value = true
  try {
    details.value = await adminItemService.getById(id)
    void loadPossibleOwners()
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      notFound.value = true
    } else if (httpStatus === 403) {
      loadError.value = 'Sua sessão não possui permissão administrativa para consultar itens.'
    } else {
      loadError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os detalhes do item. Tente novamente.',
      )
    }
  } finally {
    loading.value = false
  }
}

async function loadPossibleOwners() {
  const id = itemId.value
  if (id === null) return

  if (!hasAdminAccess.value) {
    possibleOwners.value = []
    ownersError.value = 'Sua sessão não possui permissão administrativa para consultar possíveis donos.'
    return
  }

  const requestId = ++ownersRequestId
  ownersLoading.value = true
  ownersError.value = null

  try {
    const reports = await adminItemService.getPossibleOwners(id)
    if (requestId !== ownersRequestId || itemId.value !== id) return
    possibleOwners.value = reports
  } catch (err: unknown) {
    if (requestId !== ownersRequestId || itemId.value !== id) return
    possibleOwners.value = []
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      ownersError.value = 'O item não foi encontrado.'
    } else if (httpStatus === 403) {
      ownersError.value =
        'Sua sessão não possui permissão administrativa para consultar possíveis donos.'
    } else {
      ownersError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os possíveis donos. Tente novamente.',
      )
    }
  } finally {
    if (requestId === ownersRequestId) {
      ownersLoading.value = false
    }
  }
}

async function loadReport(reportId: number) {
  if (!isPositiveSafeId(reportId)) return

  const requestId = ++reportRequestId
  reportLoading.value = true
  reportError.value = null

  try {
    const fresh = await adminLostReportService.getById(reportId)
    if (requestId !== reportRequestId) return
    selectedReport.value = fresh
  } catch (err: unknown) {
    if (requestId !== reportRequestId) return
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      reportError.value = 'Este relato não existe mais no servidor.'
      await loadPossibleOwners()
    } else if (httpStatus === 403) {
      reportError.value =
        'Sua sessão não possui permissão administrativa para consultar relatos de perda.'
    } else {
      reportError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível consultar o relato. Tente novamente.',
      )
    }
  } finally {
    if (requestId === reportRequestId) {
      reportLoading.value = false
    }
  }
}

function openReport(report: LostReport) {
  if (!hasAdminAccess.value || !isPositiveSafeId(report.id)) return
  reportDialogOpen.value = true
  selectedReport.value = report
  void loadReport(report.id)
}

function retryReportLoad() {
  if (selectedReport.value) void loadReport(selectedReport.value.id)
}

function closeReportDialog() {
  if (resolvingReport.value || reportChecking.value) return
  resetReportDialog()
}

async function reconcileReportState(reportId: number) {
  if (selectedReport.value?.id !== reportId || reportChecking.value) return

  reportChecking.value = true
  try {
    const fresh = await adminLostReportService.getById(reportId)
    if (selectedReport.value?.id !== reportId) return

    selectedReport.value = fresh
    if (fresh.status === 'RESOLVED') {
      ui.notifySuccess('O relato já estava resolvido.')
      resetReportDialog()
      await loadPossibleOwners()
      return
    }
    if (fresh.status === 'CANCELLED') {
      reportError.value = 'Este relato foi cancelado pelo autor e não pode ser encerrado.'
      await loadPossibleOwners()
      return
    }
    reportError.value =
      'O relato continua aberto. Consulte o estado atual antes de tentar encerrar novamente.'
  } catch (err: unknown) {
    if (selectedReport.value?.id !== reportId) return
    const httpStatus = getErrorStatus(err)
    resetReportDialog()
    ui.notifyError(
      httpStatus === 404
        ? 'Este relato não existe mais no servidor.'
        : 'Não foi possível confirmar o estado do relato. Consulte novamente antes de tentar encerrar.',
    )
    await loadPossibleOwners()
  } finally {
    reportChecking.value = false
  }
}

async function resolveReport(reportId: number) {
  if (resolvingReport.value || !isPositiveSafeId(reportId)) return

  const requestId = ++resolveRequestId
  resolvingReport.value = true
  reportError.value = null

  try {
    const updated = await adminLostReportService.resolve(reportId)
    if (requestId !== resolveRequestId || selectedReport.value?.id !== reportId) return

    if (updated.status !== 'RESOLVED') {
      await reconcileReportState(reportId)
      return
    }

    ui.notifySuccess('Relato de perda encerrado com sucesso.')
    resetReportDialog()
    await loadPossibleOwners()
  } catch (err: unknown) {
    if (requestId !== resolveRequestId) return
    const httpStatus = getErrorStatus(err)

    if (httpStatus === 401) return
    if (httpStatus === 403) {
      reportError.value =
        'Sua sessão não possui permissão administrativa para encerrar relatos de perda.'
      return
    }
    if (httpStatus === 404) {
      reportError.value = 'Este relato não existe mais no servidor.'
      await loadPossibleOwners()
      return
    }
    if (httpStatus === 400) {
      reportError.value = extractLostReportErrorMessage(
        err,
        'O relato não pode ser encerrado neste estado.',
      )
      return
    }

    await reconcileReportState(reportId)
  } finally {
    if (requestId === resolveRequestId) {
      resolvingReport.value = false
    }
  }
}

async function confirmResolveReport() {
  const report = selectedReport.value
  if (
    !report ||
    report.status !== 'OPEN' ||
    !hasAdminAccess.value ||
    resolvingReport.value ||
    reportLoading.value ||
    reportChecking.value ||
    reportError.value !== null ||
    ui.confirmDialog.show ||
    ui.confirmDialog.open
  ) {
    return
  }

  const confirmed = await ui.confirm({
    title: 'Encerrar relato de perda?',
    message: `O relato #${report.id} será marcado como resolvido e o autor será notificado. Isso encerra a perda, mas não registra a entrega do item nem confirma a propriedade.`,
    confirmText: 'Encerrar relato',
    cancelText: 'Cancelar',
  })
  if (!confirmed) return

  await resolveReport(report.id)
}

function goBack() {
  void router.push({ name: 'admin-items' })
}

function openEdit() {
  if (!details.value || !isEditable.value) return
  void router.push({ name: 'admin-item-edit', params: { id: details.value.item.id } })
}

async function requestDelete() {
  if (!details.value || !isEditable.value || deleting.value) return

  const confirmed = await ui.confirm({
    title: 'Excluir item?',
    message: `Deseja realmente excluir "${details.value.item.title}"? Itens com histórico não podem ser excluídos.`,
    danger: true,
    confirmText: 'Excluir item',
    cancelText: 'Cancelar',
  })
  if (!confirmed) return

  deleting.value = true
  deleteError.value = null
  try {
    await adminItemService.remove(details.value.item.id)
    ui.notifySuccess('Item excluído com sucesso.')
    await router.push({ name: 'admin-items' })
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      deleteError.value = 'Este item já foi removido anteriormente.'
    } else if (httpStatus === 409) {
      deleteError.value = extractLostReportErrorMessage(
        err,
        'Este item possui histórico e não pode ser excluído.',
      )
    } else if (httpStatus === 403) {
      deleteError.value = 'Sua sessão não possui permissão administrativa para excluir itens.'
    } else {
      deleteError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível excluir o item. Tente novamente.',
      )
    }
  } finally {
    deleting.value = false
  }
}

watch(itemId, () => void loadDetails(), { immediate: true })

onMounted(() => {
  void categoriesStore.ensureLoaded()
  void buildingsStore.ensureLoaded()
})
</script>

<template>
  <div>
    <PageHeader
      title="Detalhes do item"
      subtitle="Visualize as informações e as fotos do objeto encontrado."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-arrow-left"
            @click="goBack"
          >
            Voltar
          </v-btn>
          <v-btn
            v-if="details"
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-pencil-outline"
            :disabled="!hasAdminAccess || !isEditable || deleting"
            @click="openEdit"
          >
            Editar
          </v-btn>
          <v-btn
            v-if="details"
            variant="tonal"
            color="error"
            class="text-none"
            prepend-icon="mdi-delete-outline"
            :disabled="!hasAdminAccess || !isEditable || deleting"
            :loading="deleting"
            @click="requestDelete"
          >
            Excluir
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <v-alert v-if="deleteError" type="error" variant="tonal" class="mb-4 rounded-lg">
      {{ deleteError }}
    </v-alert>

    <div v-if="notFound" class="py-4">
      <v-alert type="warning" variant="tonal" class="rounded-lg">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Item não encontrado ou identificador inválido.</span>
          <v-btn size="small" variant="text" color="primary" class="text-none" @click="goBack">
            Voltar para a listagem
          </v-btn>
        </div>
      </v-alert>
    </div>

    <ErrorAlert v-else-if="loadError" :error="loadError" @retry="loadDetails()" />

    <LoadingOverlay :loading="loading" text="Carregando detalhes do item...">
      <v-row v-if="details">
        <v-col cols="12" md="6">
          <ItemPhotoGallery :photos="details.photos" />
        </v-col>

        <v-col cols="12" md="6">
          <v-card variant="flat" class="rounded-lg border pa-5 h-100">
            <div class="d-flex align-start justify-space-between flex-wrap ga-3 mb-3">
              <div>
                <h2 class="text-h5 font-weight-bold text-primary mb-1">
                  {{ details.item.title }}
                </h2>
                <span class="text-body-2 text-medium-emphasis">Item #{{ details.item.id }}</span>
              </div>
              <StatusChip :status="details.item.status" />
            </div>

            <p class="text-body-1 mb-4">
              {{ details.item.description || 'Sem descrição informada.' }}
            </p>

            <v-divider class="mb-4" />

            <div class="d-flex flex-column ga-3 text-body-2">
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-tag-outline" size="18" color="primary" />
                <span><strong>Categoria:</strong> {{ categoryName }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-domain" size="18" color="primary" />
                <span><strong>Prédio:</strong> {{ buildingName }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-map-marker-outline" size="18" color="primary" />
                <span>
                  <strong>Local do achado:</strong>
                  {{ details.item.foundLocation || 'Não informado' }}
                </span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-calendar-outline" size="18" color="primary" />
                <span><strong>Data do achado:</strong> {{ formatDate(details.item.foundDate) }}</span>
              </div>
              <div v-if="details.item.plannedDestination" class="d-flex align-center ga-2">
                <v-icon icon="mdi-target" size="18" color="primary" />
                <span>
                  <strong>Destino planejado:</strong>
                  {{ DISPOSITION_LABELS[details.item.plannedDestination] }}
                </span>
              </div>
            </div>

            <v-alert
              v-if="!isEditable"
              type="info"
              variant="tonal"
              density="compact"
              class="mt-5 rounded-lg"
            >
              Itens entregues ou destinados não podem ser editados ou excluídos.
            </v-alert>
          </v-card>
        </v-col>
      </v-row>

      <v-row v-if="details" class="mt-2">
        <v-col cols="12">
          <v-card variant="flat" class="rounded-lg border pa-5">
            <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-1">
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-account-search-outline" size="22" color="primary" />
                <h3 class="text-h6 font-weight-bold text-primary mb-0">Possíveis donos</h3>
              </div>
              <v-chip
                v-if="!ownersLoading && !ownersError"
                size="small"
                variant="tonal"
                color="primary"
              >
                {{ possibleOwners.length }}
              </v-chip>
            </div>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Relatos de perda compatíveis com categoria, prédio e data do achado. A
              correspondência indica apenas uma possibilidade e não comprova a propriedade.
            </p>

            <ErrorAlert v-if="ownersError" :error="ownersError" @retry="loadPossibleOwners()" />

            <LoadingOverlay
              v-else
              :loading="ownersLoading"
              text="Carregando possíveis donos..."
            >
              <PossibleOwnerList :owners="possibleOwners" @close-report="openReport" />
            </LoadingOverlay>
          </v-card>
        </v-col>
      </v-row>
    </LoadingOverlay>

    <v-dialog v-model="reportDialogOpen" max-width="560" persistent>
      <v-card class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          Relato de perda {{ selectedReport ? `#${selectedReport.id}` : '' }}
        </v-card-title>

        <v-card-text class="px-4 py-3">
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
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2">
          <v-btn
            v-if="reportError && selectedReport"
            variant="outlined"
            color="primary"
            class="text-none"
            :disabled="reportLoading"
            @click="retryReportLoad"
          >
            Consultar novamente
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            class="text-none"
            :disabled="resolvingReport || reportChecking"
            @click="closeReportDialog"
          >
            Fechar
          </v-btn>
          <v-btn
            v-if="selectedReport?.status === 'OPEN' && !reportError"
            color="primary"
            class="text-none"
            :loading="resolvingReport"
            :disabled="reportLoading || reportChecking"
            @click="confirmResolveReport"
          >
            Encerrar relato
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
