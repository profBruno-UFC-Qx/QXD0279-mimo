<script setup lang="ts">
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminItemFilters from '@/components/form/AdminItemFilters.vue'
import AdminItemsList from '@/components/domain/AdminItemsList.vue'
import { useAdminItems } from '@/composables/admin/useAdminItems'

const {
  hasAdminAccess,
  loading,
  loadItems,
  search,
  categoryId,
  buildingId,
  status,
  loadError,
  items,
  categoryLabel,
  buildingLabel,
  deletingId,
  hasFilters,
  pagination,
  currentPage,
  perPage,
  openDetails,
  openEdit,
  requestDelete,
  changePage,
  changeLimit,
} = useAdminItems()
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Itens"
      subtitle="Cadastre, consulte e atualize os objetos encontrados nos prédios da instituição."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <RefreshButton
            :disabled="!hasAdminAccess"
            :loading="loading"
            @refresh="loadItems()"
          />
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

    <AdminItemFilters
      v-model:search="search"
      v-model:category-id="categoryId"
      v-model:building-id="buildingId"
      v-model:status="status"
    />

    <ErrorAlert v-if="loadError" :error="loadError" @retry="loadItems()" />

    <AdminItemsList
      :loading="loading"
      :load-error="loadError"
      :items="items"
      :category-label="categoryLabel"
      :building-label="buildingLabel"
      :deleting-id="deletingId"
      :has-filters="hasFilters"
      :pagination="pagination"
      :current-page="currentPage"
      :per-page="perPage"
      @open-details="openDetails"
      @open-edit="openEdit"
      @request-delete="requestDelete"
      @change-page="changePage"
      @change-limit="changeLimit"
    />
  </div>
</template>
