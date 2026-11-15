<!--Rodapé padronizado de paginação contendo o total de registros e controles de navegação de páginas.-->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
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

const pageNumbers = computed(() => {
  const visiblePageCount = Math.min(Math.max(0, Math.floor(props.totalPages)), 5)
  return Array.from({ length: visiblePageCount }, (_, index) => index + 1)
})
</script>

<template>
  <div v-if="(totalElements ?? totalPages) > 0" class="d-flex align-center justify-space-between flex-wrap ga-3 py-4 px-2">
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
    <nav v-if="totalPages > 1" class="d-flex align-center" aria-label="Paginação">
      <v-btn
        icon="mdi-chevron-left"
        variant="text"
        aria-label="Página anterior"
        :disabled="disabled || page <= 1"
        @click="emit('update:page', page - 1)"
      />
      <v-btn
        v-for="pageNumber in pageNumbers"
        :key="pageNumber"
        class="pagination-page-button"
        :variant="pageNumber === page ? 'flat' : 'text'"
        :color="pageNumber === page ? 'primary' : undefined"
        :aria-label="`Página ${pageNumber}`"
        :aria-current="pageNumber === page ? 'page' : undefined"
        :disabled="disabled"
        density="comfortable"
        rounded="circle"
        @click="emit('update:page', pageNumber)"
      >
        {{ pageNumber }}
      </v-btn>
      <span v-if="page > pageNumbers.length" class="text-body-2 mx-2">
        Página {{ page }} de {{ totalPages }}
      </span>
      <v-btn
        icon="mdi-chevron-right"
        variant="text"
        aria-label="Próxima página"
        :disabled="disabled || page >= totalPages"
        @click="emit('update:page', page + 1)"
      />
    </nav>
  </div>
</template>

<style scoped>
.pagination-page-button {
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
}
</style>
