<script setup lang="ts">
import { computed } from 'vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import { type HandoverFilters } from '@/types/adminFilters'
import { formatCpf } from '@/utils/format'

defineProps<{
  hasAdminAccess: boolean
}>()

defineEmits<{
  'apply-filters': []
  'clear-filters': []
}>()

const draftFilters = defineModel<HandoverFilters>('draftFilters', { required: true })
const cpfDisplay = computed({
  get: () => formatCpf(draftFilters.value.cpf),
  set: (value: string | null) => {
    draftFilters.value = {
      ...draftFilters.value,
      cpf: (value ?? '').replace(/\D/g, '').slice(0, 11),
    }
  },
})
</script>

<template>
  <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
    <v-row density="compact" align="center">
      <v-col cols="12" sm="6" md="2">
        <v-text-field
          :model-value="draftFilters.itemId"
          @update:model-value="draftFilters = { ...draftFilters, itemId: $event }"
          label="ID do item"
          variant="outlined"
          density="compact"
          inputmode="numeric"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field
          :model-value="draftFilters.adminId"
          @update:model-value="draftFilters = { ...draftFilters, adminId: $event }"
          label="ID do administrador"
          variant="outlined"
          density="compact"
          inputmode="numeric"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field
          v-model="cpfDisplay"
          label="CPF do retirante"
          placeholder="___.___.___-__"
          inputmode="numeric"
          maxlength="14"
          prepend-inner-icon="mdi-card-account-details-outline"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <DatePickerField
          :model-value="draftFilters.from"
          label="De"
          density="compact"
          hide-details
          @update:model-value="draftFilters = { ...draftFilters, from: $event ?? null }"
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <DatePickerField
          :model-value="draftFilters.to"
          label="Até"
          density="compact"
          hide-details
          @update:model-value="draftFilters = { ...draftFilters, to: $event ?? null }"
        />
      </v-col>
      <v-col cols="12" md="2" class="d-flex justify-end flex-wrap ga-2">
        <v-btn variant="text" class="text-none" :disabled="!hasAdminAccess" @click="$emit('clear-filters')">
          Limpar
        </v-btn>
        <v-btn
          color="primary"
          class="text-none"
          prepend-icon="mdi-filter-outline"
          :disabled="!hasAdminAccess"
          @click="$emit('apply-filters')"
        >
          Filtrar
        </v-btn>
      </v-col>
    </v-row>
  </v-card>
</template>
