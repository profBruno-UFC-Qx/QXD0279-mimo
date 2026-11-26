<script setup lang="ts">
import PageOutOfRangeAlert from '@/components/common/PageOutOfRangeAlert.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import HandoverFiltersForm from '@/components/form/HandoverFiltersForm.vue'
import AdminHandoversList from '@/components/domain/AdminHandoversList.vue'
import HandoverDetailsDialog from '@/components/domain/HandoverDetailsDialog.vue'
import { useAdminHandovers } from '@/composables/admin/useAdminHandovers'

const {
  hasAdminAccess,
  loading,
  loadHandovers,
  draftFilters,
  applyFilters,
  clearFilters,
  filterError,
  listError,
  pageWithoutResults,
  returnToFirstPage,
  handovers,
  hasFilters,
  pagination,
  currentPage,
  perPage,
  openDetails,
  handlePageChange,
  handleLimitChange,
  detailOpen,
  detail,
  detailLoading,
  detailNotFound,
  detailError,
  closeDetails,
  retryDetails,
} = useAdminHandovers()
</script>

<template>
  <div>
    <PageHeader
      title="Entregas"
      subtitle="Consulte as retiradas presenciais registradas no sistema."
    >
      <template #actions>
        <RefreshButton
          :disabled="!hasAdminAccess"
          :loading="loading"
          @refresh="loadHandovers()"
        />
      </template>
    </PageHeader>

    <HandoverFiltersForm
      v-model:draft-filters="draftFilters"
      :has-admin-access="hasAdminAccess"
      @apply-filters="applyFilters"
      @clear-filters="clearFilters"
    />

    <v-alert v-if="filterError" type="warning" variant="tonal" class="mb-4 rounded-lg">
      {{ filterError }}
    </v-alert>

    <ErrorAlert v-if="listError" :error="listError" @retry="loadHandovers()" />

    <PageOutOfRangeAlert v-if="pageWithoutResults" @reset="returnToFirstPage">
      A página solicitada não possui registros.
    </PageOutOfRangeAlert>

    <AdminHandoversList
      :loading="loading"
      :list-error="listError"
      :handovers="handovers"
      :page-without-results="pageWithoutResults"
      :has-filters="hasFilters"
      :pagination="pagination"
      :current-page="currentPage"
      :per-page="perPage"
      @open-details="openDetails"
      @handle-page-change="handlePageChange"
      @handle-limit-change="handleLimitChange"
    />

    <HandoverDetailsDialog
      v-model:detail-open="detailOpen"
      :detail="detail"
      :detail-loading="detailLoading"
      :detail-not-found="detailNotFound"
      :detail-error="detailError"
      @close-details="closeDetails"
      @retry-details="retryDetails"
    />
  </div>
</template>
