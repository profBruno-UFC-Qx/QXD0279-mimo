<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HandoverCard from '@/components/domain/HandoverCard.vue'
import { useMyHandovers } from '@/composables/user/useMyHandovers'

const { handovers, loading, error, loadHandovers } = useMyHandovers()
</script>

<template>
  <div>
    <PageHeader
      title="Histórico de Retiradas"
      subtitle="Registro dos objetos devolvidos à sua conta."
    />

    <ErrorAlert v-if="error" :error="error" @retry="loadHandovers()" />

    <LoadingOverlay :loading="loading" text="Carregando seu histórico...">
      <template v-if="!error">
        <v-row v-if="handovers.length > 0">
          <v-col v-for="handover in handovers" :key="handover.id" cols="12" md="6">
            <HandoverCard :handover="handover" />
          </v-col>
        </v-row>

        <EmptyState
          v-else-if="!loading"
          icon="mdi-handshake-outline"
          title="Nenhuma retirada registrada"
          description="Quando um objeto encontrado for devolvido à sua conta, ele aparecerá aqui."
        />
      </template>
    </LoadingOverlay>
  </div>
</template>
