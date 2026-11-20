<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Handover } from '@/types'
import { handoverService } from '@/services/handover.service'
import { useAuthStore } from '@/stores/authStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatDateTime } from '@/utils/format'
import { extractLostReportErrorMessage } from '@/utils/lostReport'

const auth = useAuthStore()

const handovers = ref<Handover[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

let latestRequestId = 0

async function loadHandovers() {
  if (!auth.token) return

  const requestId = ++latestRequestId
  loading.value = true
  error.value = null

  try {
    const res = await handoverService.mine()
    if (requestId !== latestRequestId) return
    handovers.value = res
  } catch (err: unknown) {
    if (requestId !== latestRequestId) return
    handovers.value = []
    error.value = extractLostReportErrorMessage(
      err,
      'Não foi possível carregar seu histórico de retiradas. Tente novamente.',
    )
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

onMounted(() => {
  if (!auth.token) return
  void loadHandovers()
})

onBeforeUnmount(() => {
  ++latestRequestId
})
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
            <v-card variant="flat" class="rounded-lg border pa-5 h-100">
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <v-chip size="small" variant="tonal" color="primary">
                  Entrega #{{ handover.id }}
                </v-chip>
                <span class="text-body-2 text-medium-emphasis">
                  {{ formatDateTime(handover.handedAt) }}
                </span>
              </div>

              <h2 class="text-h6 font-weight-bold text-primary mb-2">
                {{ handover.item?.title ?? `Item #${handover.itemId}` }}
              </h2>

              <div class="d-flex flex-column ga-2 text-body-2 text-medium-emphasis">
                <div v-if="handover.item?.category" class="d-flex align-center ga-2">
                  <v-icon icon="mdi-tag-outline" size="16" />
                  <span>Categoria: {{ handover.item.category.name }}</span>
                </div>
                <div v-if="handover.item?.building" class="d-flex align-center ga-2">
                  <v-icon icon="mdi-domain" size="16" />
                  <span>Prédio: {{ handover.item.building.name }}</span>
                </div>
                <div v-if="handover.admin" class="d-flex align-center ga-2">
                  <v-icon icon="mdi-account-tie-outline" size="16" />
                  <span>Entregue por: {{ handover.admin.name }}</span>
                </div>
              </div>
            </v-card>
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
