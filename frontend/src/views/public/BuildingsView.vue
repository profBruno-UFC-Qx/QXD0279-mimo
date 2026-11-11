<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BuildingCard from '@/components/domain/BuildingCard.vue'
import { useBuildingsStore } from '@/stores/buildingsStore'

const buildings = useBuildingsStore()
onMounted(() => { void buildings.ensureLoaded() })
</script>

<template>
  <PageHeader
    title="Prédios e pontos de retirada"
    subtitle="Conheça os locais de custódia e horários de atendimento."
  />
  <ErrorAlert v-if="buildings.error" @retry="buildings.ensureLoaded(true)" />
  <LoadingOverlay :loading="buildings.loading" text="Carregando prédios...">
    <v-row v-if="buildings.items.length">
      <v-col v-for="building in buildings.items" :key="building.id" cols="12" md="6">
        <BuildingCard :building="building" />
      </v-col>
    </v-row>
    <EmptyState
      v-else-if="!buildings.loading && !buildings.error"
      icon="mdi-domain"
      title="Nenhum prédio cadastrado"
      description="Os pontos de retirada aparecerão aqui quando estiverem disponíveis."
    />
  </LoadingOverlay>
</template>
