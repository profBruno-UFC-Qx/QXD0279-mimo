<script setup lang="ts">
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { Building } from '@/types'

defineProps<{
  loadingList: boolean
  listError: string | null
  filteredBuildings: Building[]
  hasAdminAccess: boolean
  submitting: boolean
  confirmingDelete: boolean
  deletingBuildingId: number | null
  buildings: Building[]
}>()

defineEmits<{
  'open-edit': [building: Building]
  'request-delete-building': [building: Building]
}>()
</script>

<template>
  <LoadingOverlay :loading="loadingList" text="Carregando prédios...">
    <template v-if="!listError">
      <v-row v-if="filteredBuildings.length > 0">
        <v-col
          v-for="building in filteredBuildings"
          :key="building.id"
          cols="12"
          md="6"
        >
          <v-card variant="flat" class="h-100 d-flex flex-column rounded-lg border pa-5">
            <div class="flex-grow-1">
              <div class="text-h6 font-weight-bold text-primary d-flex align-center ga-2 mb-1">
                <v-icon icon="mdi-domain" size="20" color="primary" />
                <span>{{ building.name }}</span>
              </div>
              <p class="d-flex align-start ga-2 text-body-2 text-medium-emphasis mb-3">
                <v-icon icon="mdi-map-marker-outline" size="18" class="mt-0.5 flex-shrink-0" />
                <span>{{ building.address }}</span>
              </p>
              <v-divider class="my-3" />
              <div class="d-flex align-center ga-2 text-body-2 mb-2">
                <v-icon icon="mdi-package-variant-closed" size="18" color="primary" />
                <span><strong>Ponto de retirada:</strong> {{ building.pickupPoint }}</span>
              </div>
              <div class="d-flex align-center ga-2 text-body-2">
                <v-icon icon="mdi-clock-outline" size="18" color="primary" />
                <span><strong>Atendimento:</strong> {{ building.serviceHours }}</span>
              </div>
            </div>

            <v-divider class="my-4" />

            <div class="d-flex justify-end flex-wrap ga-2">
              <v-btn
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-pencil-outline"
                :disabled="!hasAdminAccess || submitting || confirmingDelete || deletingBuildingId === building.id"
                @click="$emit('open-edit', building)"
              >
                Editar
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="error"
                class="text-none"
                prepend-icon="mdi-delete-outline"
                :disabled="!hasAdminAccess || submitting || confirmingDelete || deletingBuildingId !== null"
                :loading="deletingBuildingId === building.id"
                @click="$emit('request-delete-building', building)"
              >
                Excluir
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <EmptyState
        v-else-if="!loadingList"
        icon="mdi-domain"
        :title="buildings.length === 0 ? 'Nenhum prédio cadastrado' : 'Nenhum prédio encontrado'"
        :description="
          buildings.length === 0
            ? 'Cadastre o primeiro prédio para disponibilizar pontos de retirada.'
            : 'Nenhum prédio corresponde à busca informada.'
        "
      />
    </template>
  </LoadingOverlay>
</template>
