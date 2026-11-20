<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AdminHandoverQuery, Handover, PaginationMeta } from '@/types'
import { handoverService } from '@/services/handover.service'
import { useAuthStore } from '@/stores/authStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import { formatCpf, formatDateTime } from '@/utils/format'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'

interface HandoverFilters {
  itemId: string
  adminId: string
  from: string | null
  to: string | null
}

const DEFAULT_PER_PAGE = 12

const auth = useAuthStore()

const handovers = ref<Handover[]>([])
const pagination = ref<PaginationMeta>({
  total: 0,
  page: 1,
  per_page: DEFAULT_PER_PAGE,
  total_pages: 0,
})
const currentPage = ref(1)
const perPage = ref(DEFAULT_PER_PAGE)

const draftFilters = ref<HandoverFilters>({ itemId: '', adminId: '', from: null, to: null })
const appliedFilters = ref<HandoverFilters>({ itemId: '', adminId: '', from: null, to: null })
const filterError = ref<string | null>(null)

const loading = ref(false)
const listError = ref<string | null>(null)

const detailOpen = ref(false)
const detailId = ref<number | null>(null)
const detail = ref<Handover | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const detailNotFound = ref(false)

let latestListRequestId = 0
let latestDetailRequestId = 0

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const hasFilters = computed(
  () =>
    appliedFilters.value.itemId.trim() !== '' ||
    appliedFilters.value.adminId.trim() !== '' ||
    appliedFilters.value.from !== null ||
    appliedFilters.value.to !== null,
)
const pageWithoutResults = computed(
  () =>
    !loading.value &&
    listError.value === null &&
    handovers.value.length === 0 &&
    pagination.value.total > 0 &&
    currentPage.value > 1,
)

function parseOptionalId(value: string): number | undefined | null {
  const text = value.trim()
  if (text === '') return undefined
  if (!/^[1-9]\d*$/.test(text)) return null
  const id = Number(text)
  return isPositiveSafeId(id) ? id : null
}

function buildQuery(): AdminHandoverQuery {
  const query: AdminHandoverQuery = {
    page: currentPage.value,
    per_page: perPage.value,
  }
  const itemId = parseOptionalId(appliedFilters.value.itemId)
  if (typeof itemId === 'number') query.itemId = itemId
  const adminId = parseOptionalId(appliedFilters.value.adminId)
  if (typeof adminId === 'number') query.adminId = adminId
  if (appliedFilters.value.from !== null) query.from = appliedFilters.value.from
  if (appliedFilters.value.to !== null) query.to = appliedFilters.value.to
  return query
}

async function loadHandovers() {
  if (!hasAdminAccess.value) return

  const requestId = ++latestListRequestId
  loading.value = true
  listError.value = null

  try {
    const res = await handoverService.list(buildQuery())
    if (requestId !== latestListRequestId) return
    handovers.value = res.data
    pagination.value = res.pagination
  } catch (err: unknown) {
    if (requestId !== latestListRequestId) return
    handovers.value = []
    pagination.value = {
      total: 0,
      page: currentPage.value,
      per_page: perPage.value,
      total_pages: 0,
    }
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 403) {
      listError.value = 'Sua sessão não possui permissão administrativa para consultar entregas.'
    } else {
      listError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar as entregas. Tente novamente.',
      )
    }
  } finally {
    if (requestId === latestListRequestId) {
      loading.value = false
    }
  }
}

function applyFilters() {
  if (!hasAdminAccess.value) return
  const itemId = parseOptionalId(draftFilters.value.itemId)
  const adminId = parseOptionalId(draftFilters.value.adminId)
  if (itemId === null || adminId === null) {
    filterError.value = 'Informe IDs inteiros positivos ou deixe os campos vazios.'
    return
  }
  filterError.value = null
  appliedFilters.value = { ...draftFilters.value }
  currentPage.value = 1
  void loadHandovers()
}

function clearFilters() {
  if (!hasAdminAccess.value) return
  draftFilters.value = { itemId: '', adminId: '', from: null, to: null }
  appliedFilters.value = { itemId: '', adminId: '', from: null, to: null }
  filterError.value = null
  currentPage.value = 1
  void loadHandovers()
}

function handlePageChange(nextPage: number) {
  if (!isPositiveSafeId(nextPage)) return
  currentPage.value = nextPage
  void loadHandovers()
}

function handleLimitChange(nextLimit: number) {
  if (!isPositiveSafeId(nextLimit)) return
  perPage.value = nextLimit
  currentPage.value = 1
  void loadHandovers()
}

function returnToFirstPage() {
  currentPage.value = 1
  void loadHandovers()
}

async function openDetails(handoverId: number) {
  if (!isPositiveSafeId(handoverId)) return

  const requestId = ++latestDetailRequestId
  detailOpen.value = true
  detailId.value = handoverId
  detail.value = null
  detailError.value = null
  detailNotFound.value = false
  detailLoading.value = true

  try {
    const res = await handoverService.getById(handoverId)
    if (requestId !== latestDetailRequestId) return
    detail.value = res
  } catch (err: unknown) {
    if (requestId !== latestDetailRequestId) return
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      detailNotFound.value = true
    } else if (httpStatus === 403) {
      detailError.value = 'Sua sessão não possui permissão administrativa para consultar entregas.'
    } else {
      detailError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os detalhes da entrega. Tente novamente.',
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

onMounted(() => {
  if (!hasAdminAccess.value) return
  void loadHandovers()
})
</script>

<template>
  <div>
    <PageHeader
      title="Entregas"
      subtitle="Consulte as retiradas presenciais registradas no sistema."
    >
      <template #actions>
        <v-btn
          variant="outlined"
          color="primary"
          class="text-none"
          prepend-icon="mdi-refresh"
          :disabled="!hasAdminAccess"
          :loading="loading"
          @click="loadHandovers()"
        >
          Atualizar
        </v-btn>
      </template>
    </PageHeader>

    <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
      <v-row density="compact" align="center">
        <v-col cols="12" sm="6" md="2">
          <v-text-field
            v-model="draftFilters.itemId"
            label="ID do item"
            variant="outlined"
            density="compact"
            inputmode="numeric"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <v-text-field
            v-model="draftFilters.adminId"
            label="ID do administrador"
            variant="outlined"
            density="compact"
            inputmode="numeric"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <DatePickerField v-model="draftFilters.from" label="De" />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <DatePickerField v-model="draftFilters.to" label="Até" />
        </v-col>
        <v-col cols="12" md="2" class="d-flex justify-end flex-wrap ga-2">
          <v-btn variant="text" class="text-none" :disabled="!hasAdminAccess" @click="clearFilters">
            Limpar
          </v-btn>
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-filter-outline"
            :disabled="!hasAdminAccess"
            @click="applyFilters"
          >
            Filtrar
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-alert v-if="filterError" type="warning" variant="tonal" class="mb-4 rounded-lg">
      {{ filterError }}
    </v-alert>

    <ErrorAlert v-if="listError" :error="listError" @retry="loadHandovers()" />

    <v-alert
      v-if="pageWithoutResults"
      type="info"
      variant="tonal"
      class="mb-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>A página solicitada não possui registros.</span>
        <v-btn size="small" variant="text" color="primary" class="text-none" @click="returnToFirstPage">
          Ir para a página 1
        </v-btn>
      </div>
    </v-alert>

    <LoadingOverlay :loading="loading" text="Carregando entregas...">
      <template v-if="!listError">
        <v-card v-if="handovers.length > 0" variant="flat" class="rounded-lg border overflow-hidden">
          <div class="overflow-x-auto">
            <v-table hover>
              <thead>
                <tr>
                  <th class="text-left">Entrega</th>
                  <th class="text-left">Item</th>
                  <th class="text-left">Retirante</th>
                  <th class="text-left">CPF</th>
                  <th class="text-left">Administrador</th>
                  <th class="text-left">Data e hora</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="handover in handovers" :key="handover.id">
                  <td class="font-weight-medium">#{{ handover.id }}</td>
                  <td>
                    {{ handover.item?.title ?? `Item #${handover.itemId}` }}
                  </td>
                  <td>{{ handover.withdrawnName }}</td>
                  <td>{{ formatCpf(handover.withdrawnCpf) || '—' }}</td>
                  <td>{{ handover.admin?.name ?? `Admin #${handover.adminId}` }}</td>
                  <td>{{ formatDateTime(handover.handedAt) }}</td>
                  <td class="text-right text-no-wrap">
                    <v-btn
                      icon="mdi-eye-outline"
                      size="small"
                      variant="text"
                      color="primary"
                      :aria-label="`Ver detalhes da entrega ${handover.id}`"
                      title="Ver detalhes"
                      @click="openDetails(handover.id)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card>

        <EmptyState
          v-else-if="!loading && !pageWithoutResults"
          icon="mdi-handshake-outline"
          :title="hasFilters ? 'Nenhuma entrega encontrada' : 'Nenhuma entrega registrada'"
          :description="
            hasFilters
              ? 'Nenhuma retirada corresponde aos filtros informados.'
              : 'As retiradas registradas a partir dos itens encontrados aparecerão aqui.'
          "
        />

        <PaginationFooter
          v-if="pagination.total > 0"
          :page="currentPage"
          :total-pages="pagination.total_pages"
          :total-elements="pagination.total"
          :limit="perPage"
          :disabled="loading"
          @update:page="handlePageChange"
          @update:limit="handleLimitChange"
        />
      </template>
    </LoadingOverlay>

    <v-dialog v-model="detailOpen" max-width="620" persistent>
      <v-card class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          Detalhes da entrega {{ detail ? `#${detail.id}` : '' }}
        </v-card-title>

        <v-card-text class="px-4 py-3">
          <LoadingOverlay :loading="detailLoading" text="Carregando detalhes...">
            <v-alert v-if="detailNotFound" type="warning" variant="tonal" class="rounded-lg">
              Entrega não encontrada.
            </v-alert>

            <ErrorAlert v-else-if="detailError" :error="detailError" @retry="retryDetails" />

            <div v-else-if="detail" class="d-flex flex-column ga-3 text-body-1">
              <div><strong>Entrega:</strong> #{{ detail.id }}</div>
              <div><strong>Data e hora:</strong> {{ formatDateTime(detail.handedAt) }}</div>
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
              <div><strong>Retirante:</strong> {{ detail.withdrawnName }}</div>
              <div><strong>CPF:</strong> {{ formatCpf(detail.withdrawnCpf) || '—' }}</div>
              <div>
                <strong>Conta associada:</strong>
                <template v-if="detail.withdrawnUser">
                  {{ detail.withdrawnUser.name }} ({{ detail.withdrawnUser.email }})
                </template>
                <template v-else-if="detail.withdrawnUserId !== null">
                  Usuário #{{ detail.withdrawnUserId }}
                </template>
                <template v-else>Não associada</template>
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
