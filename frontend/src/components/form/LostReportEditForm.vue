<script setup lang="ts">
import type { EditableLostReportFields } from '@/utils/lostReport'
import LostReportFormFields from '@/components/form/LostReportFormFields.vue'

defineProps<{
  saving: boolean
  saveError: string | null
  optionsLoadFailed: boolean
  categoryDisabled: boolean
  buildingDisabled: boolean
  categoryError?: string
  buildingError?: string
  descriptionError?: string
  lossDateError?: string
  hasChanges: boolean
  hasValidationError: boolean
}>()

const draft = defineModel<EditableLostReportFields>('draft', { required: true })
const lossDate = defineModel<string | null>('lossDate', { required: true })

const emit = defineEmits<{
  submit: []
  cancel: []
  reloadReport: []
  reloadOptions: []
}>()
</script>

<template>
  <v-card class="pa-6 rounded-lg border" variant="flat">
    <v-alert
      v-if="saveError"
      type="error"
      variant="tonal"
      class="mb-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ saveError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :disabled="saving"
          @click="emit('reloadReport')"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <v-alert
      v-if="optionsLoadFailed"
      type="warning"
      variant="tonal"
      class="mb-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>Não foi possível carregar todas as opções. Os valores originais foram preservados.</span>
        <v-btn
          size="small"
          variant="text"
          color="warning"
          class="text-none"
          @click="emit('reloadOptions')"
        >
          Recarregar opções
        </v-btn>
      </div>
    </v-alert>

    <v-form @submit.prevent="emit('submit')">
      <LostReportFormFields
        v-model:category-id="draft.categoryId"
        v-model:building-id="draft.buildingId"
        v-model:description="draft.description"
        v-model:loss-date="lossDate"
        :category-disabled="categoryDisabled"
        :building-disabled="buildingDisabled"
        :description-disabled="saving"
        :loss-date-disabled="saving"
        :category-error="categoryError"
        :building-error="buildingError"
        :description-error="descriptionError"
        :loss-date-error="lossDateError"
      />

      <div class="d-flex flex-wrap justify-end ga-3 mt-4">
        <v-btn
          variant="text"
          class="text-none"
          :disabled="saving"
          @click="emit('cancel')"
        >
          Cancelar edição
        </v-btn>
        <v-btn
          type="submit"
          color="primary"
          class="text-none"
          :loading="saving"
          :disabled="saving || !hasChanges || hasValidationError"
        >
          Salvar alterações
        </v-btn>
      </div>
    </v-form>
  </v-card>
</template>
