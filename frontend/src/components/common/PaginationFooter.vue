<!--Rodapé padronizado de paginação contendo o total de registros e controles de navegação de páginas.-->
<script setup lang="ts">
defineProps<{
  page: number
  totalPages: number
  totalElements?: number
}>()

const emit = defineEmits<{
  (e: 'update:page', value: number): void
}>()
</script>

<template>
  <div class="d-flex align-center justify-space-between flex-wrap py-4 px-2">
    <div v-if="totalElements !== undefined" class="text-body-2 text-medium-emphasis">
      Total de registros: <span class="font-weight-bold text-primary">{{ totalElements }}</span>
    </div>
    <v-spacer />
    <v-pagination
      :model-value="page"
      :length="totalPages"
      @update:model-value="(val) => emit('update:page', val)"
      active-color="primary"
      density="comfortable"
      rounded="circle"
    />
  </div>
</template>
