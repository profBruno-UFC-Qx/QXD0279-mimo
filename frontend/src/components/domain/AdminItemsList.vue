<script setup lang="ts">
import AdminTable from '@/components/common/AdminTable.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { formatDate } from '@/utils/format'
import { isItemEditable } from '@/utils/adminItems'
import type { Item, PaginationMeta } from '@/types'

defineProps<{
  loading: boolean
  loadError: string | null
  items: Item[]
  categoryLabel: (id: number) => string
  buildingLabel: (id: number) => string
  deletingId: number | null
  hasFilters: boolean
  pagination: PaginationMeta
  currentPage: number
  perPage: number
}>()

defineEmits<{
  'open-details': [item: Item]
  'open-edit': [item: Item]
  'request-delete': [item: Item]
  'change-page': [page: number]
  'change-limit': [limit: number]
}>()
</script>

<template>
  <LoadingOverlay :loading="loading" text="Carregando itens...">
    <template v-if="!loadError">
      <AdminTable v-if="items.length > 0">
        <thead>
          <tr>
            <th class="text-left">Item</th>
            <th class="text-left">Categoria</th>
            <th class="text-left">Prédio</th>
            <th class="text-left">Achado em</th>
            <th class="text-left">Status</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td class="font-weight-medium">{{ item.title }}</td>
            <td>{{ categoryLabel(item.categoryId) }}</td>
            <td>{{ buildingLabel(item.buildingId) }}</td>
            <td>{{ formatDate(item.foundDate) }}</td>
            <td><StatusChip :status="item.status" /></td>
            <td class="text-right text-no-wrap">
              <v-btn
                icon="mdi-eye-outline"
                size="small"
                variant="text"
                color="primary"
                aria-label="Ver detalhes"
                title="Ver detalhes"
                @click="$emit('open-details', item)"
              />
              <v-btn
                icon="mdi-pencil-outline"
                size="small"
                variant="text"
                color="primary"
                aria-label="Editar item"
                title="Editar item"
                :disabled="!isItemEditable(item.status) || deletingId !== null"
                @click="$emit('open-edit', item)"
              />
              <v-btn
                icon="mdi-delete-outline"
                size="small"
                variant="text"
                color="error"
                aria-label="Excluir item"
                title="Excluir item"
                :disabled="!isItemEditable(item.status) || deletingId !== null"
                :loading="deletingId === item.id"
                @click="$emit('request-delete', item)"
              />
            </td>
          </tr>
        </tbody>
      </AdminTable>

      <EmptyState
        v-else-if="!loading"
        icon="mdi-package-variant-closed"
        :title="hasFilters ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'"
        :description="
          hasFilters
            ? 'Nenhum item corresponde aos filtros informados.'
            : 'Cadastre o primeiro item encontrado para disponibilizá-lo no catálogo.'
        "
      />

      <PaginationFooter
        v-if="pagination.total > 0"
        :page="currentPage"
        :total-pages="pagination.total_pages"
        :total-elements="pagination.total"
        :limit="perPage"
        :disabled="loading"
        @update:page="$emit('change-page', $event)"
        @update:limit="$emit('change-limit', $event)"
      />
    </template>
  </LoadingOverlay>
</template>
