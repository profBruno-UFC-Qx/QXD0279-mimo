<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type {
  AdminItemQuery,
  Disposition,
  DispositionQuery,
  DispositionType,
  Item,
  PaginationMeta,
} from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { dispositionService } from '@/services/disposition.service'
import { useAuthStore } from '@/stores/authStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import DispositionDialog from '@/components/domain/DispositionDialog.vue'
import { formatDate, formatDateTime } from '@/utils/format'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { DISPOSITION_LABELS, DISPOSITION_OPTIONS } from '@/utils/dispositions'

type Section = 'eligible' | 'history'

interface HistoryFilters {
  destination: DispositionType | null
  from: string | null
  to: string | null
}

const DEFAULT_PER_PAGE = 12

const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()

const activeSection = ref<Section>('eligible')

const eligibleItems = ref<Item[]>([])
const eligiblePagination = ref<PaginationMeta>({
  total: 0,
  page: 1,
  per_page: DEFAULT_PER_PAGE,
  total_pages: 0,
})
const eligiblePage = ref(1)
const eligiblePerPage = ref(DEFAULT_PER_PAGE)
const eligibleLoading = ref(false)
const eligibleError = ref<string | null>(null)

const selectedItem = ref<Item | null>(null)
const dispositionDialogOpen = ref(false)

const history = ref<Disposition[]>([])
const historyPagination = ref<PaginationMeta>({
  total: 0,
  page: 1,
  per_page: DEFAULT_PER_PAGE,
  total_pages: 0,
})
const historyPage = ref(1)
const historyPerPage = ref(DEFAULT_PER_PAGE)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)

const draftHistoryFilters = ref<HistoryFilters>({ destination: null, from: null, to: null })
const appliedHistoryFilters = ref<HistoryFilters>({ destination: null, from: null, to: null })
const historyFilterError = ref<string | null>(null)

const detailOpen = ref(false)
const detailId = ref<number | null>(null)
const detail = ref<Disposition | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const detailNotFound = ref(false)

let latestEligibleRequestId = 0
let latestHistoryRequestId = 0
let latestDetailRequestId = 0

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const historyDestinationOptions = [
  { title: 'Todos', value: null as DispositionType | null },
  ...DISPOSITION_OPTIONS,
]
const hasHistoryFilters = computed(
  () =>
    appliedHistoryFilters.value.destination !== null ||
    appliedHistoryFilters.value.from !== null ||
    appliedHistoryFilters.value.to !== null,
)
const eligiblePageWithoutResults = computed(
  () =>
    !eligibleLoading.value &&
    eligibleError.value === null &&
    eligibleItems.value.length === 0 &&
    eligiblePagination.value.total > 0 &&
    eligiblePage.value > 1,
)
const historyPageWithoutResults = computed(
  () =>
    !historyLoading.value &&
    historyError.value === null &&
    history.value.length === 0 &&
    historyPagination.value.total > 0 &&
    historyPage.value > 1,
)

function categoryLabel(id: number): string {
  return categoriesStore.items.find((category) => category.id === id)?.name ?? `Categoria #${id}`
}

function buildingLabel(id: number): string {
  return buildingsStore.items.find((building) => building.id === id)?.name ?? `Prédio #${id}`
}

async function loadEligibleItems() {
  if (!hasAdminAccess.value) return

  const requestId = ++latestEligibleRequestId
  eligibleLoading.value = true
  eligibleError.value = null

  const query: AdminItemQuery = {
    status: 'ELIGIBLE',
    page: eligiblePage.value,
    per_page: eligiblePerPage.value,
  }

  try {
    const res = await adminItemService.list(query)
    if (requestId !== latestEligibleRequestId) return
    eligibleItems.value = res.data
    eligiblePagination.value = res.pagination
  } catch (err: unknown) {
    if (requestId !== latestEligibleRequestId) return
    eligibleItems.value = []
    eligiblePagination.value = {
      total: 0,
      page: eligiblePage.value,
      per_page: eligiblePerPage.value,
      total_pages: 0,
    }
    const httpStatus = getErrorStatus(err)
    eligibleError.value =
      httpStatus === 403
        ? 'Sua sessão não possui permissão administrativa para consultar itens elegíveis.'
        : extractLostReportErrorMessage(
            err,
            'Não foi possível carregar os itens elegíveis. Tente novamente.',
          )
  } finally {
    if (requestId === latestEligibleRequestId) {
      eligibleLoading.value = false
    }
  }
}

function buildHistoryQuery(): DispositionQuery {
  const query: DispositionQuery = {
    page: historyPage.value,
    per_page: historyPerPage.value,
  }
  if (appliedHistoryFilters.value.destination !== null) {
    query.destination = appliedHistoryFilters.value.destination
  }
  if (appliedHistoryFilters.value.from !== null) query.from = appliedHistoryFilters.value.from
  if (appliedHistoryFilters.value.to !== null) query.to = appliedHistoryFilters.value.to
  return query
}

async function loadHistory() {
  if (!hasAdminAccess.value) return

  const requestId = ++latestHistoryRequestId
  historyLoading.value = true
  historyError.value = null

  try {
    const res = await dispositionService.list(buildHistoryQuery())
    if (requestId !== latestHistoryRequestId) return
    history.value = res.data
    historyPagination.value = res.pagination
  } catch (err: unknown) {
    if (requestId !== latestHistoryRequestId) return
    history.value = []
    historyPagination.value = {
      total: 0,
      page: historyPage.value,
      per_page: historyPerPage.value,
      total_pages: 0,
    }
    const httpStatus = getErrorStatus(err)
    historyError.value =
      httpStatus === 403
        ? 'Sua sessão não possui permissão administrativa para consultar destinações.'
        : extractLostReportErrorMessage(
            err,
            'Não foi possível carregar o histórico de destinações. Tente novamente.',
          )
  } finally {
    if (requestId === latestHistoryRequestId) {
      historyLoading.value = false
    }
  }
}

function applyHistoryFilters() {
  if (!hasAdminAccess.value) return
  if (
    draftHistoryFilters.value.from !== null &&
    draftHistoryFilters.value.to !== null &&
    draftHistoryFilters.value.from > draftHistoryFilters.value.to
  ) {
    historyFilterError.value = 'A data inicial não pode ser posterior à data final.'
    return
  }
  historyFilterError.value = null
  appliedHistoryFilters.value = { ...draftHistoryFilters.value }
  historyPage.value = 1
  void loadHistory()
}

function clearHistoryFilters() {
  if (!hasAdminAccess.value) return
  draftHistoryFilters.value = { destination: null, from: null, to: null }
  appliedHistoryFilters.value = { destination: null, from: null, to: null }
  historyFilterError.value = null
  historyPage.value = 1
  void loadHistory()
}

function changeEligiblePage(nextPage: number) {
  if (!isPositiveSafeId(nextPage)) return
  eligiblePage.value = nextPage
  void loadEligibleItems()
}

function changeEligibleLimit(nextLimit: number) {
  if (!isPositiveSafeId(nextLimit)) return
  eligiblePerPage.value = nextLimit
  eligiblePage.value = 1
  void loadEligibleItems()
}

function changeHistoryPage(nextPage: number) {
  if (!isPositiveSafeId(nextPage)) return
  historyPage.value = nextPage
  void loadHistory()
}

function changeHistoryLimit(nextLimit: number) {
  if (!isPositiveSafeId(nextLimit)) return
  historyPerPage.value = nextLimit
  historyPage.value = 1
  void loadHistory()
}

function returnToFirstEligiblePage() {
  eligiblePage.value = 1
  void loadEligibleItems()
}

function returnToFirstHistoryPage() {
  historyPage.value = 1
  void loadHistory()
}

function openDisposition(item: Item) {
  if (!hasAdminAccess.value || item.status !== 'ELIGIBLE') return
  selectedItem.value = item
  dispositionDialogOpen.value = true
}

function handleDispositionCreated() {
  if (eligibleItems.value.length === 1 && eligiblePage.value > 1) {
    eligiblePage.value -= 1
  }
  void loadEligibleItems()
  void loadHistory()
}

function handleDispositionConflict() {
  void loadEligibleItems()
  void loadHistory()
}

async function openDetails(dispositionId: number) {
  if (!isPositiveSafeId(dispositionId)) return

  const requestId = ++latestDetailRequestId
  detailOpen.value = true
  detailId.value = dispositionId
  detail.value = null
  detailError.value = null
  detailNotFound.value = false
  detailLoading.value = true

  try {
    const res = await dispositionService.getById(dispositionId)
    if (requestId !== latestDetailRequestId) return
    detail.value = res
  } catch (err: unknown) {
    if (requestId !== latestDetailRequestId) return
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      detailNotFound.value = true
    } else if (httpStatus === 403) {
      detailError.value =
        'Sua sessão não possui permissão administrativa para consultar destinações.'
    } else {
      detailError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os detalhes da destinação. Tente novamente.',
      )
    }
  } finally {
    if (requestId === latestDetailRequestId) {
      detailLoading.value = false
    }
  }
}

function retryDetails() {
  if (detailId.value === null) return
  void openDetails(detailId.value)
}

function closeDetails() {
  ++latestDetailRequestId
  detailOpen.value = false
  detailId.value = null
  detail.value = null
  detailError.value = null
  detailNotFound.value = false
  detailLoading.value = false
}

function refreshAll() {
  void loadEligibleItems()
  void loadHistory()
}

onMounted(() => {
  if (!hasAdminAccess.value) return
  void categoriesStore.ensureLoaded()
  void buildingsStore.ensureLoaded()
  void loadEligibleItems()
  void loadHistory()
})
</script>

<template>
  <div>
    <PageHeader
      title="Destinações"
      subtitle="Consulte itens elegíveis e registre a destinação após o prazo configurado."
    >
      <template #actions>
        <v-btn
          variant="outlined"
          color="primary"
          class="text-none"
          prepend-icon="mdi-refresh"
          :disabled="!hasAdminAccess"
          :loading="eligibleLoading || historyLoading"
          @click="refreshAll"
        >
          Atualizar
        </v-btn>
      </template>
    </PageHeader>

    <v-btn-toggle
      v-model="activeSection"
      mandatory
      color="primary"
      variant="outlined"
      density="comfortable"
      divided
      class="mb-5 flex-wrap"
    >
      <v-btn value="eligible" class="text-none">Itens elegíveis</v-btn>
      <v-btn value="history" class="text-none">Histórico</v-btn>
    </v-btn-toggle>

    <template v-if="activeSection === 'eligible'">
      <v-alert type="info" variant="tonal" class="mb-4 rounded-lg">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>
            A elegibilidade é calculada no Dashboard administrativo, após as regras de
            destinação serem configuradas.
          </span>
          <v-btn
            :to="{ name: 'admin-dashboard' }"
            size="small"
            variant="text"
            color="primary"
            class="text-none"
          >
            Ir para o Dashboard
          </v-btn>
        </div>
      </v-alert>

      <ErrorAlert v-if="eligibleError" :error="eligibleError" @retry="loadEligibleItems()" />

      <v-alert
        v-if="eligiblePageWithoutResults"
        type="info"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>A página solicitada não possui itens elegíveis.</span>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            class="text-none"
            @click="returnToFirstEligiblePage"
          >
            Ir para a página 1
          </v-btn>
        </div>
      </v-alert>

      <LoadingOverlay :loading="eligibleLoading" text="Carregando itens elegíveis...">
        <template v-if="!eligibleError">
          <v-card
            v-if="eligibleItems.length > 0"
            variant="flat"
            class="rounded-lg border overflow-hidden"
          >
            <div class="overflow-x-auto">
              <v-table hover>
                <thead>
                  <tr>
                    <th class="text-left">Item</th>
                    <th class="text-left">Categoria</th>
                    <th class="text-left">Prédio</th>
                    <th class="text-left">Achado em</th>
                    <th class="text-left">Status</th>
                    <th class="text-left">Destino planejado</th>
                    <th class="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in eligibleItems" :key="item.id">
                    <td>
                      <div class="font-weight-medium">{{ item.title }}</div>
                      <div class="text-caption text-medium-emphasis">Item #{{ item.id }}</div>
                    </td>
                    <td>{{ categoryLabel(item.categoryId) }}</td>
                    <td>{{ buildingLabel(item.buildingId) }}</td>
                    <td>{{ formatDate(item.foundDate) }}</td>
                    <td><StatusChip :status="item.status" /></td>
                    <td>
                      {{
                        item.plannedDestination
                          ? DISPOSITION_LABELS[item.plannedDestination]
                          : 'Não definido'
                      }}
                    </td>
                    <td class="text-right text-no-wrap">
                      <v-btn
                        size="small"
                        variant="tonal"
                        color="primary"
                        class="text-none"
                        prepend-icon="mdi-delete-sweep-outline"
                        :aria-label="`Destinar item ${item.id}`"
                        :disabled="!hasAdminAccess"
                        @click="openDisposition(item)"
                      >
                        Destinar
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card>

          <EmptyState
            v-else-if="!eligibleLoading && !eligiblePageWithoutResults"
            icon="mdi-delete-clock-outline"
            title="Nenhum item elegível"
            description="Execute o processamento de elegibilidade no Dashboard após configurar as regras de destinação."
          />

          <PaginationFooter
            v-if="eligiblePagination.total > 0"
            :page="eligiblePage"
            :total-pages="eligiblePagination.total_pages"
            :total-elements="eligiblePagination.total"
            :limit="eligiblePerPage"
            :disabled="eligibleLoading"
            @update:page="changeEligiblePage"
            @update:limit="changeEligibleLimit"
          />
        </template>
      </LoadingOverlay>
    </template>

    <template v-else>
      <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
        <v-row density="compact" align="center">
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="draftHistoryFilters.destination"
              :items="historyDestinationOptions"
              item-title="title"
              item-value="value"
              label="Tipo de destinação"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <DatePickerField v-model="draftHistoryFilters.from" label="De" />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <DatePickerField v-model="draftHistoryFilters.to" label="Até" />
          </v-col>
          <v-col cols="12" sm="6" md="3" class="d-flex justify-end flex-wrap ga-2">
            <v-btn
              variant="text"
              class="text-none"
              :disabled="!hasAdminAccess"
              @click="clearHistoryFilters"
            >
              Limpar
            </v-btn>
            <v-btn
              color="primary"
              class="text-none"
              prepend-icon="mdi-filter-outline"
              :disabled="!hasAdminAccess"
              @click="applyHistoryFilters"
            >
              Filtrar
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <v-alert v-if="historyFilterError" type="warning" variant="tonal" class="mb-4 rounded-lg">
        {{ historyFilterError }}
      </v-alert>

      <ErrorAlert v-if="historyError" :error="historyError" @retry="loadHistory()" />

      <v-alert
        v-if="historyPageWithoutResults"
        type="info"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>A página solicitada não possui destinações.</span>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            class="text-none"
            @click="returnToFirstHistoryPage"
          >
            Ir para a página 1
          </v-btn>
        </div>
      </v-alert>

      <LoadingOverlay :loading="historyLoading" text="Carregando histórico de destinações...">
        <template v-if="!historyError">
          <v-card
            v-if="history.length > 0"
            variant="flat"
            class="rounded-lg border overflow-hidden"
          >
            <div class="overflow-x-auto">
              <v-table hover>
                <thead>
                  <tr>
                    <th class="text-left">Destinação</th>
                    <th class="text-left">Item</th>
                    <th class="text-left">Tipo</th>
                    <th class="text-left">Documento</th>
                    <th class="text-left">Administrador</th>
                    <th class="text-left">Data e hora</th>
                    <th class="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="disposition in history" :key="disposition.id">
                    <td class="font-weight-medium">#{{ disposition.id }}</td>
                    <td>{{ disposition.item?.title ?? `Item #${disposition.itemId}` }}</td>
                    <td>{{ DISPOSITION_LABELS[disposition.destination] }}</td>
                    <td>{{ disposition.receiverDocument }}</td>
                    <td>
                      {{ disposition.admin?.name ?? `Admin #${disposition.adminId}` }}
                    </td>
                    <td>{{ formatDateTime(disposition.executedAt) }}</td>
                    <td class="text-right text-no-wrap">
                      <v-btn
                        icon="mdi-eye-outline"
                        size="small"
                        variant="text"
                        color="primary"
                        :aria-label="`Ver detalhes da destinação ${disposition.id}`"
                        title="Ver detalhes"
                        @click="openDetails(disposition.id)"
                      />
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card>

          <EmptyState
            v-else-if="!historyLoading && !historyPageWithoutResults"
            icon="mdi-delete-sweep-outline"
            :title="hasHistoryFilters ? 'Nenhuma destinação encontrada' : 'Nenhuma destinação registrada'"
            :description="
              hasHistoryFilters
                ? 'Nenhuma destinação corresponde aos filtros informados.'
                : 'As destinações executadas aparecerão aqui, mesmo que o item mude de status.'
            "
          />

          <PaginationFooter
            v-if="historyPagination.total > 0"
            :page="historyPage"
            :total-pages="historyPagination.total_pages"
            :total-elements="historyPagination.total"
            :limit="historyPerPage"
            :disabled="historyLoading"
            @update:page="changeHistoryPage"
            @update:limit="changeHistoryLimit"
          />
        </template>
      </LoadingOverlay>
    </template>

    <DispositionDialog
      v-model="dispositionDialogOpen"
      :item="selectedItem"
      @created="handleDispositionCreated"
      @conflict="handleDispositionConflict"
    />

    <v-dialog v-model="detailOpen" max-width="620" persistent>
      <v-card class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          Detalhes da destinação {{ detail ? `#${detail.id}` : '' }}
        </v-card-title>

        <v-card-text class="px-4 py-3">
          <LoadingOverlay :loading="detailLoading" text="Carregando detalhes...">
            <v-alert v-if="detailNotFound" type="warning" variant="tonal" class="rounded-lg">
              Destinação não encontrada.
            </v-alert>

            <ErrorAlert v-else-if="detailError" :error="detailError" @retry="retryDetails" />

            <div v-else-if="detail" class="d-flex flex-column ga-3 text-body-1">
              <div><strong>Destinação:</strong> #{{ detail.id }}</div>
              <div><strong>Data e hora:</strong> {{ formatDateTime(detail.executedAt) }}</div>
              <v-divider />
              <div>
                <strong>Item:</strong>
                {{ detail.item?.title ?? `Item #${detail.itemId}` }}
                <span class="text-medium-emphasis">(ID #{{ detail.itemId }})</span>
              </div>
              <div v-if="detail.item?.category">
                <strong>Categoria:</strong> {{ detail.item.category.name }}
              </div>
              <div v-if="detail.item?.building">
                <strong>Prédio:</strong> {{ detail.item.building.name }}
              </div>
              <v-divider />
              <div>
                <strong>Tipo:</strong> {{ DISPOSITION_LABELS[detail.destination] }}
              </div>
              <div>
                <strong>Documento do destinatário:</strong> {{ detail.receiverDocument }}
              </div>
              <v-divider />
              <div>
                <strong>Administrador:</strong>
                {{ detail.admin?.name ?? `Admin #${detail.adminId}` }}
              </div>
            </div>
          </LoadingOverlay>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="closeDetails">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
