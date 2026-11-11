<!--Funcionalidade: Exibe um estado vazio ilustrado com ícone, título, descrição opcional e botão de ação
quando tabelas ou listas não possuem registros-->

<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
  actionText?: string
}>()

defineEmits<{
  (e: 'action'): void
}>()
</script>

<template>
  <div class="d-flex flex-column align-center justify-center text-center py-12 px-4">
    <v-icon
      :icon="icon || 'mdi-folder-open-outline'"
      size="64"
      color="outline"
      class="mb-4"
    />
    <h3 class="text-h6 font-weight-bold text-primary mb-1">{{ title }}</h3>
    <p v-if="description" class="text-body-2 text-medium-emphasis mb-6 max-width-400">
      {{ description }}
    </p>
    <v-btn
      v-if="actionText"
      color="primary"
      class="text-none px-6"
      @click="$emit('action')"
    >
      {{ actionText }}
    </v-btn>
  </div>
</template>
