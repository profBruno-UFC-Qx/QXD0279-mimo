<script setup lang="ts">
import type { PublicCatalogItem } from '@/types'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import SuggestionCard from '@/components/domain/SuggestionCard.vue'

defineProps<{
  suggestions: PublicCatalogItem[]
  page: number
  perPage: number
  total: number
  totalPages: number
  loading: boolean
  error: string | null
  outOfRange: boolean
  submittingConfirmation: boolean
  selectedSuggestionId: number | null
  cardDisabled: boolean
}>()

const emit = defineEmits<{
  refresh: []
  changePage: [page: number]
  changePerPage: [limit: number]
  confirm: [item: PublicCatalogItem]
}>()
</script>

<template>
  <section class="suggestions-section mt-8">
    <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
      <div>
        <h2 class="text-h6 font-weight-bold text-primary">Possíveis correspondências</h2>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Itens encontrados atualmente disponíveis nesta categoria.
        </p>
      </div>
      <v-btn
        variant="outlined"
        color="primary"
        prepend-icon="mdi-refresh"
        :disabled="loading || submittingConfirmation"
        @click="emit('refresh')"
      >
        Atualizar sugestões
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <ErrorAlert
      v-if="error"
      :error="error"
      @retry="emit('refresh')"
    />

    <v-alert v-else-if="outOfRange" type="info" variant="tonal" class="mb-4 rounded-lg">
      <div class="d-flex align-center justify-space-between flex-wrap ga-3">
        <span>Esta página não está mais disponível no catálogo atual.</span>
        <v-btn
          variant="outlined"
          color="primary"
          size="small"
          @click="emit('changePage', 1)"
        >
          Voltar para a página 1
        </v-btn>
      </div>
    </v-alert>

    <EmptyState
      v-else-if="!loading && suggestions.length === 0"
      icon="mdi-package-variant"
      title="Nenhuma correspondência disponível no momento."
      description="Novos itens cadastrados nesta categoria aparecerão aqui automaticamente."
      compact
    />

    <v-row v-else-if="suggestions.length > 0">
      <v-col
        v-for="item in suggestions"
        :key="item.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <SuggestionCard
          :item="item"
          mode="confirm"
          :confirming="submittingConfirmation && selectedSuggestionId === item.id"
          :disabled="cardDisabled"
          @confirm="emit('confirm', item)"
        />
      </v-col>
    </v-row>

    <PaginationFooter
      v-if="!error && !outOfRange && total > 0"
      :page="page"
      :total-pages="totalPages"
      :total-elements="total"
      :limit="perPage"
      @update:page="emit('changePage', $event)"
      @update:limit="emit('changePerPage', $event)"
    />
  </section>
</template>
