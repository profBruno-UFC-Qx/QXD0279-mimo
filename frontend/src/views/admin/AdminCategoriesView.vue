<script setup lang="ts">
import ActionAlert from '@/components/common/ActionAlert.vue'
import AdminSearchField from '@/components/form/AdminSearchField.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminCategoriesList from '@/components/domain/AdminCategoriesList.vue'
import AdminCategoryFormDialog from '@/components/form/AdminCategoryFormDialog.vue'
import { useAdminCategories } from '@/composables/admin/useAdminCategories'

const {
  hasAdminAccess,
  loadingList,
  loadCategories,
  confirmingDelete,
  deletingCategoryId,
  openCreate,
  categories,
  searchQuery,
  deleteError,
  showVerifyDeleteError,
  listError,
  filteredCategories,
  submitting,
  openEdit,
  requestDeleteCategory,
  editorOpen,
  formName,
  editorMode,
  submitError,
  showReloadActionOnSubmitError,
  nameError,
  closeEditor,
  reloadFromModalError,
  submitCategory,
} = useAdminCategories()
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Categorias"
      subtitle="Cadastre e organize as categorias utilizadas em itens encontrados e relatos de perdas."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <RefreshButton
            :disabled="!hasAdminAccess"
            :loading="loadingList"
            @refresh="loadCategories()"
          />
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            :disabled="!hasAdminAccess || confirmingDelete || deletingCategoryId !== null"
            @click="openCreate"
          >
            Nova categoria
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <AdminSearchField
      v-if="categories.length > 0"
      v-model="searchQuery"
      label="Buscar categoria..."
    />

    <ActionAlert
      v-if="deleteError"
      :action="showVerifyDeleteError ? 'Verificar estado atual' : undefined"
      :action-disabled="!hasAdminAccess || loadingList"
      @action="loadCategories()"
    >
      {{ deleteError }}
    </ActionAlert>

    <ErrorAlert
      v-if="listError"
      :error="listError"
      @retry="loadCategories()"
    />

    <AdminCategoriesList
      :loading-list="loadingList"
      :list-error="listError"
      :filtered-categories="filteredCategories"
      :has-admin-access="hasAdminAccess"
      :submitting="submitting"
      :confirming-delete="confirmingDelete"
      :deleting-category-id="deletingCategoryId"
      :categories="categories"
      @open-edit="openEdit"
      @request-delete-category="requestDeleteCategory"
    />

    <AdminCategoryFormDialog
      v-model:editor-open="editorOpen"
      v-model:form-name="formName"
      :editor-mode="editorMode"
      :submit-error="submitError"
      :show-reload-action-on-submit-error="showReloadActionOnSubmitError"
      :name-error="nameError"
      :submitting="submitting"
      :has-admin-access="hasAdminAccess"
      @close-editor="closeEditor"
      @reload-from-modal-error="reloadFromModalError"
      @submit-category="submitCategory"
    />
  </div>
</template>
