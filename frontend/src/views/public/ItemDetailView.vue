<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { PublicItemDetails } from '@/types'
import { itemService } from '@/services/item.service'
import ItemPhotoGallery from '@/components/domain/ItemPhotoGallery.vue'
import StatusChip from '@/components/domain/StatusChip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import { formatDate } from '@/utils/format'

const route = useRoute()
const details = ref<PublicItemDetails | null>(null)
const loading = ref(false)
const error = ref(false)

async function loadItem() {
  const id = Number(route.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    details.value = null
    error.value = false
    return
  }

  loading.value = true
  error.value = false
  try {
    details.value = await itemService.getById(id)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => { void loadItem() })
</script>

<template>
  <v-btn to="/" variant="text" prepend-icon="mdi-arrow-left" class="mb-4">Voltar para itens</v-btn>

  <ErrorAlert v-if="error" @retry="loadItem" />
  <div v-else-if="loading" class="d-flex justify-center py-12">
    <v-progress-circular indeterminate color="primary" size="48" />
  </div>
  <EmptyState
    v-else-if="!details"
    icon="mdi-package-variant-closed"
    title="Item não encontrado ou indisponível"
    description="Este item pode ter sido retirado ou não está mais disponível no catálogo."
  >
    <template #action><v-btn to="/" color="primary">Voltar ao catálogo</v-btn></template>
  </EmptyState>

  <template v-else>
    <v-row>
      <v-col cols="12" md="6">
        <ItemPhotoGallery :photos="details.photos" />
      </v-col>
      <v-col cols="12" md="6">
        <div class="d-flex flex-wrap ga-2 mb-3">
          <StatusChip :status="details.item.status" kind="item" />
          <v-chip v-if="details.item.category?.name" color="primary" variant="tonal" size="small">
            {{ details.item.category.name }}
          </v-chip>
        </div>
        <h1 class="text-h4 font-weight-bold mb-4">{{ details.item.title }}</h1>
        <dl class="item-details mb-6">
          <div><dt>Categoria</dt><dd>{{ details.item.category?.name ?? 'Não informada' }}</dd></div>
          <div><dt>Data do achado</dt><dd>{{ formatDate(details.item.foundDate) }}</dd></div>
          <div><dt>Local do achado</dt><dd>{{ details.item.foundLocation ?? 'Não informado' }}</dd></div>
          <div v-if="details.item.description"><dt>Descrição</dt><dd>{{ details.item.description }}</dd></div>
        </dl>
        <v-card color="surface-muted" variant="flat" class="pa-5">
          <h2 class="text-h6 font-weight-bold mb-3">Retirada</h2>
          <p class="mb-2"><strong>{{ details.building.name }}</strong></p>
          <p class="mb-2"><strong>Ponto de retirada:</strong> {{ details.building.pickupPoint }}</p>
          <p><strong>Horário de atendimento:</strong> {{ details.building.serviceHours }}</p>
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>

<style scoped>
.item-details > div { display: grid; grid-template-columns: minmax(130px, 0.7fr) 1fr; gap: 12px; padding: 8px 0; }
.item-details dt { font-weight: 600; }
.item-details dd { margin: 0; }
</style>
