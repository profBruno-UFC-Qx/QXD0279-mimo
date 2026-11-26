<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
defineProps<{
  createError: string | null
  showReloadActionOnCreateError: boolean
  nameError: string | undefined
  submittingCreate: boolean
  hasSuperAdminAccess: boolean
  emailError: string | undefined
  passwordError: string | undefined
}>()

defineEmits<{
  'close-create': []
  'submit-create': []
  'reload-from-create-error': []
}>()

const createOpen = defineModel<boolean>('createOpen', { required: true })
const createName = defineModel<string>('createName', { required: true })
const createEmail = defineModel<string>('createEmail', { required: true })
const createInitialPassword = defineModel<string>('createInitialPassword', { required: true })
const showInitialPassword = defineModel<boolean>('showInitialPassword', { required: true })
</script>

<template>
  <AdminDialog
    v-model="createOpen"
    max-width="480"
    persistent
    hide-card-when-closed
    card-test-id="admin-create-dialog"
  >
    <template #title>
      Novo administrador
    </template>

    <v-form @submit.prevent="$emit('submit-create')">
      <v-alert
        v-if="createError"
        type="error"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>{{ createError }}</span>
          <v-btn
            v-if="showReloadActionOnCreateError"
            size="small"
            variant="outlined"
            color="error"
            class="text-none"
            @click="$emit('reload-from-create-error')"
          >
            Recarregar listagem
          </v-btn>
        </div>
      </v-alert>

      <v-text-field
        v-model="createName"
        data-test="admin-create-name"
        label="Nome *"
        variant="outlined"
        density="comfortable"
        autocomplete="off"
        class="mb-3"
        :error-messages="nameError"
        :disabled="submittingCreate || !hasSuperAdminAccess"
      />

      <v-text-field
        v-model="createEmail"
        data-test="admin-create-email"
        label="E-mail *"
        type="email"
        variant="outlined"
        density="comfortable"
        autocomplete="off"
        class="mb-3"
        :error-messages="emailError"
        :disabled="submittingCreate || !hasSuperAdminAccess"
      />

      <v-text-field
        v-model="createInitialPassword"
        data-test="admin-create-password"
        label="Senha inicial *"
        :type="showInitialPassword ? 'text' : 'password'"
        variant="outlined"
        density="comfortable"
        autocomplete="new-password"
        :error-messages="passwordError"
        :disabled="submittingCreate || !hasSuperAdminAccess"
      >
        <template #append-inner>
          <v-btn
            data-test="toggle-initial-password"
            icon
            variant="text"
            size="small"
            tabindex="-1"
            :aria-label="showInitialPassword ? 'Ocultar senha inicial' : 'Mostrar senha inicial'"
            @click="showInitialPassword = !showInitialPassword"
          >
            <v-icon :icon="showInitialPassword ? 'mdi-eye-off' : 'mdi-eye'" />
          </v-btn>
        </template>
      </v-text-field>
    </v-form>

    <template #actions>
      <v-spacer />
      <v-btn
        data-test="admin-create-cancel"
        variant="text"
        class="text-none"
        :disabled="submittingCreate"
        @click="$emit('close-create')"
      >
        Cancelar
      </v-btn>
      <v-btn
        data-test="admin-create-submit"
        color="primary"
        class="text-none"
        :disabled="!hasSuperAdminAccess || submittingCreate"
        :loading="submittingCreate"
        @click="$emit('submit-create')"
      >
        Cadastrar
      </v-btn>
    </template>
  </AdminDialog>
</template>
