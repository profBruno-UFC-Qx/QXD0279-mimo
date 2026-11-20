<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  AdminItemDetails,
  CreateAdminItemPayload,
  ItemPhoto,
  UpdateAdminItemPayload,
} from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { uploadService } from '@/services/upload.service'
import { useUiStore } from '@/stores/uiStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import PhotoUploader from '@/components/form/PhotoUploader.vue'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId, isValidCalendarDate, parsePositiveReportId } from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'
import type { ValidationRule } from '@/utils/rules'

const MAX_PHOTOS = 5

const titleRules: ValidationRule[] = [
  (value) => (typeof value === 'string' && value.trim() !== '') || 'Informe o título do item.',
  (value) => {
    const length = typeof value === 'string' ? value.trim().length : 0
    return (length >= 3 && length <= 150) || 'O título deve ter entre 3 e 150 caracteres.'
  },
]
const descriptionRules: ValidationRule[] = [
  (value) => typeof value !== 'string' || value.length <= 2000 || 'A descrição deve ter no máximo 2000 caracteres.',
]
const locationRules: ValidationRule[] = [
  (value) => typeof value !== 'string' || value.length <= 200 || 'O local deve ter no máximo 200 caracteres.',
]

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const isEditRoute = computed(() => route.name === 'admin-item-edit')
const editItemId = computed(() =>
  isEditRoute.value ? parsePositiveReportId(String(route.params.id ?? '')) : null,
)

const details = ref<AdminItemDetails | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const notFound = ref(false)

const title = ref('')
const description = ref('')
const categoryId = ref<number | null>(null)
const buildingId = ref<number | null>(null)
const foundLocation = ref('')
const foundDate = ref<string | null>(null)
const newPhotos = ref<File[]>([])
const removedPhotoIds = ref<number[]>([])

const submitting = ref(false)
const submitError = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

const existingPhotos = computed(
  () => details.value?.photos.filter((photo) => !removedPhotoIds.value.includes(photo.id)) ?? [],
)
const remainingSlots = computed(() => Math.max(0, MAX_PHOTOS - existingPhotos.value.length))
const isEditable = computed(
  () => !isEditRoute.value || (details.value !== null && isItemEditable(details.value.item.status)),
)
const isLoading = computed(() => loading.value || submitting.value)

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function originalFoundDate(): string {
  return details.value?.item.foundDate.slice(0, 10) ?? ''
}

function resetForm() {
  details.value = null
  loadError.value = null
  notFound.value = false
  title.value = ''
  description.value = ''
  categoryId.value = null
  buildingId.value = null
  foundLocation.value = ''
  foundDate.value = null
  newPhotos.value = []
  removedPhotoIds.value = []
  submitError.value = null
  uploadError.value = null
}

async function loadForEdit() {
  resetForm()
  if (!isEditRoute.value) return

  const id = editItemId.value
  if (id === null) {
    notFound.value = true
    return
  }

  loading.value = true
  try {
    const res = await adminItemService.getById(id)
    details.value = res
    title.value = res.item.title
    description.value = res.item.description ?? ''
    categoryId.value = res.item.categoryId
    buildingId.value = res.item.buildingId
    foundLocation.value = res.item.foundLocation ?? ''
    const date = res.item.foundDate.slice(0, 10)
    foundDate.value = isValidCalendarDate(date) ? date : null
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      notFound.value = true
    } else if (httpStatus === 403) {
      loadError.value = 'Sua sessão não possui permissão administrativa para editar itens.'
    } else {
      loadError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os dados do item. Tente novamente.',
      )
    }
  } finally {
    loading.value = false
  }
}

function removeExistingPhoto(photo: ItemPhoto) {
  if (!removedPhotoIds.value.includes(photo.id)) {
    removedPhotoIds.value = [...removedPhotoIds.value, photo.id]
  }
}

function goBack() {
  if (details.value) {
    void router.push({ name: 'admin-item-detail', params: { id: details.value.item.id } })
    return
  }
  void router.push({ name: 'admin-items' })
}

function uploadErrorMessage(err: unknown): string {
  const httpStatus = getErrorStatus(err)
  if (httpStatus === 400 || httpStatus === 413) {
    return extractLostReportErrorMessage(
      err,
      httpStatus === 413
        ? 'Cada imagem deve ter no máximo 5 MB.'
        : 'Uma ou mais imagens são inválidas. Use JPEG, PNG ou WebP.',
    )
  }
  if (httpStatus === 403) {
    return 'Sua sessão não possui permissão administrativa para enviar imagens.'
  }
  return 'Não foi possível enviar as fotos. Verifique sua conexão e tente novamente.'
}

function submitErrorMessage(err: unknown): string {
  const httpStatus = getErrorStatus(err)
  if (httpStatus === 403) {
    return 'Sua sessão não possui permissão administrativa para salvar itens.'
  }
  if (httpStatus === 404) {
    return isEditRoute.value
      ? 'Este item não existe mais no servidor. Volte para a listagem.'
      : 'A categoria ou o prédio informado não foi encontrado.'
  }
  if (httpStatus === 409) {
    return extractLostReportErrorMessage(err, 'Este item não pode mais ser alterado.')
  }
  if (httpStatus === 400) {
    return extractLostReportErrorMessage(err, 'Dados inválidos para salvar o item.')
  }
  return 'Não foi possível confirmar o salvamento do item. Tente novamente.'
}

async function submit() {
  if (submitting.value || !isEditable.value || loading.value) return

  submitting.value = true
  try {
    submitError.value = null
    uploadError.value = null

    const validation = await formRef.value?.validate()
    if (!validation?.valid) return

    const trimmedTitle = title.value.trim()
    const targetCategoryId = categoryId.value
    const targetBuildingId = buildingId.value
    const targetFoundDate = foundDate.value
    if (
      !isPositiveSafeId(targetCategoryId) ||
      !isPositiveSafeId(targetBuildingId) ||
      !isValidCalendarDate(targetFoundDate)
    ) {
      submitError.value = 'Informe categoria, prédio e data do achado.'
      return
    }

    let uploadedUrls: string[] = []
    if (newPhotos.value.length > 0) {
      try {
        uploadedUrls = await uploadService.uploadPhotos(newPhotos.value)
      } catch (err: unknown) {
        uploadError.value = uploadErrorMessage(err)
        return
      }
      if (uploadedUrls.length !== newPhotos.value.length) {
        uploadError.value = 'O servidor não confirmou o envio de todas as fotos. Tente novamente.'
        return
      }
    }

    const payloadDescription = normalizeOptionalText(description.value)
    const payloadLocation = normalizeOptionalText(foundLocation.value)

    if (!isEditRoute.value) {
      const payload: CreateAdminItemPayload = {
        title: trimmedTitle,
        description: payloadDescription,
        categoryId: targetCategoryId,
        buildingId: targetBuildingId,
        foundLocation: payloadLocation,
        foundDate: targetFoundDate,
        photos: uploadedUrls,
      }
      const created = await adminItemService.create(payload)
      ui.notifySuccess('Item cadastrado com sucesso.')
      await router.push({ name: 'admin-item-detail', params: { id: created.id } })
      return
    }

    const original = details.value
    if (!original) return

    const payload: UpdateAdminItemPayload = {}
    if (trimmedTitle !== original.item.title) payload.title = trimmedTitle
    if (payloadDescription !== original.item.description) payload.description = payloadDescription
    if (targetCategoryId !== original.item.categoryId) payload.categoryId = targetCategoryId
    if (targetBuildingId !== original.item.buildingId) payload.buildingId = targetBuildingId
    if (payloadLocation !== original.item.foundLocation) payload.foundLocation = payloadLocation
    if (targetFoundDate !== originalFoundDate()) payload.foundDate = targetFoundDate
    if (uploadedUrls.length > 0) payload.photosToAdd = uploadedUrls
    if (removedPhotoIds.value.length > 0) payload.photosToRemove = [...removedPhotoIds.value]

    if (Object.keys(payload).length === 0) {
      await router.push({ name: 'admin-item-detail', params: { id: original.item.id } })
      return
    }

    const updated = await adminItemService.update(original.item.id, payload)
    ui.notifySuccess('Item atualizado com sucesso.')
    await router.push({ name: 'admin-item-detail', params: { id: updated.id } })
  } catch (err: unknown) {
    submitError.value = submitErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

watch(
  () => [route.name, route.params.id],
  () => void loadForEdit(),
  { immediate: true },
)
</script>

<template>
  <div>
    <PageHeader
      :title="isEditRoute ? 'Editar item' : 'Novo item'"
      :subtitle="
        isEditRoute
          ? 'Atualize os dados e as fotos do objeto encontrado.'
          : 'Cadastre um objeto encontrado e suas fotos.'
      "
    >
      <template #actions>
        <v-btn
          variant="outlined"
          color="primary"
          class="text-none"
          prepend-icon="mdi-arrow-left"
          :disabled="submitting"
          @click="goBack"
        >
          Voltar
        </v-btn>
      </template>
    </PageHeader>

    <div v-if="notFound" class="py-4">
      <v-alert type="warning" variant="tonal" class="rounded-lg">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Item não encontrado ou identificador inválido.</span>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            class="text-none"
            @click="router.push({ name: 'admin-items' })"
          >
            Voltar para a listagem
          </v-btn>
        </div>
      </v-alert>
    </div>

    <ErrorAlert v-else-if="loadError" :error="loadError" @retry="loadForEdit()" />

    <LoadingOverlay v-else :loading="loading" text="Carregando dados do item...">
      <v-alert
        v-if="details && !isEditable"
        type="warning"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        Itens entregues ou destinados não podem ser editados.
      </v-alert>

      <v-form ref="formRef" @submit.prevent="submit">
        <v-card variant="flat" class="rounded-lg border">
          <v-card-text class="pa-5">
            <v-alert v-if="submitError" type="error" variant="tonal" class="mb-4 rounded-lg">
              {{ submitError }}
            </v-alert>
            <v-alert v-if="uploadError" type="error" variant="tonal" class="mb-4 rounded-lg">
              {{ uploadError }}
            </v-alert>

            <v-row>
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="title"
                  label="Título *"
                  variant="outlined"
                  density="comfortable"
                  :rules="titleRules"
                  :disabled="isLoading || !isEditable"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field
                  :model-value="details ? `Item #${details.item.id}` : 'Novo item'"
                  label="Identificação"
                  variant="outlined"
                  density="comfortable"
                  readonly
                  hide-details
                />
              </v-col>
            </v-row>

            <v-textarea
              v-model="description"
              label="Descrição"
              variant="outlined"
              density="comfortable"
              rows="3"
              auto-grow
              :rules="descriptionRules"
              :disabled="isLoading || !isEditable"
            />

            <v-row>
              <v-col cols="12" md="6">
                <CategorySelect
                  v-model="categoryId"
                  required
                  :disabled="isLoading || !isEditable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <BuildingSelect
                  v-model="buildingId"
                  required
                  :disabled="isLoading || !isEditable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="foundLocation"
                  label="Local onde foi encontrado"
                  variant="outlined"
                  density="comfortable"
                  :rules="locationRules"
                  :disabled="isLoading || !isEditable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <DatePickerField
                  v-model="foundDate"
                  label="Data do achado"
                  required
                  :disabled="isLoading || !isEditable"
                />
              </v-col>
            </v-row>

            <v-divider class="my-5" />

            <div class="text-subtitle-1 font-weight-bold text-primary mb-2">
              Fotos do item
            </div>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Envie até {{ MAX_PHOTOS }} imagens JPEG, PNG ou WebP de até 5 MB cada.
            </p>

            <div v-if="existingPhotos.length > 0" class="mb-4">
              <div class="text-body-2 font-weight-medium mb-2">
                Fotos atuais
              </div>
              <p class="text-caption text-medium-emphasis mb-3">
                Clique no X para marcar uma foto para remoção ao salvar.
              </p>
              <div class="d-flex flex-wrap ga-3">
                <div
                  v-for="photo in existingPhotos"
                  :key="photo.id"
                  class="position-relative rounded-lg overflow-hidden border"
                  style="width: 90px; height: 90px"
                >
                  <v-img
                    :src="photo.url ?? photo.photoUrl"
                    cover
                    width="100%"
                    height="100%"
                    :alt="`Foto ${photo.id}`"
                  />
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    color="error"
                    variant="flat"
                    class="position-absolute top-0 right-0 ma-1"
                    :aria-label="`Remover foto ${photo.id}`"
                    :disabled="!isEditable"
                    @click="removeExistingPhoto(photo)"
                  />
                </div>
              </div>
            </div>

            <PhotoUploader
              v-if="isEditable"
              v-model:photos="newPhotos"
              :max="remainingSlots"
              :required="false"
            />
            <p v-if="remainingSlots === 0" class="text-caption text-medium-emphasis">
              Limite de {{ MAX_PHOTOS }} fotos atingido.
            </p>
          </v-card-text>

          <v-card-actions class="px-5 pb-5 pt-0">
            <v-spacer />
            <v-btn
              variant="text"
              class="text-none"
              :disabled="submitting"
              @click="goBack"
            >
              Cancelar
            </v-btn>
            <v-btn
              type="submit"
              color="primary"
              class="text-none"
              :disabled="!isEditable || loading"
              :loading="submitting"
            >
              {{ isEditRoute ? 'Salvar alterações' : 'Cadastrar item' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-form>
    </LoadingOverlay>
  </div>
</template>
