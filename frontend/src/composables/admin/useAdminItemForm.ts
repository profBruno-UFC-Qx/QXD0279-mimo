import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminItemDetails, CreateAdminItemPayload, ItemPhoto, UpdateAdminItemPayload } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { IncompletePhotoUploadError, uploadService } from '@/services/upload.service'
import { useUiStore } from '@/stores/uiStore'
import {
  extractLostReportErrorMessage,
  getErrorStatus,
  isPositiveSafeId,
  isValidCalendarDate,
  parsePositiveReportId,
} from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'
import { MAX_PHOTOS } from '@/utils/adminItemForm'

export function useAdminItemForm() {
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
    if (err instanceof IncompletePhotoUploadError) {
      return 'O servidor não confirmou o envio de todas as fotos. Tente novamente.'
    }
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

  return {
    isEditRoute,
    submitting,
    goBack,
    notFound,
    router,
    loadError,
    loadForEdit,
    loading,
    details,
    isEditable,
    title,
    description,
    categoryId,
    buildingId,
    foundLocation,
    foundDate,
    newPhotos,
    submitError,
    uploadError,
    isLoading,
    existingPhotos,
    remainingSlots,
    submit,
    removeExistingPhoto,
    formRef,
  }
}
