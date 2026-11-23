<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import { formatCpf, formatDateTime } from '@/utils/format'
import type { Handover } from '@/types'

defineProps<{
  detail: Handover | null
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
      Detalhes da entrega {{ detail ? `#${detail.id}` : '' }}
    </template>

    <LoadingOverlay :loading="detailLoading" text="Carregando detalhes...">
      <v-alert v-if="detailNotFound" type="warning" variant="tonal" class="rounded-lg">
        Entrega não encontrada.
      </v-alert>

      <ErrorAlert v-else-if="detailError" :error="detailError" @retry="$emit('retry-details')" />

      <div v-else-if="detail" class="d-flex flex-column ga-3 text-body-1">
        <div><strong>Entrega:</strong> #{{ detail.id }}</div>
        <div><strong>Data e hora:</strong> {{ formatDateTime(detail.handedAt) }}</div>
        <v-divider />
        <div>
          <strong>Item:</strong>
          {{ detail.item?.title ?? `Item #${detail.itemId}` }}
          <span class="text-medium-emphasis">(ID #{{ detail.itemId }})</span>
        </div>
        <div v-if="detail.item?.category">
          <strong>Categoria:</strong> {{ detail.item.category.name }}
        </div>
        <div v-if="detail.item?.building">
          <strong>Prédio:</strong> {{ detail.item.building.name }}
        </div>
        <v-divider />
        <div><strong>Retirante:</strong> {{ detail.withdrawnName }}</div>
        <div><strong>CPF:</strong> {{ formatCpf(detail.withdrawnCpf) || '—' }}</div>
        <div>
          <strong>Conta associada:</strong>
          <template v-if="detail.withdrawnUser">
            {{ detail.withdrawnUser.name }} ({{ detail.withdrawnUser.email }})
          </template>
          <template v-else-if="detail.withdrawnUserId !== null">
            Usuário #{{ detail.withdrawnUserId }}
          </template>
          <template v-else>Não associada</template>
        </div>
        <v-divider />
        <div>
          <strong>Administrador:</strong>
          {{ detail.admin?.name ?? `Admin #${detail.adminId}` }}
        </div>
      </div>
    </LoadingOverlay>

    <template #actions>
      <v-spacer />
      <v-btn variant="text" class="text-none" @click="$emit('close-details')">Fechar</v-btn>
    </template>
  </AdminDialog>
</template>
