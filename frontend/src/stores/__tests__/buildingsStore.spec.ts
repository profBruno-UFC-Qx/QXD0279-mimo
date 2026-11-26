import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useBuildingsStore } from '../buildingsStore'
import { buildingService } from '@/services/building.service'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import BuildingsView from '@/views/public/BuildingsView.vue'
import { vuetify } from '@/theme'
import type { Building } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 1,
  name: 'Bloco 1',
  address: 'Campus Quixadá, Av. A',
  pickupPoint: 'Recepção Bloco 1',
  serviceHours: 'Segunda a sexta, 8h às 17h',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('useBuildingsStore (Etapa 13 — sincronização de catálogo)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('K01 & K02 — ensureLoaded() carrega catálogo público uma vez e evita repetição desnecessária sem force', async () => {
    const initial = [makeBuilding({ id: 1, name: 'Biblioteca' })]
    const listSpy = vi.spyOn(buildingService, 'list').mockResolvedValueOnce(initial)

    const store = useBuildingsStore()
    await store.ensureLoaded()
    await store.ensureLoaded()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(store.items).toEqual(initial)
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(false)
  })

  it('K03 — ensureLoaded(true) consulta dados atuais e atualiza o catálogo', async () => {
    const initial = [makeBuilding({ id: 1, name: 'Bloco Antigo' })]
    const updated = [makeBuilding({ id: 1, name: 'Bloco Atualizado' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated)

    const store = useBuildingsStore()
    await store.ensureLoaded()
    await store.ensureLoaded(true)

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual(updated)
  })

  it('K04 — GET público antigo iniciado antes de mutação confirmada não sobrescreve dados mais recentes', async () => {
    let resolveStaleGet!: (val: Building[]) => void
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveStaleGet = r }))
      .mockResolvedValueOnce([makeBuilding({ id: 1, name: 'Bloco Novo' })])

    const store = useBuildingsStore()
    const firstPromise = store.ensureLoaded()

    // Mutação administrativa concluída (ex: PATCH) força refresh enquanto GET antigo estava pendente
    const refreshPromise = store.ensureLoaded(true)
    await refreshPromise
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items[0].name).toBe('Bloco Novo')

    // GET antigo termina depois com nome antigo -> NÃO pode sobrescrever
    resolveStaleGet([makeBuilding({ id: 1, name: 'Bloco Obsoleto' })])
    await firstPromise

    expect(store.items[0].name).toBe('Bloco Novo')
  })

  it('K05 — ensureLoaded(true) solicitado durante GET público pendente não se perde silenciosamente (inclusive após DELETE)', async () => {
    let resolveOldGet!: (val: Building[]) => void
    let resolveFreshGet!: (val: Building[]) => void
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveOldGet = r }))
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveFreshGet = r }))

    const store = useBuildingsStore()
    const oldPromise = store.ensureLoaded()
    expect(store.loading).toBe(true)

    // Mesmo com loading === true, DELETE confirmada exige novo GET
    const refreshPromise = store.ensureLoaded(true)
    expect(listSpy).toHaveBeenCalledTimes(2)

    resolveFreshGet([])
    await refreshPromise
    expect(store.items).toEqual([])

    resolveOldGet([makeBuilding({ id: 9, name: 'Prédio Excluído' })])
    await oldPromise
    expect(store.items).toEqual([])
  })

  it('K06 — falha na atualização é recuperável por nova chamada', async () => {
    vi.spyOn(buildingService, 'list')
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce([makeBuilding({ id: 3, name: 'Bloco C' })])

    const store = useBuildingsStore()
    await store.ensureLoaded()
    expect(store.error).toBe(true)
    expect(store.items).toEqual([])

    await store.ensureLoaded(true)
    expect(store.error).toBe(false)
    expect(store.items).toHaveLength(1)
  })

  it('K07 & K08 — GET antigo que termina antes do GET novo não limpa loading pertencente ao novo', async () => {
    let resolveFirst!: (val: Building[]) => void
    let resolveSecond!: (val: Building[]) => void
    vi.spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveSecond = r }))

    const store = useBuildingsStore()
    const p1 = store.ensureLoaded()
    const p2 = store.ensureLoaded(true)
    expect(store.loading).toBe(true)

    resolveFirst([makeBuilding({ id: 1, name: 'Antigo' })])
    await p1
    expect(store.loading).toBe(true)

    resolveSecond([makeBuilding({ id: 2, name: 'Atual' })])
    await p2
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([makeBuilding({ id: 2, name: 'Atual' })])
  })

  it('K09 & K10 — BuildingSelect.vue e BuildingsView.vue consomem o catálogo atualizado após refresh', async () => {
    vi.spyOn(buildingService, 'list')
      .mockResolvedValueOnce([makeBuilding({ id: 1, name: 'Bloco Antigo' })])
      .mockResolvedValueOnce([makeBuilding({ id: 1, name: 'Bloco Atualizado' })])

    const Host = defineComponent({
      components: { BuildingSelect, BuildingsView },
      template: '<div><BuildingSelect /><BuildingsView /></div>',
    })
    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Bloco Antigo')

    const store = useBuildingsStore()
    await store.ensureLoaded(true)
    await flushPromises()

    expect(wrapper.text()).toContain('Bloco Atualizado')
    expect(wrapper.text()).not.toContain('Bloco Antigo')
    expect(wrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([
      makeBuilding({ id: 1, name: 'Bloco Atualizado' }),
    ])
    wrapper.unmount()
  })

  it('K13.1-01 — invalidateCatalog() marca catálogo carregado como obsoleto e permite novo GET em ensureLoaded()', async () => {
    const initial = [makeBuilding({ id: 1, name: 'Prédio Antigo' })]
    const updated = [makeBuilding({ id: 1, name: 'Prédio Novo' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated)

    const store = useBuildingsStore()
    await store.ensureLoaded()
    expect(store.loaded).toBe(true)
    expect(store.items).toEqual(initial)

    ;(store as unknown as { invalidateCatalog: () => void }).invalidateCatalog()
    expect(store.loaded).toBe(false)

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual(updated)
    expect(store.loaded).toBe(true)
  })

  it('K13.1-02 — GET antigo iniciado antes da invalidação é descartado quando GET posterior retorna dados atuais', async () => {
    let resolveA!: (val: Building[]) => void
    let resolveB!: (val: Building[]) => void
    vi.spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveA = r }))
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveB = r }))

    const store = useBuildingsStore()
    const pA = store.ensureLoaded()
    ;(store as unknown as { invalidateCatalog: () => void }).invalidateCatalog()

    const pB = store.ensureLoaded()
    expect(store.loading).toBe(true)

    const bData = [makeBuilding({ id: 2, name: 'Prédio Atual B' })]
    resolveB(bData)
    await pB
    expect(store.items).toEqual(bData)
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)

    resolveA([makeBuilding({ id: 1, name: 'Prédio Antigo A' })])
    await pA

    expect(store.items).toEqual(bData)
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('K13.1-03 — invalidação durante GET pendente não se perde silenciosamente após retorno desse GET', async () => {
    let resolveA!: (val: Building[]) => void
    const freshData = [makeBuilding({ id: 2, name: 'Prédio Recente' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveA = r }))
      .mockResolvedValueOnce(freshData)

    const store = useBuildingsStore()
    const pA = store.ensureLoaded()
    expect(store.loading).toBe(true)

    ;(store as unknown as { invalidateCatalog: () => void }).invalidateCatalog()

    resolveA([makeBuilding({ id: 1, name: 'Prédio Pré-Mutação' })])
    await pA

    expect(store.loaded).toBe(false)
    expect(store.items).not.toEqual([makeBuilding({ id: 1, name: 'Prédio Pré-Mutação' })])

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual(freshData)
    expect(store.loaded).toBe(true)
  })

  it('K13.1-04 & K13.1-05 — falha HTTP 503 após invalidação não cria dados falsos, sinaliza erro sem loop e recupera em nova tentativa', async () => {
    const recovered = [makeBuilding({ id: 4, name: 'Bloco Recuperado' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockResolvedValueOnce([makeBuilding({ id: 1, name: 'Bloco Inicial' })])
      .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
      .mockResolvedValueOnce(recovered)

    const store = useBuildingsStore()
    await store.ensureLoaded()
    ;(store as unknown as { invalidateCatalog: () => void }).invalidateCatalog()

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.error).toBe(true)
    expect(store.loading).toBe(false)

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(3)
    expect(store.error).toBe(false)
    expect(store.loaded).toBe(true)
    expect(store.items).toEqual(recovered)
  })

  it('K13.1-06 — GET antigo que termina antes do GET novo não limpa loading pertencente ao novo', async () => {
    let resolveA!: (val: Building[]) => void
    let resolveB!: (val: Building[]) => void
    vi.spyOn(buildingService, 'list')
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveA = r }))
      .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveB = r }))

    const store = useBuildingsStore()
    const pA = store.ensureLoaded()
    const pB = store.ensureLoaded(true)
    expect(store.loading).toBe(true)

    resolveA([makeBuilding({ id: 1, name: 'Antigo A' })])
    await pA
    expect(store.loading).toBe(true)

    resolveB([makeBuilding({ id: 2, name: 'Atual B' })])
    await pB
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([makeBuilding({ id: 2, name: 'Atual B' })])
  })

  it('K13.2-01 — invalidateCatalog({ revalidateIfObserved: true }) revalida consumidor montado em uma única chamada e evita GET sem consumidor ativo', async () => {
    const initial = [makeBuilding({ id: 1, name: 'Bloco Antes' })]
    const updated = [makeBuilding({ id: 1, name: 'Bloco Depois' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated)

    const store = useBuildingsStore()
    const Host = defineComponent({
      components: { BuildingSelect, BuildingsView },
      template: '<div><BuildingSelect /><BuildingsView /></div>',
    })
    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Bloco Antes')

    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Bloco Depois')
    expect(wrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual(updated)

    wrapper.unmount()
    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)
  })
})
