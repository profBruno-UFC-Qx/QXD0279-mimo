<script setup lang="ts">
import AdminTable from '@/components/common/AdminTable.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import { formatCpf, formatDateTime } from '@/utils/format'
import type { Handover, PaginationMeta } from '@/types'

defineProps<{
  loading: boolean
  listError: string | null
  handovers: Handover[]
  pageWithoutResults: boolean
  hasFilters: boolean
  pagination: PaginationMeta
  currentPage: number
  perPage: number
}>()

defineEmits<{
  'open-details': [id: number]
  'handle-page-change': [page: number]
  'handle-limit-change': [limit: number]
}>()
</script>

<template>
  <LoadingOverlay :loading="loading" text="Carregando entregas...">
    <template v-if="!listError">
      <AdminTable v-if="handovers.length > 0">
        <thead>
          <tr>
            <th class="text-left">Entrega</th>
            <th class="text-left">Item</th>
            <th class="text-left">Retirante</th>
            <th class="text-left">CPF</th>
            <th class="text-left">Administrador</th>
            <th class="text-left">Data e hora</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="handover in handovers" :key="handover.id">
            <td class="font-weight-medium">#{{ handover.id }}</td>
            <td>
              {{ handover.item?.title ?? `Item #${handover.itemId}` }}
            </td>
            <td>{{ handover.withdrawnName }}</td>
            <td>{{ formatCpf(handover.withdrawnCpf) || '—' }}</td>
            <td>{{ handover.admin?.name ?? `Admin #${handover.adminId}` }}</td>
            <td>{{ formatDateTime(handover.handedAt) }}</td>
            <td class="text-right text-no-wrap">
              <v-btn
                icon="mdi-eye-outline"
                size="small"
                variant="text"
                color="primary"
                :aria-label="`Ver detalhes da entrega ${handover.id}`"
                title="Ver detalhes"
                @click="$emit('open-details', handover.id)"
              />
            </td>
          </tr>
        </tbody>
      </AdminTable>

      <EmptyState
        v-else-if="!loading && !pageWithoutResults"
        icon="mdi-handshake-outline"
        :title="hasFilters ? 'Nenhuma entrega encontrada' : 'Nenhuma entrega registrada'"
        :description="
          hasFilters
            ? 'Nenhuma retirada corresponde aos filtros informados.'
            : 'As retiradas registradas a partir dos itens encontrados aparecerão aqui.'
        "
      />

      <PaginationFooter
        v-if="pagination.total > 0"
        :page="currentPage"
        :total-pages="pagination.total_pages"
        :total-elements="pagination.total"
        :limit="perPage"
        :disabled="loading"
        @update:page="$emit('handle-page-change', $event)"
        @update:limit="$emit('handle-limit-change', $event)"
      />
    </template>
  </LoadingOverlay>
</template>
