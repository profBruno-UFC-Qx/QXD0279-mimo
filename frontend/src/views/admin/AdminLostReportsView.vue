<script setup lang="ts">
import PageOutOfRangeAlert from '@/components/common/PageOutOfRangeAlert.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminLostReportFilters from '@/components/form/AdminLostReportFilters.vue'
import AdminLostReportsList from '@/components/domain/AdminLostReportsList.vue'
import AdminLostReportDetailsDialog from '@/components/domain/AdminLostReportDetailsDialog.vue'
import { useAdminLostReports } from '@/composables/admin/useAdminLostReports'

const {
  loadingList,
  hasAdminAccess,
  loadReports,
  draftFilters,
  categoryOptions,
  buildingOptions,
  applyFilters,
  clearFilters,
  resolveError,
  resolveRecoveryReportId,
  checkingRecovery,
  reconcileReportStateByGet,
  resolveNotFoundNotice,
  listError,
  outOfRangeError,
  returnToFirstPage,
  reports,
  pagination,
  formatCategoryLabel,
  formatBuildingLabel,
  currentPage,
  perPage,
  openDetails,
  handlePageChange,
  handleLimitChange,
  detailDialogOpen,
  selectedReportId,
  detailReport,
  loadingDetail,
  detailNotFound,
  detailError,
  closeDetails,
  retryDetail,
} = useAdminLostReports()
</script>

<template>
  <div>
    <PageHeader
      title="Relatos de Perdas"
      subtitle="Gerencie os relatos de perda registrados pelos usuários."
    >
      <template #actions>
        <RefreshButton
          :disabled="loadingList || !hasAdminAccess"
          @refresh="loadReports()"
        />
      </template>
    </PageHeader>

    <AdminLostReportFilters
      v-model:draft-filters="draftFilters"
      :has-admin-access="hasAdminAccess"
      :category-options="categoryOptions"
      :building-options="buildingOptions"
      @apply-filters="applyFilters"
      @clear-filters="clearFilters"
    />

    <v-alert
      v-if="resolveError"
      type="warning"
      variant="tonal"
      class="mb-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ resolveError }}</span>
        <div class="d-flex align-center ga-2">
          <v-btn
            v-if="resolveRecoveryReportId !== null"
            size="small"
            variant="outlined"
            color="warning"
            class="text-none"
            :loading="checkingRecovery"
            @click="reconcileReportStateByGet(resolveRecoveryReportId)"
          >
            Consultar estado atual
          </v-btn>
          <v-btn
            v-if="resolveNotFoundNotice"
            size="small"
            variant="outlined"
            color="warning"
            class="text-none"
            @click="loadReports()"
          >
            Recarregar listagem
          </v-btn>
        </div>
      </div>
    </v-alert>

    <ErrorAlert
      v-if="listError"
      :error="listError"
      @retry="loadReports()"
    />

    <PageOutOfRangeAlert v-if="outOfRangeError" action-label="Ir para página 1" @reset="returnToFirstPage">
      A página solicitada não possui registros disponíveis no momento.
    </PageOutOfRangeAlert>

    <AdminLostReportsList
      :loading-list="loadingList"
      :list-error="listError"
      :out-of-range-error="outOfRangeError"
      :has-admin-access="hasAdminAccess"
      :reports="reports"
      :pagination="pagination"
      :format-category-label="formatCategoryLabel"
      :format-building-label="formatBuildingLabel"
      :current-page="currentPage"
      :per-page="perPage"
      @open-details="openDetails"
      @handle-page-change="handlePageChange"
      @handle-limit-change="handleLimitChange"
    />

    <AdminLostReportDetailsDialog
      v-model:detail-dialog-open="detailDialogOpen"
      :selected-report-id="selectedReportId"
      :detail-report="detailReport"
      :loading-detail="loadingDetail"
      :detail-not-found="detailNotFound"
      :detail-error="detailError"
      :format-category-label="formatCategoryLabel"
      :format-building-label="formatBuildingLabel"
      @close-details="closeDetails"
      @retry-detail="retryDetail"
    />
  </div>
</template>
