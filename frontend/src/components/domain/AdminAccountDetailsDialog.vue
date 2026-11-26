<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import { formatDateTime } from '@/utils/format'
import type { User } from '@/types'

defineProps<{
  loadingDetail: boolean
  detailError: string | null
  showReloadOnDetailError: boolean
  detailAdmin: User | null
}>()

defineEmits<{
  'close-detail': []
  'retry-detail': []
  'reload-list-from-detail-error': []
}>()

const detailOpen = defineModel<boolean>('detailOpen', { required: true })
</script>

<template>
  <AdminDialog
    v-model="detailOpen"
    max-width="520"
    hide-card-when-closed
    card-test-id="admin-detail-dialog"
  >
    <template #title>
      Detalhes do administrador
    </template>

    <div v-if="loadingDetail" class="d-flex align-center ga-3 py-4">
      <v-progress-circular indeterminate color="primary" size="24" />
      <span class="text-body-2 text-medium-emphasis">
        Carregando detalhes do administrador...
      </span>
    </div>

    <v-alert
      v-else-if="detailError"
      type="error"
      variant="tonal"
      class="rounded-lg"
    >
      <div class="d-flex flex-column ga-2">
        <span>{{ detailError }}</span>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            v-if="showReloadOnDetailError"
            size="small"
            variant="outlined"
            color="error"
            class="text-none"
            @click="$emit('reload-list-from-detail-error')"
          >
            Atualizar listagem
          </v-btn>
          <v-btn
            v-else
            size="small"
            variant="text"
            color="error"
            class="text-none"
            @click="$emit('retry-detail')"
          >
            Tentar novamente
          </v-btn>
        </div>
      </div>
    </v-alert>

    <div v-else-if="detailAdmin" class="d-flex flex-column ga-2 text-body-2">
      <div>
        <span class="font-weight-bold">Conta administrativa</span>
      </div>
      <div>
        <span class="font-weight-bold">Nome:</span> {{ detailAdmin.name }}
      </div>
      <div>
        <span class="font-weight-bold">E-mail:</span> {{ detailAdmin.email }}
      </div>
      <div>
        <span class="font-weight-bold">Telefone:</span>
        {{ detailAdmin.phone || 'Não informado' }}
      </div>
      <div>
        <span class="font-weight-bold">Papel:</span> {{ detailAdmin.role }}
      </div>
      <div>
        <span class="font-weight-bold">Criado em:</span>
        {{ formatDateTime(detailAdmin.createdAt) }}
      </div>
      <div>
        <span class="font-weight-bold">Atualizado em:</span>
        {{ formatDateTime(detailAdmin.updatedAt) }}
      </div>
    </div>

    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        class="text-none"
        @click="$emit('close-detail')"
      >
        Fechar
      </v-btn>
    </template>
  </AdminDialog>
</template>
