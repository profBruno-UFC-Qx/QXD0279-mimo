<script setup lang="ts">
import RefreshButton from '@/components/common/RefreshButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import DispositionRulesFilter from '@/components/form/DispositionRulesFilter.vue'
import DispositionRulesList from '@/components/domain/DispositionRulesList.vue'
import DispositionRuleFormDialog from '@/components/form/DispositionRuleFormDialog.vue'
import { useAdminDispositionRules } from '@/composables/admin/useAdminDispositionRules'

const {
  hasAdminAccess,
  loading,
  loadRules,
  submitting,
  deletingRuleId,
  openCreate,
  activeFilter,
  rules,
  isSuperAdmin,
  listError,
  canModifyRule,
  openEdit,
  requestDeleteRule,
  editorOpen,
  daysInput,
  destination,
  activeValue,
  lockedValue,
  editorMode,
  formError,
  daysError,
  destinationError,
  closeEditor,
  submitRule,
} = useAdminDispositionRules()
</script>

<template>
  <div>
    <PageHeader
      title="Regras de Destinação"
      subtitle="Configure os prazos e destinos usados no processamento de elegibilidade."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <RefreshButton
            :disabled="!hasAdminAccess"
            :loading="loading"
            @refresh="loadRules()"
          />
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            :disabled="!hasAdminAccess || submitting || deletingRuleId !== null"
            @click="openCreate"
          >
            Nova regra
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <DispositionRulesFilter
      v-model:active-filter="activeFilter"
      :rules="rules"
    />

    <p v-if="hasAdminAccess && !isSuperAdmin" class="text-caption text-medium-emphasis mb-4">
      Regras travadas são somente leitura para ADMIN. Apenas SUPERADMIN pode travá-las,
      destravá-las ou excluí-las.
    </p>

    <ErrorAlert v-if="listError" :error="listError" @retry="loadRules()" />

    <DispositionRulesList
      :loading="loading"
      :list-error="listError"
      :rules="rules"
      :can-modify-rule="canModifyRule"
      :submitting="submitting"
      :deleting-rule-id="deletingRuleId"
      :active-filter="activeFilter"
      @open-edit="openEdit"
      @request-delete-rule="requestDeleteRule"
    />

    <DispositionRuleFormDialog
      v-model:editor-open="editorOpen"
      v-model:days-input="daysInput"
      v-model:destination="destination"
      v-model:active-value="activeValue"
      v-model:locked-value="lockedValue"
      :editor-mode="editorMode"
      :form-error="formError"
      :days-error="daysError"
      :submitting="submitting"
      :destination-error="destinationError"
      :is-super-admin="isSuperAdmin"
      @close-editor="closeEditor"
      @submit-rule="submitRule"
    />
  </div>
</template>
