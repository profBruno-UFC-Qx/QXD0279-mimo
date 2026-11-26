<script setup lang="ts">
import PageOutOfRangeAlert from '@/components/common/PageOutOfRangeAlert.vue'
import AdminTable from '@/components/common/AdminTable.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { formatDate } from '@/utils/format'
import { DISPOSITION_LABELS } from '@/utils/dispositions'
import type { Item, PaginationMeta } from '@/types'

defineProps<{
  eligibleError: string | null
  eligiblePageWithoutResults: boolean
  eligibleLoading: boolean
  eligibleItems: Item[]
  categoryLabel: (id: number) => string
  buildingLabel: (id: number) => string
  hasAdminAccess: boolean
  eligiblePagination: PaginationMeta
  eligiblePage: number
  eligiblePerPage: number
}>()

defineEmits<{
  'load-eligible-items': []
  'return-to-first-eligible-page': []
  'open-disposition': [item: Item]
  'change-eligible-page': [page: number]
  'change-eligible-limit': [limit: number]
}>()
</script>

<template>
  <v-alert type="info" variant="tonal" class="mb-4 rounded-lg">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span>
        A elegibilidade é calculada no Dashboard administrativo, após as regras de
        destinação serem configuradas.
      </span>
      <v-btn
        :to="{ name: 'admin-dashboard' }"
        size="small"
        variant="text"
        color="primary"
        class="text-none"
      >
        Ir para o Dashboard
      </v-btn>
    </div>
  </v-alert>

  <ErrorAlert v-if="eligibleError" :error="eligibleError" @retry="$emit('load-eligible-items')" />

  <PageOutOfRangeAlert v-if="eligiblePageWithoutResults" @reset="$emit('return-to-first-eligible-page')">
    A página solicitada não possui itens elegíveis.
  </PageOutOfRangeAlert>

  <LoadingOverlay :loading="eligibleLoading" text="Carregando itens elegíveis...">
    <template v-if="!eligibleError">
      <AdminTable v-if="eligibleItems.length > 0">
        <thead>
          <tr>
            <th class="text-left">Item</th>
            <th class="text-left">Categoria</th>
            <th class="text-left">Prédio</th>
            <th class="text-left">Achado em</th>
            <th class="text-left">Status</th>
            <th class="text-left">Destino planejado</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in eligibleItems" :key="item.id">
            <td>
              <div class="font-weight-medium">{{ item.title }}</div>
            </td>
            <td>{{ categoryLabel(item.categoryId) }}</td>
            <td>{{ buildingLabel(item.buildingId) }}</td>
            <td>{{ formatDate(item.foundDate) }}</td>
            <td><StatusChip :status="item.status" /></td>
            <td>
              {{
                item.plannedDestination
                  ? DISPOSITION_LABELS[item.plannedDestination]
                  : 'Não definido'
              }}
            </td>
            <td class="text-right text-no-wrap">
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                class="text-none"
                prepend-icon="mdi-delete-sweep-outline"
                :aria-label="`Destinar item ${item.id}`"
                :disabled="!hasAdminAccess"
                @click="$emit('open-disposition', item)"
              >
                Destinar
              </v-btn>
            </td>
          </tr>
        </tbody>
      </AdminTable>

      <EmptyState
        v-else-if="!eligibleLoading && !eligiblePageWithoutResults"
        icon="mdi-delete-clock-outline"
        title="Nenhum item elegível"
        description="Execute o processamento de elegibilidade no Dashboard após configurar as regras de destinação."
      />

      <PaginationFooter
        v-if="eligiblePagination.total > 0"
        :page="eligiblePage"
        :total-pages="eligiblePagination.total_pages"
        :total-elements="eligiblePagination.total"
        :limit="eligiblePerPage"
        :disabled="eligibleLoading"
        @update:page="$emit('change-eligible-page', $event)"
        @update:limit="$emit('change-eligible-limit', $event)"
      />
    </template>
  </LoadingOverlay>
</template>
