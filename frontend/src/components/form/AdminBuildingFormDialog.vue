<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import { type BuildingFormDraft, type BuildingValidationErrors } from '@/utils/adminBuildings'

defineProps<{
  editorMode: 'create' | 'edit'
  loadingDetail: boolean
  detailError: string | null
  editingBuildingId: number | null
  submitError: string | null
  showReloadActionOnSubmitError: boolean
  formErrors: BuildingValidationErrors
  submitting: boolean
  hasAdminAccess: boolean
}>()

defineEmits<{
  'close-editor': []
  'load-building-for-edit': [id: number]
  'reload-from-modal-error': []
  'submit-building': []
}>()

const editorOpen = defineModel<boolean>('editorOpen', { required: true })
const formDraft = defineModel<BuildingFormDraft>('formDraft', { required: true })
</script>

<template>
  <AdminDialog v-model="editorOpen" max-width="600" persistent>
    <template #title>
      {{ editorMode === 'create' ? 'Novo prédio' : 'Editar prédio' }}
    </template>

    <LoadingOverlay :loading="loadingDetail" text="Carregando dados do prédio...">
      <div v-if="detailError" class="py-2">
        <v-alert type="error" variant="tonal" class="mb-3 rounded-lg">
          {{ detailError }}
        </v-alert>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            v-if="editingBuildingId !== null"
            size="small"
            variant="outlined"
            color="primary"
            class="text-none"
            @click="$emit('load-building-for-edit', editingBuildingId)"
          >
            Tentar novamente
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            class="text-none"
            @click="$emit('reload-from-modal-error')"
          >
            Recarregar listagem
          </v-btn>
        </div>
      </div>

      <v-form v-else @submit.prevent="$emit('submit-building')">
        <v-alert
          v-if="submitError"
          type="error"
          variant="tonal"
          class="mb-4 rounded-lg"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <span>{{ submitError }}</span>
            <v-btn
              v-if="showReloadActionOnSubmitError"
              size="small"
              variant="outlined"
              color="error"
              class="text-none"
              @click="$emit('reload-from-modal-error')"
            >
              Recarregar listagem
            </v-btn>
          </div>
        </v-alert>

        <v-text-field
          :model-value="formDraft.name"
          @update:model-value="formDraft = { ...formDraft, name: $event }"
          data-test="building-name"
          label="Nome do prédio *"
          variant="outlined"
          density="comfortable"
          :error-messages="formErrors.name"
          :disabled="submitting || !hasAdminAccess"
          class="mb-3"
        />

        <v-text-field
          :model-value="formDraft.address"
          @update:model-value="formDraft = { ...formDraft, address: $event }"
          data-test="building-address"
          label="Endereço *"
          variant="outlined"
          density="comfortable"
          :error-messages="formErrors.address"
          :disabled="submitting || !hasAdminAccess"
          class="mb-3"
        />

        <v-text-field
          :model-value="formDraft.pickupPoint"
          @update:model-value="formDraft = { ...formDraft, pickupPoint: $event }"
          data-test="building-pickup-point"
          label="Ponto de retirada *"
          variant="outlined"
          density="comfortable"
          :error-messages="formErrors.pickupPoint"
          :disabled="submitting || !hasAdminAccess"
          class="mb-3"
        />

        <v-text-field
          :model-value="formDraft.serviceHours"
          @update:model-value="formDraft = { ...formDraft, serviceHours: $event }"
          data-test="building-service-hours"
          label="Horário de atendimento *"
          variant="outlined"
          density="comfortable"
          :error-messages="formErrors.serviceHours"
          :disabled="submitting || !hasAdminAccess"
        />
      </v-form>
    </LoadingOverlay>

    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        class="text-none"
        :disabled="submitting"
        @click="$emit('close-editor')"
      >
        Cancelar
      </v-btn>
      <v-btn
        v-if="!detailError"
        color="primary"
        class="text-none"
        :disabled="!hasAdminAccess || submitting || loadingDetail"
        :loading="submitting"
        @click="$emit('submit-building')"
      >
        {{ editorMode === 'create' ? 'Cadastrar prédio' : 'Salvar alterações' }}
      </v-btn>
    </template>
  </AdminDialog>
</template>
