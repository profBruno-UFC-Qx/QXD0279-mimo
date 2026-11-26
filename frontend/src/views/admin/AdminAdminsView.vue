<script setup lang="ts">
import ActionAlert from '@/components/common/ActionAlert.vue'
import AdminSearchField from '@/components/form/AdminSearchField.vue'
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminAccountsList from '@/components/domain/AdminAccountsList.vue'
import AdminAccountDetailsDialog from '@/components/domain/AdminAccountDetailsDialog.vue'
import AdminAccountFormDialog from '@/components/form/AdminAccountFormDialog.vue'
import { useAdminAdmins } from '@/composables/admin/useAdminAdmins'

const {
  hasSuperAdminAccess,
  loadingList,
  loadAdmins,
  confirmingDelete,
  deletingAdminId,
  openCreate,
  admins,
  searchQuery,
  deleteError,
  showVerifyDeleteError,
  listError,
  filteredAdmins,
  submittingCreate,
  openDetail,
  requestDeleteAdmin,
  detailOpen,
  loadingDetail,
  detailError,
  showReloadOnDetailError,
  detailAdmin,
  closeDetail,
  retryDetail,
  reloadListFromDetailError,
  createOpen,
  createName,
  createEmail,
  createInitialPassword,
  showInitialPassword,
  createError,
  showReloadActionOnCreateError,
  nameError,
  emailError,
  passwordError,
  closeCreate,
  submitCreate,
  reloadFromCreateError,
} = useAdminAdmins()
</script>

<template>
  <div>
    <PageHeader
      title="Gerenciamento de Administradores"
      subtitle="Consulte, cadastre e remova contas administrativas comuns (ADMIN) do AchaDex."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <RefreshButton
            :disabled="!hasSuperAdminAccess"
            :loading="loadingList"
            @refresh="loadAdmins()"
          />
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-account-plus-outline"
            :disabled="!hasSuperAdminAccess || confirmingDelete || deletingAdminId !== null"
            @click="openCreate"
          >
            Novo administrador
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <v-alert
      v-if="!hasSuperAdminAccess"
      data-test="admin-restricted-alert"
      type="warning"
      variant="tonal"
      class="my-4 rounded-lg"
      title="Acesso restrito"
    >
      Esta área é exclusiva para contas com perfil SUPERADMIN.
    </v-alert>

    <template v-else>
      <AdminSearchField
        v-if="admins.length > 0"
        v-model="searchQuery"
        data-test="admin-search"
        label="Buscar administrador por nome ou e-mail..."
      />

      <ActionAlert
        v-if="deleteError"
        data-test="admin-delete-alert"
        :action="showVerifyDeleteError ? 'Verificar estado atual' : undefined"
        :action-disabled="!hasSuperAdminAccess || loadingList"
        @action="loadAdmins()"
      >
        {{ deleteError }}
      </ActionAlert>

      <ErrorAlert
        v-if="listError"
        :error="listError"
        @retry="loadAdmins()"
      />

      <AdminAccountsList
        :loading-list="loadingList"
        :list-error="listError"
        :filtered-admins="filteredAdmins"
        :has-super-admin-access="hasSuperAdminAccess"
        :deleting-admin-id="deletingAdminId"
        :submitting-create="submittingCreate"
        :confirming-delete="confirmingDelete"
        :admins="admins"
        @open-detail="openDetail"
        @request-delete-admin="requestDeleteAdmin"
      />
    </template>

    <AdminAccountDetailsDialog
      v-model:detail-open="detailOpen"
      :loading-detail="loadingDetail"
      :detail-error="detailError"
      :show-reload-on-detail-error="showReloadOnDetailError"
      :detail-admin="detailAdmin"
      @close-detail="closeDetail"
      @retry-detail="retryDetail"
      @reload-list-from-detail-error="reloadListFromDetailError"
    />

    <AdminAccountFormDialog
      v-model:create-open="createOpen"
      v-model:create-name="createName"
      v-model:create-email="createEmail"
      v-model:create-initial-password="createInitialPassword"
      v-model:show-initial-password="showInitialPassword"
      :create-error="createError"
      :show-reload-action-on-create-error="showReloadActionOnCreateError"
      :name-error="nameError"
      :submitting-create="submittingCreate"
      :has-super-admin-access="hasSuperAdminAccess"
      :email-error="emailError"
      :password-error="passwordError"
      @close-create="closeCreate"
      @submit-create="submitCreate"
      @reload-from-create-error="reloadFromCreateError"
    />
  </div>
</template>
