<script setup lang="ts">
import ActionAlert from '@/components/common/ActionAlert.vue'
import AdminSearchField from '@/components/form/AdminSearchField.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminBuildingsList from '@/components/domain/AdminBuildingsList.vue'
import AdminBuildingFormDialog from '@/components/form/AdminBuildingFormDialog.vue'
import { useAdminBuildings } from '@/composables/admin/useAdminBuildings'

const {
  hasAdminAccess,
  loadingList,
  loadBuildings,
  confirmingDelete,
  openCreate,
  buildings,
  searchQuery,
  deleteError,
  showVerifyDeleteError,
  listError,
  filteredBuildings,
  submitting,
  deletingBuildingId,
  openEdit,
  requestDeleteBuilding,
  editorOpen,
  formDraft,
  editorMode,
  loadingDetail,
  detailError,
  editingBuildingId,
  submitError,
  showReloadActionOnSubmitError,
  formErrors,
  closeEditor,
  loadBuildingForEdit,
  reloadFromModalError,
  submitBuilding,
} = useAdminBuildings()
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Prédios"
      subtitle="Cadastre e atualize os locais de custódia e retirada de objetos encontrados."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <RefreshButton
            :disabled="!hasAdminAccess"
            :loading="loadingList"
            @refresh="loadBuildings()"
          />
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            :disabled="!hasAdminAccess || confirmingDelete"
            @click="openCreate"
          >
            Novo prédio
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <AdminSearchField
      v-if="buildings.length > 0"
      v-model="searchQuery"
      label="Buscar por nome ou endereço"
    />

    <ActionAlert
      v-if="deleteError"
      :action="showVerifyDeleteError ? 'Verificar estado atual' : undefined"
      :action-disabled="!hasAdminAccess || loadingList"
      @action="loadBuildings()"
    >
      {{ deleteError }}
    </ActionAlert>

    <ErrorAlert
      v-if="listError"
      :error="listError"
      @retry="loadBuildings()"
    />

    <AdminBuildingsList
      :loading-list="loadingList"
      :list-error="listError"
      :filtered-buildings="filteredBuildings"
      :has-admin-access="hasAdminAccess"
      :submitting="submitting"
      :confirming-delete="confirmingDelete"
      :deleting-building-id="deletingBuildingId"
      :buildings="buildings"
      @open-edit="openEdit"
      @request-delete-building="requestDeleteBuilding"
    />

    <AdminBuildingFormDialog
      v-model:editor-open="editorOpen"
      v-model:form-draft="formDraft"
      :editor-mode="editorMode"
      :loading-detail="loadingDetail"
      :detail-error="detailError"
      :editing-building-id="editingBuildingId"
      :submit-error="submitError"
      :show-reload-action-on-submit-error="showReloadActionOnSubmitError"
      :form-errors="formErrors"
      :submitting="submitting"
      :has-admin-access="hasAdminAccess"
      @close-editor="closeEditor"
      @load-building-for-edit="loadBuildingForEdit"
      @reload-from-modal-error="reloadFromModalError"
      @submit-building="submitBuilding"
    />
  </div>
</template>
