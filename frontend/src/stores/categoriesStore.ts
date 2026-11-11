import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '../types'
import { categoryService } from '../services/category.service'

// Store destinada a compartilhar a lista de categorias.
export const useCategoriesStore = defineStore('categories', () => {

  // state
  const items = ref<Category[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  // actions
  async function ensureLoaded(force = false) {
    if ((loaded.value && !force) || loading.value) return
    loading.value = true
    try {
      const res = await categoryService.list()
      items.value = res
      loaded.value = true
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    loaded,
    loading,
    ensureLoaded,
  }
})
