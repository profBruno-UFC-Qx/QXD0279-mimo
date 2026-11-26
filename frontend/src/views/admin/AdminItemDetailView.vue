<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import HandoverDialog from '@/components/domain/HandoverDialog.vue'
import AdminItemOverview from '@/components/domain/AdminItemOverview.vue'
import AdminItemPossibleOwners from '@/components/domain/AdminItemPossibleOwners.vue'
import ResolvePossibleOwnerDialog from '@/components/domain/ResolvePossibleOwnerDialog.vue'
import { useAdminItemDetail } from '@/composables/admin/useAdminItemDetail'

const {
  goBack,
  details,
  canDeliver,
  deleting,
  handoverDialogOpen,
  hasAdminAccess,
  isEditable,
  openEdit,
  requestDelete,
  deleteError,
  notFound,
  loadError,
  loadDetails,
  loading,
  categoryName,
  buildingName,
  ownersLoading,
  ownersError,
  possibleOwners,
  loadPossibleOwners,
  openReport,
  handleHandoverCreated,
  handleHandoverConflict,
  reportDialogOpen,
  selectedReport,
  reportLoading,
  reportError,
  categoryLabel,
  buildingLabel,
  reportChecking,
  resolvingReport,
  closeReportDialog,
  confirmResolveReport,
  retryReportLoad,
} = useAdminItemDetail()
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
            v-if="details && canDeliver"
            color="primary"
            class="text-none"
            prepend-icon="mdi-handshake-outline"
            :disabled="deleting"
            @click="handoverDialogOpen = true"
          >
            Registrar entrega
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
      <AdminItemOverview
        :details="details"
        :category-name="categoryName"
        :building-name="buildingName"
        :is-editable="isEditable"
      />

      <AdminItemPossibleOwners
        :details="details"
        :owners-loading="ownersLoading"
        :owners-error="ownersError"
        :possible-owners="possibleOwners"
        @load-possible-owners="loadPossibleOwners"
        @open-report="openReport"
      />
    </LoadingOverlay>

    <HandoverDialog
      v-if="details"
      v-model="handoverDialogOpen"
      :item="details.item"
      @created="handleHandoverCreated"
      @conflict="handleHandoverConflict"
    />

    <ResolvePossibleOwnerDialog
      v-model:report-dialog-open="reportDialogOpen"
      :selected-report="selectedReport"
      :report-loading="reportLoading"
      :report-error="reportError"
      :category-label="categoryLabel"
      :building-label="buildingLabel"
      :report-checking="reportChecking"
      :resolving-report="resolvingReport"
      @close-report-dialog="closeReportDialog"
      @confirm-resolve-report="confirmResolveReport"
      @retry-report-load="retryReportLoad"
    />
  </div>
</template>
