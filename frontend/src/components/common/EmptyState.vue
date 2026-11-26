<!--Funcionalidade: Exibe um estado vazio ilustrado com ícone, título, descrição opcional e botão de ação
quando tabelas ou listas não possuem registros-->

<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
  compact?: boolean
}>()
</script>

<template>
  <div
    class="d-flex flex-column align-center justify-center text-center px-4"
    :class="compact ? 'py-6' : 'py-12'"
  >
    <v-icon
      :icon="icon || 'mdi-magnify'"
      :size="compact ? 40 : 64"
      color="outline"
      class="mb-4"
    />
    <h3 class="text-h6 font-weight-bold text-primary mb-1">{{ title }}</h3>
    <p v-if="description" class="text-body-2 text-medium-emphasis mb-6 max-width-400">
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-2"><slot name="action" /></div>
  </div>
</template>
