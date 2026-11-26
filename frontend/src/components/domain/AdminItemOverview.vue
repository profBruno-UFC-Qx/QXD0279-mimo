<script setup lang="ts">
import StatusChip from '@/components/common/StatusChip.vue'
import ItemPhotoGallery from '@/components/domain/ItemPhotoGallery.vue'
import { formatDate } from '@/utils/format'
import type { AdminItemDetails, DispositionType } from '@/types'

defineProps<{
  details: AdminItemDetails | null
  categoryName: string
  buildingName: string
  isEditable: boolean
}>()

const DISPOSITION_LABELS: Record<DispositionType, string> = {
  SOLD: 'Venda',
  AUCTIONED: 'Leilão',
  DONATED: 'Doação',
  DISCARDED: 'Descarte',
}
</script>

<template>
  <v-row v-if="details">
    <v-col cols="12" md="6">
      <ItemPhotoGallery :photos="details.photos" />
    </v-col>

    <v-col cols="12" md="6">
      <v-card variant="flat" class="rounded-lg border pa-5 h-100">
        <div class="d-flex align-start justify-space-between flex-wrap ga-3 mb-3">
          <div>
            <h2 class="text-h5 font-weight-bold text-primary mb-1">
              {{ details.item.title }}
            </h2>
          </div>
          <StatusChip :status="details.item.status" />
        </div>

        <p class="text-body-1 mb-4">
          {{ details.item.description || 'Sem descrição informada.' }}
        </p>

        <v-divider class="mb-4" />

        <div class="d-flex flex-column ga-3 text-body-2">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-tag-outline" size="18" color="primary" />
            <span><strong>Categoria:</strong> {{ categoryName }}</span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-domain" size="18" color="primary" />
            <span><strong>Prédio:</strong> {{ buildingName }}</span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-map-marker-outline" size="18" color="primary" />
            <span>
              <strong>Local do achado:</strong>
              {{ details.item.foundLocation || 'Não informado' }}
            </span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-calendar-outline" size="18" color="primary" />
            <span><strong>Data do achado:</strong> {{ formatDate(details.item.foundDate) }}</span>
          </div>
          <div v-if="details.item.plannedDestination" class="d-flex align-center ga-2">
            <v-icon icon="mdi-target" size="18" color="primary" />
            <span>
              <strong>Destino planejado:</strong>
              {{ DISPOSITION_LABELS[details.item.plannedDestination] }}
            </span>
          </div>
        </div>

        <v-alert
          v-if="!isEditable"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-5 rounded-lg"
        >
          Itens entregues ou destinados não podem ser editados ou excluídos.
        </v-alert>
      </v-card>
    </v-col>
  </v-row>
</template>
