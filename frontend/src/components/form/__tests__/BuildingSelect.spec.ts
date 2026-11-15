import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref, nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import BuildingSelect from '../BuildingSelect.vue'
import BuildingsView from '@/views/public/BuildingsView.vue'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useUiStore } from '@/stores/uiStore'
import { buildingService } from '@/services/building.service'
import { api } from '@/services/api'
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

describe('BuildingSelect (Etapa 13.3 — Recuperação independente após falha do catálogo público)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('BS13.3-01 — GET inicial com sucesso apresenta opções, encerra loading e não exibe erro ou retry', async () => {
    const catalog = [makeBuilding({ id: 1, name: 'Biblioteca Central' }), makeBuilding({ id: 2, name: 'Bloco I' })]
    const listSpy = vi.spyOn(buildingService, 'list').mockResolvedValueOnce(catalog)

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(vSelect.props('items')).toEqual(catalog)
    expect(vSelect.props('loading')).toBe(false)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    wrapper.unmount()
  })

  it('BS13.3-02 — GET inicial falha (HTTP 503) exibe feedback visível e retry acessível sem falso estado vazio ou escrita', async () => {
    vi.spyOn(buildingService, 'list').mockRejectedValueOnce(makeHttpError(503))
    const postSpy = vi.spyOn(api, 'post')
    const patchSpy = vi.spyOn(api, 'patch')
    const deleteSpy = vi.spyOn(api, 'delete')

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(vSelect.props('items')).toEqual([])
    expect(vSelect.props('loading')).toBe(false)
    expect(wrapper.text()).toContain('Não foi possível carregar os prédios.')
    expect(wrapper.text()).not.toContain('Nenhum prédio cadastrado')
    expect(wrapper.text()).not.toContain('Nenhum prédio disponível')

    const retryBtn = findButton(wrapper, 'Tentar novamente')
    expect(retryBtn).toBeDefined()
    expect(retryBtn?.attributes('disabled')).toBeUndefined()
    expect(postSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('BS13.3-03 — Retry recupera opções via GET, limpa erro, encerra loading e não executa escrita', async () => {
    const recovered = [makeBuilding({ id: 10, name: 'Anexo Administrativo' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce(recovered)
    const postSpy = vi.spyOn(api, 'post')
    const patchSpy = vi.spyOn(api, 'patch')
    const deleteSpy = vi.spyOn(api, 'delete')

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const retryBtn = findButton(wrapper, 'Tentar novamente')
    expect(retryBtn).toBeDefined()
    await retryBtn!.trigger('click')
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(vSelect.props('items')).toEqual(recovered)
    expect(vSelect.props('loading')).toBe(false)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(postSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('BS13.3-04 — Retry que falha novamente permanece recuperável sem loop automático e recupera no terceiro GET', async () => {
    const recovered = [makeBuilding({ id: 3, name: 'Laboratório Sul' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockRejectedValueOnce(makeHttpError(500))
      .mockResolvedValueOnce(recovered)

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Não foi possível carregar os prédios.')
    const secondRetryBtn = findButton(wrapper, 'Tentar novamente')
    expect(secondRetryBtn).toBeDefined()

    await secondRetryBtn!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(3)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual(recovered)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    wrapper.unmount()
  })

  it('BS13.3-05 — Duplo clique rápido no retry dispara apenas 1 requisição GET de recuperação', async () => {
    let resolveRetry!: (value: Building[]) => void
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockImplementationOnce(
        () =>
          new Promise<Building[]>((resolve) => {
            resolveRetry = resolve
          }),
      )

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const retryBtn = findButton(wrapper, 'Tentar novamente')!
    await retryBtn.trigger('click')
    await retryBtn.trigger('click')
    await nextTick()

    expect(listSpy).toHaveBeenCalledTimes(2)

    resolveRetry([makeBuilding({ id: 7, name: 'Auditorio' })])
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toHaveLength(1)
    wrapper.unmount()
  })

  it('BS13.3-06 — Loading da recuperação oculta erro obsoleto, bloqueia novo retry e libera ao concluir', async () => {
    let resolveRetry!: (value: Building[]) => void
    vi.spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockImplementationOnce(
        () =>
          new Promise<Building[]>((resolve) => {
            resolveRetry = resolve
          }),
      )

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const store = useBuildingsStore()
    expect(store.error).toBe(true)

    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await nextTick()

    expect(store.loading).toBe(true)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('loading')).toBe(true)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()

    const recovered = [makeBuilding({ id: 4, name: 'Bloco Novo' })]
    resolveRetry(recovered)
    await flushPromises()

    expect(store.loading).toBe(false)
    expect(store.error).toBe(false)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('loading')).toBe(false)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual(recovered)
    wrapper.unmount()
  })

  it('BS13.3-07 — GETs fora de ordem mantêm apenas o resultado da consulta mais recente', async () => {
    let resolveOld!: (value: Building[]) => void
    let resolveNew!: (value: Building[]) => void
    vi.spyOn(buildingService, 'list')
      .mockImplementationOnce(
        () =>
          new Promise<Building[]>((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Building[]>((resolve) => {
            resolveNew = resolve
          }),
      )

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await nextTick()

    const store = useBuildingsStore()
    const newerCatalog = [makeBuilding({ id: 20, name: 'Catálogo Recente' })]
    const olderCatalog = [makeBuilding({ id: 10, name: 'Catálogo Obsoleto' })]

    const secondLoad = store.ensureLoaded(true)
    resolveNew(newerCatalog)
    await secondLoad
    await flushPromises()

    resolveOld(olderCatalog)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual(newerCatalog)
    wrapper.unmount()
  })

  it('BS13.3-08 — Lista válida vazia [] marca loaded=true, error=false e não exibe erro nem retry', async () => {
    vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const store = useBuildingsStore()
    expect(store.loaded).toBe(true)
    expect(store.error).toBe(false)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([])
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    wrapper.unmount()
  })

  it('BS13.3-09 — DTO corrompido é rejeitado pela store e permite recuperação via retry com GET válido', async () => {
    const validCatalog = [makeBuilding({ id: 8, name: 'Prédio Válido' })]
    vi.spyOn(buildingService, 'list')
      .mockResolvedValueOnce([{ id: 'invalido', name: null }] as unknown as Building[])
      .mockResolvedValueOnce(validCatalog)

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const store = useBuildingsStore()
    expect(store.loaded).toBe(false)
    expect(store.error).toBe(true)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([])
    expect(wrapper.text()).toContain('Não foi possível carregar os prédios.')

    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(store.loaded).toBe(true)
    expect(store.error).toBe(false)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual(validCatalog)
    wrapper.unmount()
  })

  it('BS13.3-10 — Modelo selecionado é preservado quando falha uma revalidação posterior', async () => {
    const initial = [makeBuilding({ id: 2, name: 'Bloco II' })]
    vi.spyOn(buildingService, 'list')
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(makeHttpError(503))

    const Host = defineComponent({
      components: { BuildingSelect },
      setup() {
        const selected = ref<number | null>(2)
        return { selected }
      },
      template: '<BuildingSelect v-model="selected" />',
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    expect(wrapper.vm.selected).toBe(2)

    const store = useBuildingsStore()
    await store.ensureLoaded(true)
    await flushPromises()

    expect(store.error).toBe(true)
    expect(wrapper.vm.selected).toBe(2)
    expect(wrapper.findComponent({ name: 'VSelect' }).props('modelValue')).toBe(2)
    wrapper.unmount()
  })

  it('BS13.3-11 — Campo opcional (modelValue=null, required=false) permanece válido mesmo após falha no catálogo', async () => {
    vi.spyOn(buildingService, 'list').mockRejectedValueOnce(makeHttpError(503))

    const Host = defineComponent({
      components: { BuildingSelect },
      setup() {
        const selected = ref<number | null>(null)
        return { selected }
      },
      template: '<BuildingSelect v-model="selected" :required="false" />',
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    const errors = await (vSelect.vm as unknown as { validate: () => Promise<string[]> }).validate()
    expect(errors).toEqual([])
    expect(wrapper.vm.selected).toBeNull()
    wrapper.unmount()
  })

  it('BS13.3-12 — Campo obrigatório (required=true) preserva regra de validação antes e depois de retry', async () => {
    vi.spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce([makeBuilding({ id: 5, name: 'Bloco V' })])

    const Host = defineComponent({
      components: { BuildingSelect },
      setup() {
        const selected = ref<number | null>(null)
        return { selected }
      },
      template: '<BuildingSelect v-model="selected" :required="true" />',
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    const initialErrors = await (vSelect.vm as unknown as { validate: () => Promise<string[]> }).validate()
    expect(initialErrors).toContain('Campo obrigatório.')

    await findButton(wrapper, 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(wrapper.vm.selected).toBeNull()
    const errorsAfterRetry = await (vSelect.vm as unknown as { validate: () => Promise<string[]> }).validate()
    expect(errorsAfterRetry).toContain('Campo obrigatório.')
    wrapper.unmount()
  })

  it('BS13.3-13 — Encaminha atributos Vuetify e eventos update:modelValue mesmo com feedback local de erro', async () => {
    vi.spyOn(buildingService, 'list').mockRejectedValueOnce(makeHttpError(503))

    const Host = defineComponent({
      components: { BuildingSelect },
      setup() {
        const selected = ref<number | null>(null)
        return { selected }
      },
      template: `
        <BuildingSelect
          v-model="selected"
          label="Prédio provável"
          placeholder="Todos os prédios"
          hint="Opcional — deixar vazio"
          :persistent-hint="true"
          :disabled="true"
          :clearable="false"
          error-messages="Erro externo"
        />
      `,
    })

    const wrapper = mount(Host, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    const vSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(vSelect.props('label')).toBe('Prédio provável')
    expect(vSelect.props('placeholder')).toBe('Todos os prédios')
    expect(vSelect.props('hint')).toBe('Opcional — deixar vazio')
    expect(vSelect.props('persistentHint')).toBe(true)
    expect(vSelect.props('disabled')).toBe(true)
    expect(vSelect.props('clearable')).toBe(false)
    expect(vSelect.props('errorMessages')).toBe('Erro externo')

    vSelect.vm.$emit('update:modelValue', 99)
    await nextTick()
    expect(wrapper.vm.selected).toBe(99)
    wrapper.unmount()
  })

  it('BS13.3-14 — Dois seletores simultâneos compartilham store, evitam GET duplicado e recuperam juntos', async () => {
    const recovered = [makeBuilding({ id: 12, name: 'Anexo Compartilhado' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce(recovered)

    const DualHost = defineComponent({
      components: { BuildingSelect },
      template: '<div><BuildingSelect /><BuildingSelect /></div>',
    })

    const wrapper = mount(DualHost, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    const selectors = wrapper.findAllComponents(BuildingSelect)
    expect(selectors).toHaveLength(2)
    expect(selectors[0].text()).toContain('Não foi possível carregar os prédios.')
    expect(selectors[1].text()).toContain('Não foi possível carregar os prédios.')

    await findButton(selectors[0], 'Tentar novamente')!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(selectors[0].findComponent({ name: 'VSelect' }).props('items')).toEqual(recovered)
    expect(selectors[1].findComponent({ name: 'VSelect' }).props('items')).toEqual(recovered)
    expect(selectors[0].text()).not.toContain('Não foi possível carregar os prédios.')
    expect(selectors[1].text()).not.toContain('Não foi possível carregar os prédios.')
    wrapper.unmount()
  })

  it('BS13.3-15 — Desmontagem durante requisição pendente libera consumidor e não emite snackbar tardio', async () => {
    let resolvePending!: (value: Building[]) => void
    const listSpy = vi.spyOn(buildingService, 'list').mockImplementationOnce(
      () =>
        new Promise<Building[]>((resolve) => {
          resolvePending = resolve
        }),
    )

    const ui = useUiStore()
    const snackSpy = vi.spyOn(ui, 'showSnackbar')
    const store = useBuildingsStore()

    const wrapper = mount(BuildingSelect, {
      global: { plugins: [vuetify] },
    })
    await nextTick()

    wrapper.unmount()
    resolvePending([makeBuilding({ id: 1, name: 'Resolvido após unmount' })])
    await flushPromises()

    store.invalidateCatalog({ revalidateIfObserved: true })
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(snackSpy).not.toHaveBeenCalled()
  })

  it('BS13.3-18 — BuildingsView mantém ErrorAlert e retry independentes e exibe cards após recuperação', async () => {
    const recovered = [makeBuilding({ id: 4, name: 'Prédio Central' })]
    const listSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeHttpError(503))
      .mockResolvedValueOnce(recovered)

    const wrapper = mount(BuildingsView, {
      global: { plugins: [vuetify] },
    })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    const retryBtn = findButton(wrapper, 'Tentar novamente')
    expect(retryBtn).toBeDefined()

    await retryBtn!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Prédio Central')
    wrapper.unmount()
  })
})
