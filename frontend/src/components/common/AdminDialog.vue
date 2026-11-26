<script setup lang="ts">
defineProps<{
  maxWidth: number | string
  persistent?: boolean
  hideCardWhenClosed?: boolean
  cardTestId?: string
  titleClass?: string
  actionsClass?: string
}>()

const open = defineModel<boolean>({ required: true })
</script>

<template>
  <v-dialog v-model="open" :max-width="maxWidth" :persistent="persistent">
    <v-card v-if="!hideCardWhenClosed || open" :data-test="cardTestId" class="rounded-lg pa-2">
      <v-card-title :class="titleClass ?? 'text-h6 font-weight-bold text-primary'" class="px-4 pt-4">
        <slot name="title" />
      </v-card-title>
      <v-card-text class="px-4 py-3">
        <slot />
      </v-card-text>
      <v-card-actions class="px-4 pb-4 pt-2" :class="actionsClass">
        <slot name="actions" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
