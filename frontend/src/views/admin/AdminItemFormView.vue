<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import AdminItemEditor from '@/components/form/AdminItemEditor.vue'
import { useAdminItemForm } from '@/composables/admin/useAdminItemForm'

const {
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
} = useAdminItemForm()
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

      <AdminItemEditor
        ref="formRef"
        v-model:title="title"
        v-model:description="description"
        v-model:category-id="categoryId"
        v-model:building-id="buildingId"
        v-model:found-location="foundLocation"
        v-model:found-date="foundDate"
        v-model:new-photos="newPhotos"
        :submit-error="submitError"
        :upload-error="uploadError"
        :is-loading="isLoading"
        :is-editable="isEditable"
        :details="details"
        :existing-photos="existingPhotos"
        :remaining-slots="remainingSlots"
        :submitting="submitting"
        :loading="loading"
        :is-edit-route="isEditRoute"
        @submit="submit"
        @go-back="goBack"
        @remove-existing-photo="removeExistingPhoto"
      />
    </LoadingOverlay>
  </div>
</template>
