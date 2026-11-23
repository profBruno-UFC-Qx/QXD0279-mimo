<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
defineProps<{
  editorMode: 'create' | 'edit'
  submitError: string | null
  showReloadActionOnSubmitError: boolean
  nameError: string | undefined
  submitting: boolean
  hasAdminAccess: boolean
}>()

defineEmits<{
  'close-editor': []
  'reload-from-modal-error': []
  'submit-category': []
}>()

const editorOpen = defineModel<boolean>('editorOpen', { required: true })
const formName = defineModel<string>('formName', { required: true })
</script>

<template>
  <AdminDialog
    v-model="editorOpen"
    max-width="480"
    persistent
    hide-card-when-closed
  >
    <template #title>
      {{ editorMode === 'create' ? 'Nova categoria' : 'Editar categoria' }}
    </template>

    <v-form @submit.prevent="$emit('submit-category')">
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
        v-model="formName"
        data-test="category-name"
        label="Nome da categoria *"
        variant="outlined"
        density="comfortable"
        :error-messages="nameError"
        :disabled="submitting || !hasAdminAccess"
      />
    </v-form>

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
        color="primary"
        class="text-none"
        :disabled="!hasAdminAccess || submitting"
        :loading="submitting"
        @click="$emit('submit-category')"
      >
        Salvar
      </v-btn>
    </template>
  </AdminDialog>
</template>
