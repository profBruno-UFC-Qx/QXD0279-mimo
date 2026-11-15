<script setup lang="ts">
const q = defineModel<string>('q', { default: '' })

defineEmits<{
  (e: 'submit'): void
  (e: 'clear'): void
}>()
</script>

<template>
  <v-card class="pa-4 mb-6 rounded-lg" variant="flat" border>
    <v-form @submit.prevent="$emit('submit')" @reset.prevent="$emit('clear')">
      <v-row align="center" density="compact">
        <v-col cols="12" md="4">
          <v-text-field
            v-model="q"
            label="Buscar por palavra-chave..."
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            density="comfortable"
          />
        </v-col>
        <slot />
        <v-col cols="12" md="auto" class="d-flex align-center mt-2 mt-md-0">
          <v-btn
            type="submit"
            color="primary"
            class="text-none px-6 mr-2"
            prepend-icon="mdi-filter-outline"
          >
            Filtrar
          </v-btn>
          <v-btn
            type="reset"
            variant="outlined"
            color="grey"
            class="text-none px-4"
            prepend-icon="mdi-filter-remove-outline"
          >
            Limpar
          </v-btn>
        </v-col>
      </v-row>
    </v-form>
  </v-card>
</template>
