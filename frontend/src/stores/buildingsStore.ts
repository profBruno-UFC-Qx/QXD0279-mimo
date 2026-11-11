import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Building } from '../types'
import { buildingService } from '../services/building.service'

// Store destinada a compartilhar prédios.
export const useBuildingsStore = defineStore('buildings', () => {
  // state
  const items = ref<Building[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(false)

  // actions: Carrega prédios sob demanda e evita repetir a consulta após o primeiro sucesso,
  async function ensureLoaded(force = false) {
    if ((loaded.value && !force) || loading.value) return
    loading.value = true
    error.value = false
    try {
      const res = await buildingService.list()
      items.value = res
      loaded.value = true
    } catch {
      items.value = []
      error.value = true
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    loaded,
    loading,
    error,
    ensureLoaded,
  }
})
