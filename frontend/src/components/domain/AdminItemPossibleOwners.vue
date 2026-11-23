<script setup lang="ts">
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import PossibleOwnerList from '@/components/domain/PossibleOwnerList.vue'
import type { AdminItemDetails, LostReport } from '@/types'

defineProps<{
  details: AdminItemDetails | null
  ownersLoading: boolean
  ownersError: string | null
  possibleOwners: LostReport[]
}>()

defineEmits<{
  'load-possible-owners': []
  'open-report': [report: LostReport]
}>()
</script>

<template>
  <v-row v-if="details" class="mt-2">
    <v-col cols="12">
      <v-card variant="flat" class="rounded-lg border pa-5">
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-1">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-account-search-outline" size="22" color="primary" />
            <h3 class="text-h6 font-weight-bold text-primary mb-0">Possíveis donos</h3>
          </div>
          <v-chip
            v-if="!ownersLoading && !ownersError"
            size="small"
            variant="tonal"
            color="primary"
          >
            {{ possibleOwners.length }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Relatos de perda compatíveis com categoria, prédio e data do achado. A
          correspondência indica apenas uma possibilidade e não comprova a propriedade.
        </p>

        <ErrorAlert v-if="ownersError" :error="ownersError" @retry="$emit('load-possible-owners')" />

        <LoadingOverlay
          v-else
          :loading="ownersLoading"
          text="Carregando possíveis donos..."
        >
          <PossibleOwnerList :owners="possibleOwners" @close-report="$emit('open-report', $event)" />
        </LoadingOverlay>
      </v-card>
    </v-col>
  </v-row>
</template>
