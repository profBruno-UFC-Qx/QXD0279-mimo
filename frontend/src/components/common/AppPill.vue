<script setup lang="ts">
withDefaults(
  defineProps<{
    color?: string
    icon?: string
    appendIcon?: string
    size?: 'small' | 'x-small'
  }>(),
  {
    color: 'on-surface',
    icon: undefined,
    appendIcon: undefined,
    size: 'small',
  },
)
</script>

<template>
  <v-chip
    :color="color"
    :prepend-icon="icon"
    :append-icon="appendIcon"
    :size="size"
    variant="outlined"
    rounded="sm"
    class="font-weight-medium"
  >
    <slot />
  </v-chip>
</template>
