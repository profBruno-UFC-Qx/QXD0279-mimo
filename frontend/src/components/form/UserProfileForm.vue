<script setup lang="ts">
import type { User } from '@/types'

defineProps<{
  profile: User
  saving: boolean
  saveError: string | null
  hasChanges: boolean
  nameError?: string
  phoneError?: string
}>()

const nameInput = defineModel<string>('nameInput', { required: true })
const phoneInput = defineModel<string>('phoneInput', { required: true })

const emit = defineEmits<{
  submit: []
}>()
</script>

<template>
  <v-card variant="flat" class="pa-6 rounded-lg border" max-width="760">
    <v-form @submit.prevent="emit('submit')">
      <v-alert v-if="saveError" type="error" variant="tonal" class="mb-4 rounded-lg">
        {{ saveError }}
      </v-alert>

      <div class="mb-4">
        <label class="text-body-2 font-weight-medium d-block mb-1" for="profile-name">
          Nome
        </label>
        <v-text-field
          id="profile-name"
          v-model="nameInput"
          :error-messages="nameError"
          :readonly="saving"
          :hide-details="!nameError"
        />
      </div>

      <div class="mb-4">
        <label class="text-body-2 font-weight-medium d-block mb-1" for="profile-phone">
          Telefone
        </label>
        <v-text-field
          id="profile-phone"
          v-model="phoneInput"
          placeholder="Não informado"
          persistent-placeholder
          :error-messages="phoneError"
          :readonly="saving"
          :hide-details="!phoneError"
        />
      </div>

      <div class="mb-4">
        <label class="text-body-2 font-weight-medium d-block mb-1" for="profile-email">
          E-mail (somente leitura)
        </label>
        <v-text-field
          id="profile-email"
          :model-value="profile.email"
          readonly
          hide-details
          bg-color="surface-muted"
        />
      </div>

      <div class="mb-6">
        <label class="text-body-2 font-weight-medium d-block mb-1" for="profile-role">
          Papel (somente leitura)
        </label>
        <v-text-field
          id="profile-role"
          :model-value="profile.role"
          readonly
          hide-details
          bg-color="surface-muted"
        />
      </div>

      <v-btn
        type="submit"
        color="primary"
        size="large"
        :loading="saving"
        :disabled="!hasChanges || saving"
      >
        Salvar
      </v-btn>
    </v-form>
  </v-card>
</template>
