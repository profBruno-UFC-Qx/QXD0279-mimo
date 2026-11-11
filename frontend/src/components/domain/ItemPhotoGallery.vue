<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ItemPhoto } from '@/types'

const props = defineProps<{ photos: ItemPhoto[] }>()
const selectedIndex = ref(0)
const selectedPhoto = computed(() => props.photos[selectedIndex.value])

watch(() => props.photos, () => { selectedIndex.value = 0 })
</script>

<template>
  <div>
    <v-img
      v-if="selectedPhoto?.photoUrl"
      :src="selectedPhoto.photoUrl"
      height="420"
      cover
      class="rounded-lg bg-surface-muted"
      :alt="`Foto ${selectedIndex + 1}`"
    />
    <div v-else class="d-flex align-center justify-center rounded-lg bg-surface-muted" style="height: 420px">
      <v-icon icon="mdi-image" size="72" color="outline" aria-label="Nenhuma foto disponível" />
    </div>
    <div v-if="photos.length > 1" class="d-flex ga-3 mt-3 overflow-x-auto">
      <v-btn
        v-for="(photo, index) in photos"
        :key="photo.id"
        :aria-label="`Exibir foto ${index + 1}`"
        :variant="index === selectedIndex ? 'outlined' : 'text'"
        :color="index === selectedIndex ? 'primary' : undefined"
        class="pa-0 flex-shrink-0"
        min-width="72"
        width="72"
        height="64"
        @click="selectedIndex = index"
      >
        <v-img :src="photo.photoUrl" :alt="`Miniatura ${index + 1}`" width="72" height="64" cover />
      </v-btn>
    </div>
  </div>
</template>
