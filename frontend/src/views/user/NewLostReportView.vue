<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import { lostReportService } from '@/services/lostReport.service'
import { useAuthStore } from '@/stores/authStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useUiStore } from '@/stores/uiStore'
import {
  buildLostReportCreatePayload,
  extractLostReportErrorMessage,
  getErrorStatus,
  isPositiveSafeId,
  isValidCalendarDate,
  isValidLostReport,
  isValidPublicSuggestedItemList,
  type NewLostReportDraft,
} from '@/utils/lostReport'
import PageHeader from '@/components/common/PageHeader.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'

interface CreateSessionSnapshot {
  operationId: number
  token: string
  userId: number
  generation: number
}

const GENERIC_CREATE_ERROR =
  'Não foi possível confirmar o registro da perda. Verifique suas perdas antes de tentar novamente.'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()
const ui = useUiStore()

const draft = ref<NewLostReportDraft>({
  categoryId: null,
  buildingId: null,
  description: '',
  lossDate: null,
})

const dirty = reactive({
  categoryId: false,
  buildingId: false,
  description: false,
  lossDate: false,
})

const attemptedSubmit = ref(false)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const uncertainResult = ref(false)
const createdReportId = ref<number | null>(null)
const navigationFailed = ref(false)

const categoriesStarted = ref(false)
const categoriesFailed = ref(false)
const buildingsStarted = ref(false)
const buildingsFailed = ref(false)

let latestOperationId = 0
let unmounted = false
let resettingForm = false

function resetFormState() {
  resettingForm = true
  ++latestOperationId
  draft.value = {
    categoryId: null,
    buildingId: null,
    description: '',
    lossDate: null,
  }
  dirty.categoryId = false
  dirty.buildingId = false
  dirty.description = false
  dirty.lossDate = false
  attemptedSubmit.value = false
  submitting.value = false
  submitError.value = null
  uncertainResult.value = false
  createdReportId.value = null
  navigationFailed.value = false
  resettingForm = false
}

watch(() => draft.value.categoryId, () => {
  if (!resettingForm) dirty.categoryId = true
})
watch(() => draft.value.buildingId, () => {
  if (!resettingForm) dirty.buildingId = true
})
watch(() => draft.value.description, () => {
  if (!resettingForm) dirty.description = true
})
watch(() => draft.value.lossDate, () => {
  if (!resettingForm) dirty.lossDate = true
})

watch(
  [
    () => categoriesStore.loading,
    () => categoriesStore.loaded,
    () => categoriesStore.error,
  ],
  ([loading, loaded, error]) => {
    if (loading) {
      categoriesStarted.value = true
      categoriesFailed.value = false
    } else if (error) {
      categoriesStarted.value = true
      categoriesFailed.value = true
    } else if (loaded) {
      categoriesStarted.value = true
      categoriesFailed.value = false
    } else if (categoriesStarted.value) {
      categoriesFailed.value = true
    }
  },
  { immediate: true },
)

watch(
  [
    () => buildingsStore.loading,
    () => buildingsStore.loaded,
    () => buildingsStore.error,
  ],
  ([loading, loaded, error]) => {
    if (loading) {
      buildingsStarted.value = true
      buildingsFailed.value = false
    } else if (error) {
      buildingsStarted.value = true
      buildingsFailed.value = true
    } else if (loaded) {
      buildingsStarted.value = true
      buildingsFailed.value = false
    } else if (buildingsStarted.value) {
      buildingsFailed.value = true
    }
  },
  { immediate: true },
)

const categoryError = computed(() => {
  if (categoriesFailed.value) return 'Não foi possível carregar as categorias.'
  const id = draft.value.categoryId
  if (!isPositiveSafeId(id)) return 'Selecione uma categoria válida.'
  if (categoriesStore.loaded && !categoriesStore.items.some((c) => c.id === id)) {
    return 'Categoria selecionada é inválida.'
  }
  return null
})

const buildingError = computed(() => {
  if (buildingsFailed.value) return null
  const id = draft.value.buildingId
  if (id === null) return null
  if (!isPositiveSafeId(id)) return 'Selecione um prédio válido.'
  if (buildingsStore.loaded && !buildingsStore.items.some((b) => b.id === id)) {
    return 'Prédio selecionado é inválido.'
  }
  return null
})

const descriptionError = computed(() => {
  const len = draft.value.description.trim().length
  if (len < 10) return 'A descrição deve conter pelo menos 10 caracteres.'
  if (len > 2000) return 'A descrição deve conter no máximo 2000 caracteres.'
  return null
})

const lossDateError = computed(() => {
  if (!isValidCalendarDate(draft.value.lossDate)) {
    return 'Informe uma data válida no formato YYYY-MM-DD.'
  }
  return null
})

const hasValidationError = computed(() =>
  Boolean(
    categoryError.value ||
      buildingError.value ||
      descriptionError.value ||
      lossDateError.value,
  ),
)

const isSubmitDisabled = computed(
  () =>
    submitting.value ||
    createdReportId.value !== null ||
    categoriesFailed.value ||
    categoriesStore.loading ||
    hasValidationError.value,
)

function reloadCategories() {
  categoriesFailed.value = false
  void categoriesStore.ensureLoaded(true)
}

function reloadBuildings() {
  buildingsFailed.value = false
  void buildingsStore.ensureLoaded(true)
}

function isCurrentOperation(snapshot: CreateSessionSnapshot): boolean {
  if (unmounted || snapshot.operationId !== latestOperationId) return false
  if (route.name !== 'new-lost-report') return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (!auth.token || auth.token !== snapshot.token) return false
  if (auth.user?.id !== snapshot.userId) return false
  return true
}

function matchesCreatedReport(
  report: unknown,
  payload: ReturnType<typeof buildLostReportCreatePayload>,
  userId: number,
): boolean {
  if (!payload || !isValidLostReport(report)) return false
  return (
    report.status === 'OPEN' &&
    report.userId === userId &&
    report.categoryId === payload.categoryId &&
    report.buildingId === (payload.buildingId ?? null) &&
    report.description === payload.description &&
    report.lossDate === payload.lossDate
  )
}

async function submitForm() {
  if (unmounted || submitting.value || createdReportId.value !== null) return
  if (!auth.token || !auth.user) return

  attemptedSubmit.value = true
  submitError.value = null
  uncertainResult.value = false

  if (categoriesFailed.value || categoriesStore.loading || hasValidationError.value) return
  if (buildingsFailed.value && draft.value.buildingId !== null) return

  const payload = buildLostReportCreatePayload(draft.value)
  if (!payload) return

  const snapshot: CreateSessionSnapshot = {
    operationId: ++latestOperationId,
    token: auth.token,
    userId: auth.user.id,
    generation: auth.sessionGeneration,
  }
  submitting.value = true

  try {
    const result = await lostReportService.create(payload)
    if (!isCurrentOperation(snapshot)) return

    if (
      typeof result !== 'object' ||
      result === null ||
      !matchesCreatedReport(result.lostReport, payload, snapshot.userId)
    ) {
      submitError.value = GENERIC_CREATE_ERROR
      uncertainResult.value = true
      return
    }

    if (!isValidPublicSuggestedItemList(result.suggestions)) {
      createdReportId.value = result.lostReport.id
      submitError.value = GENERIC_CREATE_ERROR
      uncertainResult.value = true
      return
    }

    createdReportId.value = result.lostReport.id
    ui.showSnackbar('Perda registrada com sucesso.', 'success')

    try {
      const failure = await router.push({
        name: 'lost-report-detail',
        params: { id: result.lostReport.id },
      })
      if (!isCurrentOperation(snapshot)) return
      if (isNavigationFailure(failure) && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
        navigationFailed.value = true
      }
    } catch {
      if (!isCurrentOperation(snapshot)) return
      navigationFailed.value = true
    }
  } catch (err: unknown) {
    if (!isCurrentOperation(snapshot)) return
    const status = getErrorStatus(err)
    submitError.value = extractLostReportErrorMessage(err, GENERIC_CREATE_ERROR)
    uncertainResult.value = status === null || status >= 500
  } finally {
    if (!unmounted && snapshot.operationId === latestOperationId) {
      submitting.value = false
    }
  }
}

watch(
  () => auth.sessionGeneration,
  () => {
    resetFormState()
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  unmounted = true
  ++latestOperationId
})
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
        <v-row>
          <v-col cols="12" md="6">
            <CategorySelect
              v-model="draft.categoryId"
              label="Categoria"
              :required="true"
              :clearable="false"
              :show-load-error="false"
              :disabled="submitting || createdReportId !== null || categoriesFailed || categoriesStore.loading"
              :error-messages="(attemptedSubmit || dirty.categoryId) && categoryError ? categoryError : undefined"
            />
          </v-col>

          <v-col cols="12" md="6">
            <BuildingSelect
              v-model="draft.buildingId"
              label="Prédio provável"
              hint="Opcional — deixar vazio para qualquer prédio"
              persistent-hint
              :clearable="true"
              :show-load-error="false"
              :disabled="submitting || createdReportId !== null || buildingsFailed || buildingsStore.loading"
              :error-messages="(attemptedSubmit || dirty.buildingId) && buildingError ? buildingError : undefined"
            />
          </v-col>

          <v-col cols="12">
            <v-textarea
              v-model="draft.description"
              label="Descrição *"
              placeholder="Descreva o objeto, cor, marca, características e onde foi perdido"
              rows="4"
              auto-grow
              variant="outlined"
              density="comfortable"
              :disabled="submitting || createdReportId !== null"
              :error-messages="(attemptedSubmit || dirty.description) && descriptionError ? descriptionError : undefined"
            />
          </v-col>

          <v-col cols="12" md="6">
            <DatePickerField
              v-model="draft.lossDate"
              label="Data da perda"
              :required="true"
              :clearable="false"
              :disabled="submitting || createdReportId !== null"
            />
            <div v-if="(attemptedSubmit || dirty.lossDate) && lossDateError" class="text-caption text-error mt-1">
              {{ lossDateError }}
            </div>
          </v-col>
        </v-row>

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
