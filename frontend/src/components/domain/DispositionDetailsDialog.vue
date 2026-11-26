<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import { formatDateTime } from '@/utils/format'
import { DISPOSITION_LABELS } from '@/utils/dispositions'
import type { Disposition } from '@/types'

defineProps<{
  detail: Disposition | null
  detailLoading: boolean
  detailNotFound: boolean
  detailError: string | null
}>()

defineEmits<{
  'close-details': []
  'retry-details': []
}>()

const detailOpen = defineModel<boolean>('detailOpen', { required: true })
</script>

<template>
  <AdminDialog v-model="detailOpen" max-width="620" persistent>
    <template #title>
      Detalhes da destinação
    </template>

    <LoadingOverlay :loading="detailLoading" text="Carregando detalhes...">
      <v-alert v-if="detailNotFound" type="warning" variant="tonal" class="rounded-lg">
        Destinação não encontrada.
      </v-alert>

      <ErrorAlert v-else-if="detailError" :error="detailError" @retry="$emit('retry-details')" />

      <div v-else-if="detail" class="d-flex flex-column ga-3 text-body-1">
        <div><strong>Data e hora:</strong> {{ formatDateTime(detail.executedAt) }}</div>
        <v-divider />
        <div>
          <strong>Item:</strong>
          {{ detail.item?.title ?? 'Item indisponível' }}
        </div>
        <div v-if="detail.item?.category">
          <strong>Categoria:</strong> {{ detail.item.category.name }}
        </div>
        <div v-if="detail.item?.building">
          <strong>Prédio:</strong> {{ detail.item.building.name }}
        </div>
        <v-divider />
        <div>
          <strong>Tipo:</strong> {{ DISPOSITION_LABELS[detail.destination] }}
        </div>
        <div>
          <strong>Documento do destinatário:</strong> {{ detail.receiverDocument }}
        </div>
        <v-divider />
        <div>
          <strong>Administrador:</strong>
          {{ detail.admin?.name ?? 'Administrador' }}
        </div>
      </div>
    </LoadingOverlay>

    <template #actions>
      <v-spacer />
      <v-btn variant="text" class="text-none" @click="$emit('close-details')">Fechar</v-btn>
    </template>
  </AdminDialog>
</template>
