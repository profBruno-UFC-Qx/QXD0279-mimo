<script setup lang="ts">
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'

defineProps<{
  categoryDisabled: boolean
  buildingDisabled: boolean
  descriptionDisabled: boolean
  lossDateDisabled: boolean
  categoryError?: string
  buildingError?: string
  descriptionError?: string
  lossDateError?: string
  descriptionPlaceholder?: string
}>()

const categoryId = defineModel<number | null>('categoryId', { required: true })
const buildingId = defineModel<number | null>('buildingId', { required: true })
const description = defineModel<string>('description', { required: true })
const lossDate = defineModel<string | null>('lossDate', { required: true })
</script>

<template>
  <v-row>
    <v-col cols="12" md="6">
      <CategorySelect
        v-model="categoryId"
        label="Categoria"
        :required="true"
        :clearable="false"
        :show-load-error="false"
        :disabled="categoryDisabled"
        :error-messages="categoryError"
      />
    </v-col>

    <v-col cols="12" md="6">
      <BuildingSelect
        v-model="buildingId"
        label="Prédio provável"
        hint="Opcional — deixar vazio para qualquer prédio"
        persistent-hint
        :clearable="true"
        :show-load-error="false"
        :disabled="buildingDisabled"
        :error-messages="buildingError"
      />
    </v-col>

    <v-col cols="12">
      <v-textarea
        v-model="description"
        label="Descrição *"
        :placeholder="descriptionPlaceholder"
        rows="4"
        auto-grow
        variant="outlined"
        density="comfortable"
        :disabled="descriptionDisabled"
        :error-messages="descriptionError"
      />
    </v-col>

    <v-col cols="12" md="6">
      <DatePickerField
        v-model="lossDate"
        label="Data da perda"
        :required="true"
        :clearable="false"
        :disabled="lossDateDisabled"
      />
      <div v-if="lossDateError" class="text-caption text-error mt-1">
        {{ lossDateError }}
      </div>
    </v-col>
  </v-row>
</template>
