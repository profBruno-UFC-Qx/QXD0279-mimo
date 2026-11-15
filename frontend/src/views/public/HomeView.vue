<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import FilterBar from '@/components/common/FilterBar.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import ItemCard from '@/components/domain/ItemCard.vue'
import { usePagination } from '@/composables/usePagination'
import { itemService } from '@/services/item.service'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import type { ItemQuery, PublicCatalogItem } from '@/types'

const queryText = ref('')
const buildingId = ref<number | null>()
const categoryId = ref<number | null>()
const filters = ref<ItemQuery>({})
const buildingsStore = useBuildingsStore()
const categoriesStore = useCategoriesStore()
const { items, page, limit, total, loading, error, load } = usePagination<PublicCatalogItem, ItemQuery>(itemService.list)
const totalPages = computed(() => Math.ceil(total.value / limit.value))

function retryCatalog() {
  void load(filters.value)
  if (buildingsStore.error && !buildingsStore.loading) {
    void buildingsStore.ensureLoaded(true)
  }
  if (categoriesStore.error && !categoriesStore.loading) {
    void categoriesStore.ensureLoaded(true)
  }
}

function applyFilters() {
  page.value = 1
  filters.value = {
    search: queryText.value.trim() || undefined,
    buildingId: buildingId.value ?? undefined,
    categoryId: categoryId.value ?? undefined,
  }
  void load(filters.value)
}

function clearFilters() {
  queryText.value = ''
  buildingId.value = undefined
  categoryId.value = undefined
  applyFilters()
}

function changePage(nextPage: number) {
  page.value = nextPage
  void load(filters.value)
}

function changeLimit(nextLimit: number) {
  limit.value = nextLimit
  page.value = 1
  void load(filters.value)
}

onMounted(() => { void load(filters.value) })
</script>

<template>
  <PageHeader
    title="Itens encontrados"
    subtitle="Consulte objetos encontrados nos prédios da instituição."
  />

  <FilterBar v-model:q="queryText" @submit="applyFilters" @clear="clearFilters">
    <v-col cols="12" md="3">
      <BuildingSelect
        v-model="buildingId"
        label="Prédio"
        placeholder="Todos os prédios"
        hide-details
      />
    </v-col>
    <v-col cols="12" md="3">
      <CategorySelect
        v-model="categoryId"
        label="Categoria"
        placeholder="Todas as categorias"
        hide-details
      />
    </v-col>
  </FilterBar>

  <ErrorAlert v-if="error" @retry="retryCatalog" />

  <LoadingOverlay :loading="loading" text="Carregando itens...">
    <v-row v-if="Array.isArray(items) && items.length" class="mb-2">
      <v-col v-for="item in items" :key="item.id" cols="12" sm="6" md="4" lg="3">
        <ItemCard :item="item" />
      </v-col>
    </v-row>
    <EmptyState
      v-else-if="!loading && !error"
      title="Nenhum item encontrado"
      description="Tente alterar os filtros ou volte mais tarde para consultar novos itens."
    />
  </LoadingOverlay>

  <PaginationFooter
    v-if="!error"
    :page="page"
    :total-pages="totalPages"
    :total-elements="total"
    :limit="limit"
    :disabled="loading"
    @update:page="changePage"
    @update:limit="changeLimit"
  />
</template>
