<script setup lang="ts">
const query = defineModel<string>({ required: true })
</script>

<template>
  <v-text-field
    :model-value="query"
    prepend-inner-icon="mdi-magnify"
    variant="outlined"
    density="compact"
    clearable
    hide-details
    class="mb-4"
    @update:model-value="query = $event ?? ''"
  />
</template>
