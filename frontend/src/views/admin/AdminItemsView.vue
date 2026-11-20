<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AdminItemQuery, Item, ItemStatus, PaginationMeta } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { useAuthStore } from '@/stores/authStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import { formatDate } from '@/utils/format'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'
import { ITEM_STATUS_META } from '@/utils/status'

const DEFAULT_PER_PAGE = 12
const SEARCH_DEBOUNCE_MS = 350

const statusOptions: Array<{ title: string; value: ItemStatus | null }> = [
  { title: 'Todos', value: null },
  ...(Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((status) => ({
    title: ITEM_STATUS_META[status].label,
    value: status,
  })),
]

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()

const items = ref<Item[]>([])
const pagination = ref<PaginationMeta>({
  total: 0,
  page: 1,
  per_page: DEFAULT_PER_PAGE,
  total_pages: 0,
})
const currentPage = ref(1)
const perPage = ref(DEFAULT_PER_PAGE)
const search = ref('')
const categoryId = ref<number | null>(null)
const buildingId = ref<number | null>(null)
const status = ref<ItemStatus | null>(null)

const loading = ref(false)
const loadError = ref<string | null>(null)
const deletingId = ref<number | null>(null)

let latestRequestId = 0
let filterTimer: ReturnType<typeof setTimeout> | null = null

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const hasFilters = computed(
  () =>
    search.value.trim() !== '' ||
    categoryId.value !== null ||
    buildingId.value !== null ||
    status.value !== null,
)

const categoryNames = computed(() => new Map(categoriesStore.items.map((c) => [c.id, c.name])))
const buildingNames = computed(() => new Map(buildingsStore.items.map((b) => [b.id, b.name])))

function categoryLabel(id: number): string {
  return categoryNames.value.get(id) ?? `Categoria #${id}`
}

function buildingLabel(id: number): string {
  return buildingNames.value.get(id) ?? `Prédio #${id}`
}

function buildQuery(): AdminItemQuery {
  const query: AdminItemQuery = { page: currentPage.value, per_page: perPage.value }
  const trimmedSearch = search.value.trim()
  if (trimmedSearch !== '') query.search = trimmedSearch
  if (categoryId.value !== null) query.categoryId = categoryId.value
  if (buildingId.value !== null) query.buildingId = buildingId.value
  if (status.value !== null) query.status = status.value
  return query
}

async function loadItems() {
  if (!hasAdminAccess.value) return
  if (filterTimer) {
    clearTimeout(filterTimer)
    filterTimer = null
  }

  const requestId = ++latestRequestId
  loading.value = true
  loadError.value = null

  try {
    const res = await adminItemService.list(buildQuery())
    if (requestId !== latestRequestId) return
    items.value = res.data
    pagination.value = res.pagination
  } catch (err: unknown) {
    if (requestId !== latestRequestId) return
    items.value = []
    pagination.value = {
      total: 0,
      page: currentPage.value,
      per_page: perPage.value,
      total_pages: 0,
    }
    const httpStatus = getErrorStatus(err)
    loadError.value =
      httpStatus === 403
        ? 'Sua sessão não possui permissão administrativa para listar itens.'
        : extractLostReportErrorMessage(err, 'Não foi possível carregar os itens. Tente novamente.')
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

function changePage(nextPage: number) {
  if (!isPositiveSafeId(nextPage)) return
  currentPage.value = nextPage
  void loadItems()
}

function changeLimit(nextLimit: number) {
  if (!isPositiveSafeId(nextLimit)) return
  perPage.value = nextLimit
  currentPage.value = 1
  void loadItems()
}

function openDetails(item: Item) {
  void router.push({ name: 'admin-item-detail', params: { id: item.id } })
}

function openEdit(item: Item) {
  if (!isItemEditable(item.status)) return
  void router.push({ name: 'admin-item-edit', params: { id: item.id } })
}

async function requestDelete(item: Item) {
  if (!hasAdminAccess.value || !isItemEditable(item.status) || deletingId.value !== null) return

  const confirmed = await ui.confirm({
    title: 'Excluir item?',
    message: `Deseja realmente excluir "${item.title}"? Itens com histórico não podem ser excluídos.`,
    danger: true,
    confirmText: 'Excluir item',
    cancelText: 'Cancelar',
  })
  if (!confirmed) return

  deletingId.value = item.id
  try {
    await adminItemService.remove(item.id)
    ui.notifySuccess('Item excluído com sucesso.')
    if (items.value.length === 1 && currentPage.value > 1) {
      currentPage.value -= 1
    }
    await loadItems()
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      ui.notifyError('Este item já foi removido anteriormente.')
      await loadItems()
    } else if (httpStatus === 409) {
      ui.notifyError(
        extractLostReportErrorMessage(
          err,
          'Este item possui histórico e não pode ser excluído.',
        ),
      )
    } else if (httpStatus === 403) {
      ui.notifyError('Sua sessão não possui permissão administrativa para excluir itens.')
    } else {
      ui.notifyError(extractLostReportErrorMessage(err, 'Não foi possível excluir o item.'))
    }
  } finally {
    deletingId.value = null
  }
}

watch([search, categoryId, buildingId, status], () => {
  if (!hasAdminAccess.value) return
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    filterTimer = null
    currentPage.value = 1
    void loadItems()
  }, SEARCH_DEBOUNCE_MS)
})

onMounted(() => {
  if (!hasAdminAccess.value) return
  void loadItems()
  void categoriesStore.ensureLoaded()
  void buildingsStore.ensureLoaded()
})

onBeforeUnmount(() => {
  ++latestRequestId
  if (filterTimer) {
    clearTimeout(filterTimer)
    filterTimer = null
  }
})
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Itens"
      subtitle="Cadastre, consulte e atualize os objetos encontrados nos prédios da instituição."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-refresh"
            :disabled="!hasAdminAccess"
            :loading="loading"
            @click="loadItems()"
          >
            Atualizar
          </v-btn>
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            :disabled="!hasAdminAccess"
            :to="{ name: 'admin-item-new' }"
          >
            Novo item
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
      <v-row density="compact" align="center">
        <v-col cols="12" md="4">
          <v-text-field
            v-model="search"
            label="Buscar por título ou descrição"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <CategorySelect
            v-model="categoryId"
            label="Categoria"
            placeholder="Todas"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <BuildingSelect
            v-model="buildingId"
            label="Prédio"
            placeholder="Todos"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <v-select
            v-model="status"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            label="Status"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-col>
      </v-row>
    </v-card>

    <ErrorAlert v-if="loadError" :error="loadError" @retry="loadItems()" />

    <LoadingOverlay :loading="loading" text="Carregando itens...">
      <template v-if="!loadError">
        <v-card v-if="items.length > 0" variant="flat" class="rounded-lg border overflow-hidden">
          <div class="overflow-x-auto">
            <v-table hover>
              <thead>
                <tr>
                  <th class="text-left">Item</th>
                  <th class="text-left">Categoria</th>
                  <th class="text-left">Prédio</th>
                  <th class="text-left">Achado em</th>
                  <th class="text-left">Status</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in items" :key="item.id">
                  <td class="font-weight-medium">{{ item.title }}</td>
                  <td>{{ categoryLabel(item.categoryId) }}</td>
                  <td>{{ buildingLabel(item.buildingId) }}</td>
                  <td>{{ formatDate(item.foundDate) }}</td>
                  <td><StatusChip :status="item.status" /></td>
                  <td class="text-right text-no-wrap">
                    <v-btn
                      icon="mdi-eye-outline"
                      size="small"
                      variant="text"
                      color="primary"
                      aria-label="Ver detalhes"
                      title="Ver detalhes"
                      @click="openDetails(item)"
                    />
                    <v-btn
                      icon="mdi-pencil-outline"
                      size="small"
                      variant="text"
                      color="primary"
                      aria-label="Editar item"
                      title="Editar item"
                      :disabled="!isItemEditable(item.status) || deletingId !== null"
                      @click="openEdit(item)"
                    />
                    <v-btn
                      icon="mdi-delete-outline"
                      size="small"
                      variant="text"
                      color="error"
                      aria-label="Excluir item"
                      title="Excluir item"
                      :disabled="!isItemEditable(item.status) || deletingId !== null"
                      :loading="deletingId === item.id"
                      @click="requestDelete(item)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card>

        <EmptyState
          v-else-if="!loading"
          icon="mdi-package-variant-closed"
          :title="hasFilters ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'"
          :description="
            hasFilters
              ? 'Nenhum item corresponde aos filtros informados.'
              : 'Cadastre o primeiro item encontrado para disponibilizá-lo no catálogo.'
          "
        />

        <PaginationFooter
          v-if="pagination.total > 0"
          :page="currentPage"
          :total-pages="pagination.total_pages"
          :total-elements="pagination.total"
          :limit="perPage"
          :disabled="loading"
          @update:page="changePage"
          @update:limit="changeLimit"
        />
      </template>
    </LoadingOverlay>
  </div>
</template>
