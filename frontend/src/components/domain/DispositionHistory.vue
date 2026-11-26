<script setup lang="ts">
import PageOutOfRangeAlert from '@/components/common/PageOutOfRangeAlert.vue'
import AdminTable from '@/components/common/AdminTable.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import { formatDateTime } from '@/utils/format'
import { DISPOSITION_LABELS, DISPOSITION_OPTIONS } from '@/utils/dispositions'
import type { Disposition, DispositionType, PaginationMeta } from '@/types'
import { type DispositionHistoryFilters } from '@/types/adminFilters'

defineProps<{
  hasAdminAccess: boolean
  historyFilterError: string | null
  historyError: string | null
  historyPageWithoutResults: boolean
  historyLoading: boolean
  history: Disposition[]
  hasHistoryFilters: boolean
  historyPagination: PaginationMeta
  historyPage: number
  historyPerPage: number
}>()

defineEmits<{
  'apply-history-filters': []
  'clear-history-filters': []
  'load-history': []
  'return-to-first-history-page': []
  'open-details': [id: number]
  'change-history-page': [page: number]
  'change-history-limit': [limit: number]
}>()

const draftHistoryFilters = defineModel<DispositionHistoryFilters>('draftHistoryFilters', { required: true })

const historyDestinationOptions = [
  { title: 'Todos', value: null as DispositionType | null },
  ...DISPOSITION_OPTIONS,
]
</script>

<template>
  <v-card variant="flat" border class="pa-4 mb-6 rounded-lg">
    <v-row density="compact" align="center">
      <v-col cols="12" sm="6" md="3">
        <v-select
          :model-value="draftHistoryFilters.destination"
          @update:model-value="draftHistoryFilters = { ...draftHistoryFilters, destination: $event }"
          :items="historyDestinationOptions"
          item-title="title"
          item-value="value"
          label="Tipo de destinação"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <DatePickerField
          :model-value="draftHistoryFilters.from"
          label="De"
          @update:model-value="draftHistoryFilters = { ...draftHistoryFilters, from: $event ?? null }"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <DatePickerField
          :model-value="draftHistoryFilters.to"
          label="Até"
          @update:model-value="draftHistoryFilters = { ...draftHistoryFilters, to: $event ?? null }"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3" class="d-flex justify-end flex-wrap ga-2">
        <v-btn
          variant="text"
          class="text-none"
          :disabled="!hasAdminAccess"
          @click="$emit('clear-history-filters')"
        >
          Limpar
        </v-btn>
        <v-btn
          color="primary"
          class="text-none"
          prepend-icon="mdi-filter-outline"
          :disabled="!hasAdminAccess"
          @click="$emit('apply-history-filters')"
        >
          Filtrar
        </v-btn>
      </v-col>
    </v-row>
  </v-card>

  <v-alert v-if="historyFilterError" type="warning" variant="tonal" class="mb-4 rounded-lg">
    {{ historyFilterError }}
  </v-alert>

  <ErrorAlert v-if="historyError" :error="historyError" @retry="$emit('load-history')" />

  <PageOutOfRangeAlert v-if="historyPageWithoutResults" @reset="$emit('return-to-first-history-page')">
    A página solicitada não possui destinações.
  </PageOutOfRangeAlert>

  <LoadingOverlay :loading="historyLoading" text="Carregando histórico de destinações...">
    <template v-if="!historyError">
      <AdminTable v-if="history.length > 0">
        <thead>
          <tr>
            <th class="text-left">Item</th>
            <th class="text-left">Tipo</th>
            <th class="text-left">Documento</th>
            <th class="text-left">Administrador</th>
            <th class="text-left">Data e hora</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="disposition in history" :key="disposition.id">
            <td>{{ disposition.item?.title ?? 'Item indisponível' }}</td>
            <td>{{ DISPOSITION_LABELS[disposition.destination] }}</td>
            <td>{{ disposition.receiverDocument }}</td>
            <td>
              {{ disposition.admin?.name ?? 'Administrador' }}
            </td>
            <td>{{ formatDateTime(disposition.executedAt) }}</td>
            <td class="text-right text-no-wrap">
              <v-btn
                icon="mdi-eye-outline"
                size="small"
                variant="text"
                color="primary"
                :aria-label="`Ver detalhes da destinação ${disposition.id}`"
                title="Ver detalhes"
                @click="$emit('open-details', disposition.id)"
              />
            </td>
          </tr>
        </tbody>
      </AdminTable>

      <EmptyState
        v-else-if="!historyLoading && !historyPageWithoutResults"
        icon="mdi-delete-sweep-outline"
        :title="hasHistoryFilters ? 'Nenhuma destinação encontrada' : 'Nenhuma destinação registrada'"
        :description="
          hasHistoryFilters
            ? 'Nenhuma destinação corresponde aos filtros informados.'
            : 'As destinações executadas aparecerão aqui, mesmo que o item mude de status.'
        "
      />

      <PaginationFooter
        v-if="historyPagination.total > 0"
        :page="historyPage"
        :total-pages="historyPagination.total_pages"
        :total-elements="historyPagination.total"
        :limit="historyPerPage"
        :disabled="historyLoading"
        @update:page="$emit('change-history-page', $event)"
        @update:limit="$emit('change-history-limit', $event)"
      />
    </template>
  </LoadingOverlay>
</template>
