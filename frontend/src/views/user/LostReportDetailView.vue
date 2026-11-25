<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import LostReportEditForm from '@/components/form/LostReportEditForm.vue'
import UserLostReportStateCard from '@/components/domain/UserLostReportStateCard.vue'
import LostReportDetailsCard from '@/components/domain/LostReportDetailsCard.vue'
import LostReportSuggestionsSection from '@/components/domain/LostReportSuggestionsSection.vue'
import { useLostReportDetail } from '@/composables/user/useLostReportDetail'

const {
  report,
  loading,
  error,
  notFound,
  isInvalidId,
  editing,
  saving,
  cancelling,
  submittingConfirmation,
  selectedSuggestionId,
  saveError,
  cancelError,
  confirmationError,
  conflictError,
  conflictReloadFailed,
  optionsLoadFailed,
  draft,
  lossDateModel,
  canEdit,
  canViewSuggestions,
  pageTitle,
  categoryLabel,
  buildingLabel,
  hasChanges,
  hasValidationError,
  displayedCategoryError,
  displayedBuildingError,
  displayedDescriptionError,
  displayedLossDateError,
  categoryDisabled,
  buildingDisabled,
  actionsDisabled,
  suggestionCardDisabled,
  suggestions,
  suggestionsPage,
  suggestionsPerPage,
  suggestionsTotal,
  suggestionsTotalPages,
  suggestionsLoading,
  suggestionsError,
  suggestionsOutOfRange,
  loadReport,
  loadEditOptions,
  enterEditMode,
  cancelEditMode,
  submitEdit,
  requestCancel,
  refreshSuggestions,
  changeSuggestionsPage,
  changeSuggestionsPerPage,
  requestSuggestionConfirmation,
} = useLostReportDetail()
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
      :title="pageTitle"
      subtitle="Acompanhe as informações do objeto perdido."
    >
      <template v-if="canEdit" #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            color="primary"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-pencil-outline"
            :disabled="actionsDisabled"
            @click="enterEditMode"
          >
            Editar perda
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-close-circle-outline"
            :loading="cancelling"
            :disabled="actionsDisabled"
            @click="requestCancel"
          >
            Cancelar perda
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <ErrorAlert
      v-if="error"
      :error="error"
      @retry="loadReport"
    />

    <v-alert
      v-if="cancelError && !editing"
      type="error"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ cancelError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :disabled="cancelling"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <v-alert
      v-if="conflictError && !editing"
      type="warning"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ conflictError }}</span>
        <v-btn
          v-if="conflictReloadFailed"
          size="small"
          variant="text"
          color="warning"
          class="text-none"
          :disabled="cancelling || submittingConfirmation || loading"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <v-alert
      v-if="confirmationError && !editing"
      type="error"
      variant="tonal"
      class="my-4 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ confirmationError }}</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none"
          :disabled="submittingConfirmation || loading"
          @click="loadReport"
        >
          Recarregar relato
        </v-btn>
      </div>
    </v-alert>

    <LoadingOverlay :loading="loading" text="Carregando detalhes da perda...">
      <UserLostReportStateCard
        v-if="isInvalidId"
        icon="mdi-alert-circle-outline"
        icon-color="warning"
        title="Identificador de perda inválido."
        description="Verifique o endereço acessado e retorne para a listagem de perdas."
      />

      <UserLostReportStateCard
        v-else-if="notFound"
        icon="mdi-file-search-outline"
        icon-color="grey-darken-1"
        title="Relato de perda não encontrado."
        description="O relato solicitado não foi encontrado ou não está disponível."
      />

      <LostReportEditForm
        v-else-if="report && editing"
        v-model:draft="draft"
        v-model:loss-date="lossDateModel"
        :saving="saving"
        :save-error="saveError"
        :options-load-failed="optionsLoadFailed"
        :category-disabled="categoryDisabled"
        :building-disabled="buildingDisabled"
        :category-error="displayedCategoryError"
        :building-error="displayedBuildingError"
        :description-error="displayedDescriptionError"
        :loss-date-error="displayedLossDateError"
        :has-changes="hasChanges"
        :has-validation-error="hasValidationError"
        @submit="submitEdit"
        @cancel="cancelEditMode"
        @reload-report="loadReport"
        @reload-options="loadEditOptions(true)"
      />

      <LostReportDetailsCard
        v-else-if="report && !error"
        :report="report"
        :category-label="categoryLabel"
        :building-label="buildingLabel"
      />

      <LostReportSuggestionsSection
        v-if="report && !editing && !error && !notFound && canViewSuggestions"
        :suggestions="suggestions"
        :page="suggestionsPage"
        :per-page="suggestionsPerPage"
        :total="suggestionsTotal"
        :total-pages="suggestionsTotalPages"
        :loading="suggestionsLoading"
        :error="suggestionsError"
        :out-of-range="suggestionsOutOfRange"
        :submitting-confirmation="submittingConfirmation"
        :selected-suggestion-id="selectedSuggestionId"
        :card-disabled="suggestionCardDisabled"
        @refresh="refreshSuggestions"
        @change-page="changeSuggestionsPage"
        @change-per-page="changeSuggestionsPerPage"
        @confirm="requestSuggestionConfirmation"
      />
    </LoadingOverlay>
  </div>
</template>
