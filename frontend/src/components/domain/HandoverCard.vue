<script setup lang="ts">
import type { Handover } from '@/types'
import { formatDateTime } from '@/utils/format'

defineProps<{
  handover: Handover
}>()
</script>

<template>
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
</template>
