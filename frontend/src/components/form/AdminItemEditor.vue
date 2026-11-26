<script setup lang="ts">
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import PhotoUploader from '@/components/form/PhotoUploader.vue'
import type { AdminItemDetails, ItemPhoto } from '@/types'
import type { ValidationRule } from '@/utils/rules'
import { MAX_PHOTOS } from '@/utils/adminItemForm'
import { getTodayIsoDate, isFutureCalendarDate } from '@/utils/lostReport'
import { ref } from 'vue'

defineProps<{
  submitError: string | null
  uploadError: string | null
  isLoading: boolean
  isEditable: boolean
  details: AdminItemDetails | null
  existingPhotos: ItemPhoto[]
  remainingSlots: number
  submitting: boolean
  loading: boolean
  isEditRoute: boolean
}>()

defineEmits<{
  'submit': []
  'go-back': []
  'remove-existing-photo': [photo: ItemPhoto]
}>()

const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
const categoryId = defineModel<number | null>('categoryId', { required: true })
const buildingId = defineModel<number | null>('buildingId', { required: true })
const foundLocation = defineModel<string>('foundLocation', { required: true })
const foundDate = defineModel<string | null>('foundDate', { required: true })
const newPhotos = defineModel<File[]>('newPhotos', { required: true })

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

const foundDateRules: ValidationRule[] = [
  (value) => typeof value !== 'string' || !isFutureCalendarDate(value) || 'A data do achado não pode ser futura.',
]

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

defineExpose({
  validate: () => formRef.value?.validate(),
})
</script>

<template>
  <v-form ref="formRef" @submit.prevent="$emit('submit')">
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
              :max-date="getTodayIsoDate()"
              :rules="foundDateRules"
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
                @click="$emit('remove-existing-photo', photo)"
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
          @click="$emit('go-back')"
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
</template>
