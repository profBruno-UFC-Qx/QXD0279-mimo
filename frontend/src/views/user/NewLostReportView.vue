<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LostReportFormFields from '@/components/form/LostReportFormFields.vue'
import { useNewLostReport } from '@/composables/user/useNewLostReport'

const {
  draft,
  submitting,
  submitError,
  uncertainResult,
  createdReportId,
  navigationFailed,
  categoriesFailed,
  buildingsFailed,
  displayedCategoryError,
  displayedBuildingError,
  displayedDescriptionError,
  displayedLossDateError,
  fieldsDisabled,
  categoryDisabled,
  buildingDisabled,
  isSubmitDisabled,
  reloadCategories,
  reloadBuildings,
  submitForm,
} = useNewLostReport()
</script>

<template>
  <div>
    <v-btn
      variant="text"
      color="primary"
      class="text-none mb-2 px-0"
      prepend-icon="mdi-arrow-left"
      :to="{ name: 'my-lost-reports' }"
    >
      Voltar para Minhas perdas
    </v-btn>

    <PageHeader
      title="Registrar objeto perdido"
      subtitle="Informe os dados para ajudar a localizar seu objeto."
    />

    <v-card class="pa-6 rounded-lg border" variant="flat">
      <v-alert
        v-if="navigationFailed && createdReportId !== null"
        type="info"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Sua perda foi registrada, mas não foi possível abrir os detalhes automaticamente.</span>
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            class="text-none"
            :to="{ name: 'lost-report-detail', params: { id: createdReportId } }"
          >
            Abrir detalhes
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="submitError"
        type="error"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>{{ submitError }}</span>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-if="createdReportId !== null"
              size="small"
              color="primary"
              variant="text"
              class="text-none"
              :to="{ name: 'lost-report-detail', params: { id: createdReportId } }"
            >
              Abrir detalhes
            </v-btn>
            <v-btn
              v-if="uncertainResult"
              size="small"
              color="error"
              variant="text"
              class="text-none"
              :to="{ name: 'my-lost-reports' }"
            >
              Consultar Minhas perdas
            </v-btn>
          </div>
        </div>
      </v-alert>

      <v-alert
        v-if="categoriesFailed"
        type="error"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Não foi possível carregar as categorias disponíveis.</span>
          <v-btn
            size="small"
            variant="text"
            color="error"
            class="text-none"
            @click="reloadCategories"
          >
            Recarregar categorias
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="buildingsFailed"
        type="warning"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Não foi possível carregar os prédios. Você ainda pode enviar indicando qualquer prédio.</span>
          <v-btn
            size="small"
            variant="text"
            color="warning"
            class="text-none"
            @click="reloadBuildings"
          >
            Recarregar prédios
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        type="info"
        variant="tonal"
        density="comfortable"
        class="mb-5 rounded-lg"
      >
        Após o registro, exibiremos possíveis itens encontrados já cadastrados na mesma categoria para você conferir se algum deles é o seu.
      </v-alert>

      <v-form @submit.prevent="submitForm">
        <LostReportFormFields
          v-model:category-id="draft.categoryId"
          v-model:building-id="draft.buildingId"
          v-model:description="draft.description"
          v-model:loss-date="draft.lossDate"
          :category-disabled="categoryDisabled"
          :building-disabled="buildingDisabled"
          :description-disabled="fieldsDisabled"
          :loss-date-disabled="fieldsDisabled"
          :category-error="displayedCategoryError"
          :building-error="displayedBuildingError"
          :description-error="displayedDescriptionError"
          :loss-date-error="displayedLossDateError"
          description-placeholder="Descreva o objeto, cor, marca, características e onde foi perdido"
        />

        <div class="d-flex flex-wrap justify-end ga-3 mt-4">
          <v-btn
            variant="text"
            class="text-none"
            :disabled="submitting"
            :to="{ name: 'my-lost-reports' }"
          >
            Cancelar
          </v-btn>
          <v-btn
            type="submit"
            color="primary"
            class="text-none"
            :loading="submitting"
            :disabled="isSubmitDisabled"
          >
            Registrar perda
          </v-btn>
        </div>
      </v-form>
    </v-card>
  </div>
</template>
