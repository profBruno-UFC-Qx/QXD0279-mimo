<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import { DISPOSITION_OPTIONS } from '@/utils/dispositions'
import type { DispositionType } from '@/types'

defineProps<{
  editorMode: 'create' | 'edit'
  formError: string | null
  daysError: string | null
  submitting: boolean
  destinationError: string | null
  isSuperAdmin: boolean
}>()

defineEmits<{
  'close-editor': []
  'submit-rule': []
}>()

const editorOpen = defineModel<boolean>('editorOpen', { required: true })
const daysInput = defineModel<string>('daysInput', { required: true })
const destination = defineModel<DispositionType | null>('destination', { required: true })
const activeValue = defineModel<boolean>('activeValue', { required: true })
const lockedValue = defineModel<boolean>('lockedValue', { required: true })
</script>

<template>
  <AdminDialog v-model="editorOpen" max-width="520" persistent>
    <template #title>
      {{ editorMode === 'create' ? 'Nova regra de destinação' : 'Editar regra de destinação' }}
    </template>

    <v-alert v-if="formError" type="error" variant="tonal" class="mb-4 rounded-lg">
      {{ formError }}
    </v-alert>

    <v-text-field
      v-model="daysInput"
      label="Prazo em dias *"
      variant="outlined"
      density="comfortable"
      inputmode="numeric"
      :error-messages="daysError ? [daysError] : []"
      :disabled="submitting"
      class="mb-2"
    />

    <v-select
      v-model="destination"
      :items="DISPOSITION_OPTIONS"
      item-title="title"
      item-value="value"
      label="Destino *"
      variant="outlined"
      density="comfortable"
      :error-messages="destinationError ? [destinationError] : []"
      :disabled="submitting"
      class="mb-3"
    />

    <template v-if="editorMode === 'edit'">
      <v-switch
        v-model="activeValue"
        label="Regra ativa"
        color="primary"
        hide-details
        :disabled="submitting"
        class="mb-2"
      />
      <v-switch
        v-if="isSuperAdmin"
        v-model="lockedValue"
        label="Regra travada"
        color="warning"
        hide-details
        :disabled="submitting"
        class="mb-2"
      />
      <p v-else class="text-caption text-medium-emphasis">
        O campo “travada” só pode ser alterado por SUPERADMIN.
      </p>
    </template>
    <p v-else class="text-caption text-medium-emphasis">
      A regra será criada ativa e destravada pelo servidor.
    </p>

    <template #actions>
      <v-spacer />
      <v-btn variant="text" class="text-none" :disabled="submitting" @click="$emit('close-editor')">
        Cancelar
      </v-btn>
      <v-btn
        color="primary"
        class="text-none"
        :loading="submitting"
        :disabled="submitting"
        @click="$emit('submit-rule')"
      >
        {{ editorMode === 'create' ? 'Cadastrar regra' : 'Salvar alterações' }}
      </v-btn>
    </template>
  </AdminDialog>
</template>
