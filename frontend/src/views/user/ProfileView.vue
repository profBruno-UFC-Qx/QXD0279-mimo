<script setup lang="ts">
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import UserProfileForm from '@/components/form/UserProfileForm.vue'
import { useUserProfile } from '@/composables/user/useUserProfile'

const {
  profile,
  loading,
  error,
  nameInput,
  phoneInput,
  saving,
  saveError,
  hasChanges,
  nameError,
  phoneError,
  loadProfile,
  saveProfile,
} = useUserProfile()
</script>

<template>
  <div>
    <PageHeader
      title="Perfil"
      subtitle="Consulte e atualize seus dados pessoais de contato."
    />

    <ErrorAlert v-if="error" :error="error" @retry="loadProfile" />

    <LoadingOverlay :loading="loading" text="Carregando perfil...">
      <UserProfileForm
        v-if="profile"
        v-model:name-input="nameInput"
        v-model:phone-input="phoneInput"
        :profile="profile"
        :saving="saving"
        :save-error="saveError"
        :has-changes="hasChanges"
        :name-error="nameError"
        :phone-error="phoneError"
        @submit="saveProfile"
      />
    </LoadingOverlay>
  </div>
</template>
