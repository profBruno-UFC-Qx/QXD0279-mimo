import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useCategoriesStore } from '../categoriesStore'
import { categoryService } from '@/services/category.service'
import CategorySelect from '@/components/form/CategorySelect.vue'
import { vuetify } from '@/theme'
import type { Category } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: 'Eletrônicos',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('useCategoriesStore (Etapa 14 — catálogo público sincronizado e concorrente)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('K14-01 & K14-02 — GET inicial carrega catálogo público uma vez e cache válido evita GET redundante', async () => {
    const initial = [makeCategory({ id: 1, name: 'Documentos' })]
    const listSpy = vi.spyOn(categoryService, 'list').mockResolvedValueOnce(initial)

    const store = useCategoriesStore()
    await store.ensureLoaded()
    await store.ensureLoaded()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(store.items).toEqual(initial)
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
    expect((store as unknown as { error: boolean }).error).toBe(false)
  })

  it('K14-03 — ensureLoaded(true) força atualização do catálogo', async () => {
    const initial = [makeCategory({ id: 1, name: 'Antiga' })]
    const updated = [makeCategory({ id: 1, name: 'Atualizada' })]
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated)

    const store = useCategoriesStore()
    await store.ensureLoaded()
    await store.ensureLoaded(true)

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual(updated)
  })

  it('K14-04 — GET retorna lista vazia [] marca loaded=true e error=false', async () => {
    vi.spyOn(categoryService, 'list').mockResolvedValueOnce([])

    const store = useCategoriesStore()
    await store.ensureLoaded()

    expect(store.items).toEqual([])
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
    expect((store as unknown as { error: boolean }).error).toBe(false)
  })

  it('K14-05 & K14-06 — falha de GET expõe error=true e retry recupera catálogo sem loop automático', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce([makeCategory({ id: 2, name: 'Chaves' })])

    const store = useCategoriesStore()
    await store.ensureLoaded()

    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)
    expect((store as unknown as { error: boolean }).error).toBe(true)
    expect(store.items).toEqual([])
    expect(listSpy).toHaveBeenCalledTimes(1)

    await store.ensureLoaded(true)
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.loaded).toBe(true)
    expect((store as unknown as { error: boolean }).error).toBe(false)
    expect(store.items).toEqual([makeCategory({ id: 2, name: 'Chaves' })])
  })

  it('K14-07 & K14-08 — DTO inválido e lista com IDs duplicados são rejeitados sem marcar loaded=true', async () => {
    vi.spyOn(categoryService, 'list')
      .mockResolvedValueOnce([{ id: -1, name: 'X' }] as unknown as Category[])
      .mockResolvedValueOnce([
        makeCategory({ id: 4, name: 'Cat A' }),
        makeCategory({ id: 4, name: 'Cat B' }),
      ])

    const store = useCategoriesStore()
    await store.ensureLoaded()

    expect(store.loaded).toBe(false)
    expect((store as unknown as { error: boolean }).error).toBe(true)
    expect(store.items).toEqual([])

    await store.ensureLoaded(true)

    expect(store.loaded).toBe(false)
    expect((store as unknown as { error: boolean }).error).toBe(true)
    expect(store.items).toEqual([])
  })

  it('K14-09 & K14-21 — dois GETs fora de ordem mantêm resultado e loading pertencentes apenas ao mais recente', async () => {
    let resolveFirst!: (val: Category[]) => void
    let resolveSecond!: (val: Category[]) => void
    vi.spyOn(categoryService, 'list')
      .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveSecond = r }))

    const store = useCategoriesStore()
    const p1 = store.ensureLoaded()
    const p2 = store.ensureLoaded(true)
    expect(store.loading).toBe(true)

    resolveFirst([makeCategory({ id: 1, name: 'Primeira Obsoleta' })])
    await p1
    expect(store.loading).toBe(true)
    expect(store.items).toEqual([])

    resolveSecond([makeCategory({ id: 2, name: 'Segunda Oficial' })])
    await p2
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([makeCategory({ id: 2, name: 'Segunda Oficial' })])
  })

  it('K14-10, K14-12, K14-13 & K14-14 — syncCatalog sincroniza após POST/PATCH/DELETE e GET antigo posterior não sobrescreve', async () => {
    let resolveStaleGet!: (val: Category[]) => void
    vi.spyOn(categoryService, 'list').mockImplementationOnce(
      () => new Promise<Category[]>((r) => { resolveStaleGet = r }),
    )

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      syncCatalog: (items: Category[]) => void
    }
    const stalePromise = store.ensureLoaded()

    // POST sincronizado
    store.syncCatalog([makeCategory({ id: 1, name: 'Documentos' })])
    expect(store.items).toEqual([makeCategory({ id: 1, name: 'Documentos' })])
    expect(store.loaded).toBe(true)

    // GET antigo retorna dados velhos -> não sobrescreve
    resolveStaleGet([makeCategory({ id: 99, name: 'Velha' })])
    await stalePromise
    expect(store.items).toEqual([makeCategory({ id: 1, name: 'Documentos' })])

    // PATCH sincronizado
    store.syncCatalog([makeCategory({ id: 1, name: 'Documentos Oficiais' })])
    expect(store.items[0].name).toBe('Documentos Oficiais')

    // DELETE sincronizado
    store.syncCatalog([])
    expect(store.items).toEqual([])
    expect(store.loaded).toBe(true)
  })

  it('K14-11 — GET antigo iniciado antes da invalidação não restaura dados obsoletos', async () => {
    let resolveOldGet!: (val: Category[]) => void
    vi.spyOn(categoryService, 'list')
      .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveOldGet = r }))
      .mockResolvedValueOnce([makeCategory({ id: 5, name: 'Atualizada' })])

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      invalidateCatalog: (opts?: { revalidateIfObserved?: boolean }) => void
    }

    const oldPromise = store.ensureLoaded()
    store.invalidateCatalog()

    resolveOldGet([makeCategory({ id: 1, name: 'Obsoleta' })])
    await oldPromise

    expect(store.loaded).toBe(false)
    expect(store.items).toEqual([])

    await store.ensureLoaded()
    expect(store.items).toEqual([makeCategory({ id: 5, name: 'Atualizada' })])
  })

  it('K14-15 & K14-16 — consumidores ativos disparam revalidação única e liberação repetida é idempotente', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Inicial' })])
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Revalidada' })])

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      acquireConsumer: () => () => void
      invalidateCatalog: (opts?: { revalidateIfObserved?: boolean }) => void
    }

    const release1 = store.acquireConsumer()
    const release2 = store.acquireConsumer()

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(1)

    // Liberação repetida de release1 não pode zerar consumerCount enquanto release2 estiver ativo
    release1()
    release1()

    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual([makeCategory({ id: 1, name: 'Revalidada' })])

    release2()
    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()
    // Sem consumidores ativos, não dispara GET automático
    expect(listSpy).toHaveBeenCalledTimes(2)
  })

  it('K14-17 & K14-22 — GET durante escrita pendente não consolida cache obsoleto e escritas sobrepostas preservam contadores', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Inicial' })])
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Durante escrita' })])
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Após escrita' })])

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      beginWrite: () => void
      endWrite: () => void
    }

    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(1)

    store.beginWrite()
    store.beginWrite()

    // Com escrita pendente, ensureLoaded() não deve confiar cegamente no cache anterior
    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(2)

    store.endWrite()
    // Ainda há 1 escrita pendente -> continua refazendo GET
    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(3)

    store.endWrite()
    // extra endWrite não gera contagem negativa
    store.endWrite()
    await store.ensureLoaded()
    expect(listSpy).toHaveBeenCalledTimes(3)
  })

  it('K14-18 — escrita que termina após logout invalida cache e permite CategorySelect obter dados atuais', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Antes do Logout' })])
      .mockResolvedValueOnce([makeCategory({ id: 2, name: 'Criada Antes do Logout' })])

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      invalidateCatalog: (opts?: { revalidateIfObserved?: boolean }) => void
    }

    await store.ensureLoaded()
    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()

    // Sem consumidor ativo durante logout, invalidateCatalog deixa loaded=false e sem exigir auth no GET
    const wrapper = mount(
      defineComponent({
        components: { CategorySelect },
        template: '<CategorySelect />',
      }),
      { global: { plugins: [vuetify] } },
    )
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([
      makeCategory({ id: 2, name: 'Criada Antes do Logout' }),
    ])
    wrapper.unmount()
  })

  it('K14-19 & K14-20 — falha incerta com consumidor ativo revalida e erro de revalidação é recuperável por retry', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Inicial' })])
      .mockRejectedValueOnce(new Error('Falha 503'))
      .mockResolvedValueOnce([makeCategory({ id: 1, name: 'Recuperada' })])

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      acquireConsumer: () => () => void
      invalidateCatalog: (opts?: { revalidateIfObserved?: boolean }) => void
      error: boolean
    }

    const release = store.acquireConsumer()
    await store.ensureLoaded()

    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(store.error).toBe(true)
    expect(store.loaded).toBe(false)

    await store.ensureLoaded(true)
    expect(listSpy).toHaveBeenCalledTimes(3)
    expect(store.error).toBe(false)
    expect(store.items).toEqual([makeCategory({ id: 1, name: 'Recuperada' })])
    release()
  })

  it('K14-23 — syncCatalog rejeita DTO malformado ou IDs duplicados sem corromper catálogo', async () => {
    const initial = [makeCategory({ id: 1, name: 'Válida' })]
    vi.spyOn(categoryService, 'list').mockResolvedValueOnce(initial)

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      syncCatalog: (items: Category[]) => void
    }
    await store.ensureLoaded()

    store.syncCatalog([{ id: 0, name: 'Inválida', createdAt: '2026-01-01T00:00:00.000Z' }])
    store.syncCatalog([
      makeCategory({ id: 2, name: 'A' }),
      makeCategory({ id: 2, name: 'B' }),
    ])

    expect(store.items).toEqual(initial)
    expect(store.loaded).toBe(true)
  })
})
