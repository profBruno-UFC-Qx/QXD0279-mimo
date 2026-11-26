<script setup lang="ts">
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PaginationFooter from '@/components/common/PaginationFooter.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { formatDate } from '@/utils/format'
import type { LostReport, PaginationMeta } from '@/types'

defineProps<{
  loadingList: boolean
  listError: string | null
  outOfRangeError: boolean
  hasAdminAccess: boolean
  reports: LostReport[]
  pagination: PaginationMeta
  formatCategoryLabel: (id: number) => string
  formatBuildingLabel: (id: number | null) => string
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
  <LoadingOverlay :loading="loadingList" text="Carregando relatos de perda...">
    <template v-if="!listError && !outOfRangeError && hasAdminAccess">
      <div v-if="reports.length > 0" class="text-body-2 text-medium-emphasis mb-3">
        Encontrados: <strong class="text-primary">{{ pagination.total }}</strong>
        {{ pagination.total === 1 ? 'relato' : 'relatos' }}
      </div>

      <v-row v-if="reports.length > 0">
        <v-col
          v-for="report in reports"
          :key="report.id"
          cols="12"
          md="6"
        >
          <v-card variant="flat" class="pa-5 rounded-lg border fill-height d-flex flex-column justify-space-between">
            <div>
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-subtitle-1 font-weight-bold text-primary">
                  Relato de perda
                </span>
                <StatusChip :status="report.status" type="lost_report" />
              </div>

              <p class="text-body-1 admin-report-description mb-3">{{ report.description }}</p>

              <div class="text-body-2 text-medium-emphasis d-flex flex-column ga-1">
                <div class="d-flex align-center ga-2">
                  <v-icon icon="mdi-tag-outline" size="16" />
                  <span>Categoria: {{ formatCategoryLabel(report.categoryId) }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon icon="mdi-domain" size="16" />
                  <span>Prédio: {{ formatBuildingLabel(report.buildingId) }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon icon="mdi-calendar-outline" size="16" />
                  <span>Data da perda: {{ formatDate(report.lossDate) }}</span>
                </div>
                <div v-if="report.confirmedItemId !== null" class="d-flex align-center ga-2 text-success font-weight-medium">
                  <v-icon icon="mdi-check-circle-outline" size="16" />
                  <span>Item confirmado</span>
                </div>
              </div>
            </div>

            <v-divider class="my-3" />

            <div class="d-flex align-center justify-space-between flex-wrap ga-2">
              <v-btn
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-eye-outline"
                @click="$emit('open-details', report.id)"
              >
                Ver detalhes
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <EmptyState
        v-else-if="!loadingList"
        icon="mdi-clipboard-text-outline"
        title="Nenhum relato de perda encontrado"
        description="Não há relatos correspondentes aos filtros atuais."
      />

      <PaginationFooter
        v-if="pagination.total > 0"
        :page="currentPage"
        :total-pages="pagination.total_pages"
        :total-elements="pagination.total"
        :limit="perPage"
        :disabled="!hasAdminAccess"
        @update:page="$emit('handle-page-change', $event)"
        @update:limit="$emit('handle-limit-change', $event)"
      />
    </template>
  </LoadingOverlay>
</template>

<style scoped>
.admin-report-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
