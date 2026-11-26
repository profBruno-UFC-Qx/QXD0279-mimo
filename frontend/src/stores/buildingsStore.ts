import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Building } from '../types'
import { buildingService } from '../services/building.service'
import { isValidBuildingList } from '../utils/adminBuildings'

export interface InvalidateCatalogOptions {
  revalidateIfObserved?: boolean
}

// Store destinada a compartilhar o catálogo público de prédios com proteção contra corridas.
export const useBuildingsStore = defineStore('buildings', () => {
  const items = ref<Building[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(false)

  let latestReqId = 0
  let mutationEpoch = 0
  let pendingWriteCount = 0
  let consumerCount = 0

  async function ensureLoaded(force = false) {
    if (loaded.value && !force && pendingWriteCount === 0) return
    if (!force && loading.value) return

    const reqId = ++latestReqId
    const epochAtStart = mutationEpoch
    loading.value = true
    error.value = false

    try {
      const res = await buildingService.list()
      if (reqId !== latestReqId || epochAtStart !== mutationEpoch) return
      if (!isValidBuildingList(res)) {
        throw new Error('Lista de prédios inválida')
      }
      items.value = res
      loaded.value = true
    } catch {
      if (reqId !== latestReqId || epochAtStart !== mutationEpoch) return
      items.value = []
      loaded.value = false
      error.value = true
    } finally {
      if (reqId === latestReqId) {
        loading.value = false
      }
    }
  }

  function syncCatalog(nextItems: Building[]) {
    if (!isValidBuildingList(nextItems)) return
    ++latestReqId
    ++mutationEpoch
    items.value = [...nextItems]
    loaded.value = true
    loading.value = false
    error.value = false
  }

  function invalidateCatalog(options: InvalidateCatalogOptions = {}) {
    ++latestReqId
    ++mutationEpoch
    loaded.value = false
    loading.value = false
    error.value = false
    if (options.revalidateIfObserved && consumerCount > 0) {
      void ensureLoaded(true)
    }
  }

  function beginWrite() {
    pendingWriteCount += 1
  }

  function endWrite() {
    pendingWriteCount = Math.max(0, pendingWriteCount - 1)
  }

  function acquireConsumer() {
    consumerCount += 1
    let released = false
    return () => {
      if (released) return
      released = true
      consumerCount = Math.max(0, consumerCount - 1)
    }
  }

  return {
    items,
    loaded,
    loading,
    error,
    ensureLoaded,
    syncCatalog,
    invalidateCatalog,
    beginWrite,
    endWrite,
    acquireConsumer,
  }
})
