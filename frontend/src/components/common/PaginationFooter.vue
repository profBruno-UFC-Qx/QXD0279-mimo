<!--Rodapé padronizado de paginação contendo o total de registros e controles de navegação de páginas.-->
<script setup lang="ts">
withDefaults(defineProps<{
  page: number
  totalPages: number
  totalElements?: number
  disabled?: boolean
  limit?: number
}>(), {
  disabled: false,
  limit: 12,
})

const emit = defineEmits<{
  (e: 'update:page', value: number): void
  (e: 'update:limit', value: number): void
}>()
</script>

<template>
  <div v-if="totalPages > 1" class="d-flex align-center justify-space-between flex-wrap py-4 px-2">
    <div v-if="totalElements !== undefined" class="text-body-2 text-medium-emphasis">
      Total de registros: <span class="font-weight-bold text-primary">{{ totalElements }}</span>
    </div>
    <v-spacer />
    <v-select
      :model-value="limit"
      :items="[12, 24, 48]"
      label="Por página"
      variant="outlined"
      density="compact"
      hide-details
      class="mr-4"
      style="max-width: 140px"
      :disabled="disabled"
      @update:model-value="(value) => emit('update:limit', Number(value))"
    />
    <v-pagination
      :model-value="page"
      :length="totalPages"
      :disabled="disabled"
      @update:model-value="(val) => emit('update:page', val)"
      active-color="primary"
      density="comfortable"
      rounded="circle"
    />
  </div>
</template>
