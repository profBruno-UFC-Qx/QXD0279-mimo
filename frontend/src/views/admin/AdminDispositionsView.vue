<script setup lang="ts">
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import DispositionDialog from '@/components/domain/DispositionDialog.vue'
import EligibleItemsList from '@/components/domain/EligibleItemsList.vue'
import DispositionHistory from '@/components/domain/DispositionHistory.vue'
import DispositionDetailsDialog from '@/components/domain/DispositionDetailsDialog.vue'
import { useAdminDispositions } from '@/composables/admin/useAdminDispositions'

const {
  hasAdminAccess,
  eligibleLoading,
  historyLoading,
  refreshAll,
  activeSection,
  eligibleError,
  eligiblePageWithoutResults,
  eligibleItems,
  categoryLabel,
  buildingLabel,
  eligiblePagination,
  eligiblePage,
  eligiblePerPage,
  loadEligibleItems,
  returnToFirstEligiblePage,
  openDisposition,
  changeEligiblePage,
  changeEligibleLimit,
  draftHistoryFilters,
  historyFilterError,
  historyError,
  historyPageWithoutResults,
  history,
  hasHistoryFilters,
  historyPagination,
  historyPage,
  historyPerPage,
  applyHistoryFilters,
  clearHistoryFilters,
  loadHistory,
  returnToFirstHistoryPage,
  openDetails,
  changeHistoryPage,
  changeHistoryLimit,
  dispositionDialogOpen,
  selectedItem,
  handleDispositionCreated,
  handleDispositionConflict,
  detailOpen,
  detail,
  detailLoading,
  detailNotFound,
  detailError,
  closeDetails,
  retryDetails,
} = useAdminDispositions()
</script>

<template>
  <div>
    <PageHeader
      title="Destinações"
      subtitle="Consulte itens elegíveis e registre a destinação após o prazo configurado."
    >
      <template #actions>
        <RefreshButton
          :disabled="!hasAdminAccess"
          :loading="eligibleLoading || historyLoading"
          @refresh="refreshAll"
        />
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
      <EligibleItemsList
        :eligible-error="eligibleError"
        :eligible-page-without-results="eligiblePageWithoutResults"
        :eligible-loading="eligibleLoading"
        :eligible-items="eligibleItems"
        :category-label="categoryLabel"
        :building-label="buildingLabel"
        :has-admin-access="hasAdminAccess"
        :eligible-pagination="eligiblePagination"
        :eligible-page="eligiblePage"
        :eligible-per-page="eligiblePerPage"
        @load-eligible-items="loadEligibleItems"
        @return-to-first-eligible-page="returnToFirstEligiblePage"
        @open-disposition="openDisposition"
        @change-eligible-page="changeEligiblePage"
        @change-eligible-limit="changeEligibleLimit"
      />
    </template>

    <template v-else>
      <DispositionHistory
        v-model:draft-history-filters="draftHistoryFilters"
        :has-admin-access="hasAdminAccess"
        :history-filter-error="historyFilterError"
        :history-error="historyError"
        :history-page-without-results="historyPageWithoutResults"
        :history-loading="historyLoading"
        :history="history"
        :has-history-filters="hasHistoryFilters"
        :history-pagination="historyPagination"
        :history-page="historyPage"
        :history-per-page="historyPerPage"
        @apply-history-filters="applyHistoryFilters"
        @clear-history-filters="clearHistoryFilters"
        @load-history="loadHistory"
        @return-to-first-history-page="returnToFirstHistoryPage"
        @open-details="openDetails"
        @change-history-page="changeHistoryPage"
        @change-history-limit="changeHistoryLimit"
      />
    </template>

    <DispositionDialog
      v-model="dispositionDialogOpen"
      :item="selectedItem"
      @created="handleDispositionCreated"
      @conflict="handleDispositionConflict"
    />

    <DispositionDetailsDialog
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
