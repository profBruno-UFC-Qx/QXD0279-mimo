<script setup lang="ts">
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatDate } from '@/utils/format'
import type { User } from '@/types'

defineProps<{
  loadingList: boolean
  listError: string | null
  filteredAdmins: User[]
  hasSuperAdminAccess: boolean
  deletingAdminId: number | null
  submittingCreate: boolean
  confirmingDelete: boolean
  admins: User[]
}>()

defineEmits<{
  'open-detail': [admin: User]
  'request-delete-admin': [admin: User]
}>()
</script>

<template>
  <LoadingOverlay :loading="loadingList" text="Carregando administradores...">
    <template v-if="!listError">
      <v-card v-if="filteredAdmins.length > 0" variant="flat" class="rounded-lg border">
        <div class="d-flex align-center justify-space-between px-4 py-3 bg-surface-variant-light border-b">
          <span class="text-subtitle-2 font-weight-bold text-primary">
            Administradores cadastrados
          </span>
          <v-chip size="small" variant="tonal" color="primary">
            {{ filteredAdmins.length }}
          </v-chip>
        </div>

        <template v-for="(admin, index) in filteredAdmins" :key="admin.id">
          <div
            data-test="admin-row"
            class="d-flex align-center justify-space-between flex-wrap ga-3 px-4 py-3"
          >
            <div class="d-flex flex-column ga-1">
              <div class="d-flex align-center flex-wrap ga-2">
                <v-icon icon="mdi-shield-account-outline" size="20" color="primary" />
                <span class="text-body-1 font-weight-medium">{{ admin.name }}</span>
                <v-chip size="x-small" variant="tonal" color="primary">
                  {{ admin.role }}
                </v-chip>
              </div>
              <div class="d-flex align-center flex-wrap ga-3 text-body-2 text-medium-emphasis">
                <span>{{ admin.email }}</span>
                <span>Telefone: {{ admin.phone || 'Não informado' }}</span>
                <span>Cadastro: {{ formatDate(admin.createdAt) }}</span>
              </div>
            </div>

            <div class="d-flex align-center flex-wrap ga-2">
              <v-btn
                data-test="admin-detail-btn"
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-eye-outline"
                :disabled="!hasSuperAdminAccess || deletingAdminId === admin.id"
                @click="$emit('open-detail', admin)"
              >
                Detalhes
              </v-btn>
              <v-btn
                data-test="admin-delete-btn"
                size="small"
                variant="tonal"
                color="error"
                class="text-none"
                prepend-icon="mdi-delete-outline"
                :disabled="
                  !hasSuperAdminAccess ||
                  submittingCreate ||
                  confirmingDelete ||
                  deletingAdminId !== null
                "
                :loading="deletingAdminId === admin.id"
                @click="$emit('request-delete-admin', admin)"
              >
                Excluir
              </v-btn>
            </div>
          </div>
          <v-divider v-if="index < filteredAdmins.length - 1" />
        </template>
      </v-card>

      <EmptyState
        v-else-if="!loadingList"
        icon="mdi-shield-account-outline"
        :title="
          admins.length === 0
            ? 'Nenhum administrador cadastrado'
            : 'Nenhum administrador encontrado'
        "
        :description="
          admins.length === 0
            ? 'Cadastre a primeira conta administrativa comum para gerenciar o sistema.'
            : 'Nenhum administrador corresponde à busca informada.'
        "
      />
    </template>
  </LoadingOverlay>
</template>
