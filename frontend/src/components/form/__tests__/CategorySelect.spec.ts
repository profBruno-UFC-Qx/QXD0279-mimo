import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import CategorySelect from '../CategorySelect.vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import { categoryService } from '@/services/category.service'
import { api } from '@/services/api'
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

function makeHttpError(status = 503, message = 'Service Unavailable') {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: message,
    headers: new AxiosHeaders(),
    config,
    data: {
      success: false,
      data: null,
      error: { code: status, details: message },
    },
  })
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((btn) => btn.text().includes(text))
}

describe('CategorySelect (Etapa 14 — sincronização e recuperação independente)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('CS14-01 — carregamento isolado apresenta categorias, encerra loading e não exibe erro ou retry', async () => {
    const catalog = [makeCategory({ id: 1, name: 'Documentos' }), makeCategory({ id: 2, name: 'Eletrônicos' })]
    const listSpy = vi.spyOn(categoryService, 'list').mockResolvedValueOnce(catalog)

    const wrapper = mount(CategorySelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(vSelect.props('items')).toEqual(catalog)
    expect(vSelect.props('loading')).toBe(false)
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    wrapper.unmount()
  })

  it('CS14-02 & CS14-03 — falha de GET exibe erro, não executa escrita e retry recupera opções via GET', async () => {
    const recovered = [makeCategory({ id: 5, name: 'Vestuário' })]
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce(recovered)
    const postSpy = vi.spyOn(api, 'post')
    const patchSpy = vi.spyOn(api, 'patch')
    const deleteSpy = vi.spyOn(api, 'delete')

    const wrapper = mount(CategorySelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar as categorias.')
    const retryBtn = findButton(wrapper, 'Tentar novamente')
    expect(retryBtn).toBeDefined()

    await retryBtn!.trigger('click')
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(vSelect.props('items')).toEqual(recovered)
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(postSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('CS14-04 & CS14-05 — retry que falha permanece recuperável sem loop e duplo clique envia apenas 1 GET', async () => {
    let resolveSecond!: (value: Category[]) => void
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveSecond = r }))

    const wrapper = mount(CategorySelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const retryBtn = findButton(wrapper, 'Tentar novamente')!
    await retryBtn.trigger('click')
    await retryBtn.trigger('click')
    await nextTick()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')

    resolveSecond([makeCategory({ id: 9, name: 'Recuperada após clique único' })])
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([
      makeCategory({ id: 9, name: 'Recuperada após clique único' }),
    ])
    wrapper.unmount()
  })

  it('CS14-06 & CS14-07 — lista vazia [] não mostra erro e DTO inválido aciona feedback recuperável', async () => {
    vi.spyOn(categoryService, 'list')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: -5, name: 'Corrompida' }] as unknown as Category[])
      .mockResolvedValueOnce([makeCategory({ id: 3, name: 'Chaves' })])

    const wrapper = mount(CategorySelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()

    const store = useCategoriesStore()
    await store.ensureLoaded(true)
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar as categorias.')
    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([
      makeCategory({ id: 3, name: 'Chaves' }),
    ])
    wrapper.unmount()
  })

  it('CS14-08, CS14-09 & CS14-10 — preserva v-model na falha temporária, respeita required=true e campo opcional permanece válido', async () => {
    vi.spyOn(categoryService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce([makeCategory({ id: 7, name: 'Mochilas' })])

    const Host = defineComponent({
      components: { CategorySelect },
      setup() {
        const requiredModel = ref<number | null>(7)
        const optionalModel = ref<number | null>(null)
        return { requiredModel, optionalModel }
      },
      template: `
        <div>
          <CategorySelect v-model="requiredModel" :required="true" />
          <CategorySelect v-model="optionalModel" :required="false" />
        </div>
      `,
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    // Falha temporária de GET não pode redefinir silenciosamente o v-model
    expect(wrapper.vm.requiredModel).toBe(7)
    expect(wrapper.vm.optionalModel).toBeNull()

    const selects = wrapper.findAllComponents({ name: 'VSelect' })
    const requiredRules = selects[0].props('rules') as Array<(val: unknown) => true | string>
    const optionalRules = selects[1].props('rules') as Array<(val: unknown) => true | string>

    expect(requiredRules.map((fn) => fn(null))).toContain('Campo obrigatório.')
    expect(requiredRules.every((fn) => fn(7) === true)).toBe(true)
    expect(optionalRules.every((fn) => fn(null) === true)).toBe(true)

    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await flushPromises()
    expect(wrapper.vm.requiredModel).toBe(7)
    wrapper.unmount()
  })

  it('CS14-11 — encaminha atributos Vuetify e update:modelValue mesmo com feedback local de erro', async () => {
    vi.spyOn(categoryService, 'list').mockRejectedValueOnce(makeHttpError(503))

    const Host = defineComponent({
      components: { CategorySelect },
      setup() {
        const selected = ref<number | null>(null)
        return { selected }
      },
      template: `
        <CategorySelect
          v-model="selected"
          label="Categoria do item"
          placeholder="Todas as categorias"
          hint="Opcional"
          :persistent-hint="true"
          :disabled="true"
          :clearable="false"
          error-messages="Erro externo"
          hide-details
        />
      `,
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(vSelect.props('label')).toBe('Categoria do item')
    expect(vSelect.props('placeholder')).toBe('Todas as categorias')
    expect(vSelect.props('hint')).toBe('Opcional')
    expect(vSelect.props('persistentHint')).toBe(true)
    expect(vSelect.props('disabled')).toBe(true)
    expect(vSelect.props('clearable')).toBe(false)
    expect(vSelect.props('errorMessages')).toBe('Erro externo')
    expect(vSelect.props('hideDetails')).toBe(true)

    vSelect.vm.$emit('update:modelValue', 42)
    await nextTick()
    expect(wrapper.vm.selected).toBe(42)
    wrapper.unmount()
  })

  it('CS14-12 & CS14-13 — dois seletores compartilham store, evitam GET duplicado e desmontagem libera consumidor', async () => {
    const listSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce([makeCategory({ id: 2, name: 'Acessórios' })])

    const Host = defineComponent({
      components: { CategorySelect },
      template: '<div><CategorySelect /><CategorySelect /></div>',
    })

    const ui = useUiStore()
    const snackSpy = vi.spyOn(ui, 'showSnackbar')
    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      invalidateCatalog: (opts?: { revalidateIfObserved?: boolean }) => void
    }

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    const selectors = wrapper.findAllComponents(CategorySelect)
    await findButton(selectors[0], 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(selectors[1].findComponent({ name: 'VSelect' }).props('items')).toEqual([
      makeCategory({ id: 2, name: 'Acessórios' }),
    ])

    wrapper.unmount()
    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(snackSpy).not.toHaveBeenCalled()
  })

  it('CS14-14, CS14-15 & CS14-16 — reflete renomeação, remove opção excluída sem substituir v-model e ignora GET antigo pós-mutação', async () => {
    let resolveStaleGet!: (value: Category[]) => void
    vi.spyOn(categoryService, 'list').mockImplementationOnce(
      () => new Promise<Category[]>((r) => { resolveStaleGet = r }),
    )

    const Host = defineComponent({
      components: { CategorySelect },
      setup() {
        const selected = ref<number | null>(2)
        return { selected }
      },
      template: '<CategorySelect v-model="selected" />',
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await nextTick()

    const store = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      syncCatalog: (items: Category[]) => void
    }

    // Mutação administrativa renomeia categoria 2 enquanto GET antigo ainda estava pendente
    store.syncCatalog([
      makeCategory({ id: 1, name: 'Documentos' }),
      makeCategory({ id: 2, name: 'Eletrônicos Portáteis' }),
    ])
    await nextTick()

    // GET antigo termina depois -> não restaura nome antigo
    resolveStaleGet([
      makeCategory({ id: 1, name: 'Documentos' }),
      makeCategory({ id: 2, name: 'Eletrônicos Antigo' }),
    ])
    await flushPromises()

    let items = wrapper.findComponent({ name: 'VSelect' }).props('items') as Category[]
    expect(items.find((c) => c.id === 2)?.name).toBe('Eletrônicos Portáteis')
    expect(wrapper.vm.selected).toBe(2)

    // Exclusão administrativa remove categoria 2 -> não oferece mais #2 nem troca v-model para #1
    store.syncCatalog([makeCategory({ id: 1, name: 'Documentos' })])
    await nextTick()

    items = wrapper.findComponent({ name: 'VSelect' }).props('items') as Category[]
    expect(items).toEqual([makeCategory({ id: 1, name: 'Documentos' })])
    expect(wrapper.vm.selected).toBe(2)
    wrapper.unmount()
  })
})
