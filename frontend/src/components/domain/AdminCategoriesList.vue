<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { Category } from '@/types'

defineProps<{
  loadingList: boolean
  listError: string | null
  filteredCategories: Category[]
  hasAdminAccess: boolean
  submitting: boolean
  confirmingDelete: boolean
  deletingCategoryId: number | null
  categories: Category[]
}>()

defineEmits<{
  'open-edit': [category: Category]
  'request-delete-category': [category: Category]
}>()
</script>

<template>
  <LoadingOverlay :loading="loadingList" text="Carregando categorias...">
    <template v-if="!listError">
      <v-card v-if="filteredCategories.length > 0" variant="flat" class="rounded-lg border">
        <div class="d-flex align-center justify-space-between px-4 py-3 bg-surface-variant-light border-b">
          <span class="text-subtitle-2 font-weight-bold text-primary">Categorias cadastradas</span>
          <AppPill color="primary">
            {{ filteredCategories.length }}
          </AppPill>
        </div>

        <template v-for="(category, index) in filteredCategories" :key="category.id">
          <div
            data-test="category-row"
            class="d-flex align-center justify-space-between flex-wrap ga-3 px-4 py-3"
          >
            <div class="d-flex align-center ga-2">
              <v-icon icon="mdi-tag-outline" size="20" color="primary" />
              <span class="text-body-1 font-weight-medium">{{ category.name }}</span>
            </div>

            <div class="d-flex align-center flex-wrap ga-2">
              <v-btn
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-pencil-outline"
                :disabled="!hasAdminAccess || submitting || confirmingDelete || deletingCategoryId === category.id"
                @click="$emit('open-edit', category)"
              >
                Editar
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="error"
                class="text-none"
                prepend-icon="mdi-delete-outline"
                :disabled="!hasAdminAccess || submitting || confirmingDelete || deletingCategoryId !== null"
                :loading="deletingCategoryId === category.id"
                @click="$emit('request-delete-category', category)"
              >
                Excluir
              </v-btn>
            </div>
          </div>
          <v-divider v-if="index < filteredCategories.length - 1" />
        </template>
      </v-card>

      <EmptyState
        v-else-if="!loadingList"
        icon="mdi-tag-multiple-outline"
        :title="categories.length === 0 ? 'Nenhuma categoria cadastrada' : 'Nenhuma categoria encontrada'"
        :description="
          categories.length === 0
            ? 'Cadastre a primeira categoria para classificar itens encontrados e relatos de perdas.'
            : 'Nenhuma categoria corresponde à busca informada.'
        "
      />
    </template>
  </LoadingOverlay>
</template>
