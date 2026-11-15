import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import NewLostReportView from '../NewLostReportView.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import { vuetify } from '@/theme'
import { lostReportService } from '@/services/lostReport.service'
import { categoryService } from '@/services/category.service'
import { buildingService } from '@/services/building.service'
import { itemService } from '@/services/item.service'
import { useAuthStore } from '@/stores/authStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import type { Building, Category, CreateLostReportResult, LostReport, User } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 7,
  name: 'Ana Beatriz',
  email: 'ana@ufc.br',
  phone: '(88) 99999-0000',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 42,
  userId: 7,
  categoryId: 3,
  buildingId: null,
  confirmedItemId: null,
  description: 'Mochila preta com cadernos e carregador.',
  lossDate: '2026-11-05',
  status: 'OPEN',
  createdAt: '2026-11-14T15:00:00.000Z',
  ...overrides,
})

const defaultCategories: Category[] = [
  { id: 3, name: 'Mochilas', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 5, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
]

const defaultBuildings: Building[] = [
  {
    id: 2,
    name: 'Bloco I',
    address: 'Rua 1',
    pickupPoint: 'Sala 101',
    serviceHours: '08h às 17h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 4,
    name: 'Biblioteca',
    address: 'Rua 2',
    pickupPoint: 'Balcão',
    serviceHours: '08h às 20h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

function setAuthenticatedSession(userOverrides: Partial<User> = {}, token = 'token-a') {
  const auth = useAuthStore()
  auth.sessionGeneration += 1
  auth.token = token
  auth.user = makeUser(userOverrides)
  localStorage.setItem('achadex.token', token)
  return auth
}

function makeBackendError(details: string, status = 500) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    config,
    null,
    {
      status,
      statusText: String(status),
      headers: new AxiosHeaders(),
      config,
      data: {
        success: false,
        data: null,
        error: { code: status, details },
      },
    },
  )
}

function mockCatalogs(categories = defaultCategories, buildings = defaultBuildings) {
  vi.spyOn(categoryService, 'list').mockResolvedValue(categories)
  vi.spyOn(buildingService, 'list').mockResolvedValue(buildings)
}

function createFormRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/minhas-perdas',
        name: 'my-lost-reports',
        component: { template: '<div data-test="my-lost-reports" />' },
      },
      {
        path: '/minhas-perdas/nova',
        name: 'new-lost-report',
        component: NewLostReportView,
      },
      {
        path: '/minhas-perdas/:id',
        name: 'lost-report-detail',
        component: { template: '<div data-test="lost-report-detail" />' },
      },
    ],
  })
}

async function mountForm(path = '/minhas-perdas/nova') {
  const testRouter = createFormRouter()
  await testRouter.push(path)
  await testRouter.isReady()

  const wrapper = mount(NewLostReportView, {
    global: {
      plugins: [vuetify, testRouter],
    },
  })

  return { wrapper, testRouter }
}

function findButton(wrapper: { findAll: (sel: string) => any[] }, label: string) {
  return wrapper.findAll('a, button').find((btn) => btn.text().includes(label))
}

async function waitForRoute(testRouter: Router, name: string) {
  await vi.waitFor(() => {
    expect(testRouter.currentRoute.value.name).toBe(name)
  })
}

async function fillValidForm(
  wrapper: Awaited<ReturnType<typeof mountForm>>['wrapper'],
  options: {
    categoryId?: number | null
    buildingId?: number | null
    description?: string
    lossDate?: string | null
  } = {},
) {
  await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', options.categoryId === undefined ? 3 : options.categoryId)
  if (options.buildingId !== undefined) {
    await wrapper.findComponent(BuildingSelect).vm.$emit('update:modelValue', options.buildingId)
  }
  await wrapper.find('textarea').setValue(options.description ?? 'Mochila preta com cadernos e carregador.')
  await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', options.lossDate === undefined ? '2026-11-05' : options.lossDate)
  await nextTick()
}

describe('NewLostReportView (Etapa 07 — Registrar nova perda)', () => {
  const genericConfirmError =
    'Não foi possível confirmar o registro da perda. Verifique suas perdas antes de tentar novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('N01 — exibe formulário inicial com 4 campos vazios, botão Registrar perda, Cancelar e voltar sem "Em construção"', async () => {
    setAuthenticatedSession()
    mockCatalogs()

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Em construção')
    expect(wrapper.text()).toContain('Registrar objeto perdido')
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBeNull()
    expect(wrapper.findComponent(BuildingSelect).props('modelValue')).toBeNull()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.findComponent(DatePickerField).props('modelValue')).toBeNull()
    expect(findButton(wrapper, 'Registrar perda')).toBeDefined()
    expect(findButton(wrapper, 'Cancelar')).toBeDefined()
    expect(findButton(wrapper, 'Voltar para Minhas perdas')).toBeDefined()
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(useUiStore().snackbar.show).toBe(false)
  })

  it('N02 — categoria obrigatória: não envia POST sem categoria e exibe mensagem de validação visível', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create')

    const { wrapper } = await mountForm()
    await flushPromises()

    await wrapper.find('textarea').setValue('Mochila azul encontrada no campus central.')
    await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', '2026-11-05')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Selecione uma categoria válida.')
  })

  it('N03 — prédio provável é opcional: permite registrar com buildingId null', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ buildingId: null }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper, { buildingId: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledWith({
      categoryId: 3,
      buildingId: null,
      description: 'Mochila preta com cadernos e carregador.',
      lossDate: '2026-11-05',
    })
  })

  it('N04 & N05 — valida limites de descrição (9/10/2000/2001/espaços) com erro visível mesmo com botão desabilitado e envia trim()', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ description: '1234567890' }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 3)
    await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', '2026-11-05')

    await wrapper.find('textarea').setValue('123456789')
    await nextTick()
    expect(findButton(wrapper, 'Registrar perda')!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('A descrição deve conter pelo menos 10 caracteres.')

    await wrapper.find('textarea').setValue('a'.repeat(2001))
    await nextTick()
    expect(wrapper.text()).toContain('A descrição deve conter no máximo 2000 caracteres.')

    await wrapper.find('textarea').setValue('          ')
    await nextTick()
    expect(wrapper.text()).toContain('A descrição deve conter pelo menos 10 caracteres.')

    await wrapper.find('textarea').setValue('   ' + 'a'.repeat(2000) + '   ')
    await nextTick()
    expect(wrapper.text()).not.toContain('A descrição deve conter')
    expect(findButton(wrapper, 'Registrar perda')!.attributes('disabled')).toBeUndefined()

    await wrapper.find('textarea').setValue('  1234567890  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0].description).toBe('1234567890')
  })

  it('N06 — valida datas de calendário reais, aceita ano bissexto e rejeita 30/02 ou formato inválido sem bloqueio artificial de data', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ lossDate: '2024-02-29' }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper, { lossDate: '2026-02-30' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Informe uma data válida no formato YYYY-MM-DD.')

    await fillValidForm(wrapper, { lossDate: '2026/11/05' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).not.toHaveBeenCalled()

    await fillValidForm(wrapper, { lossDate: '2024-02-29' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0].lossDate).toBe('2024-02-29')
  })

  it('N07 — seleção via DatePickerField inclusive com Date no fim do dia envia 2026-11-05 sem deslocamento de fuso', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ lossDate: '2026-11-05' }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 3)
    await wrapper.find('textarea').setValue('Objeto selecionado com data noturna no picker.')

    vi.stubGlobal('visualViewport', {
      width: 1024,
      height: 768,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    try {
      const dateField = wrapper.findComponent(DatePickerField)
      await dateField.find('input').trigger('click')
      await flushPromises()
      await dateField
        .findComponent({ name: 'VDatePicker' })
        .vm.$emit('update:modelValue', new Date(2026, 10, 5, 23, 45, 0))
      await nextTick()
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(createSpy.mock.calls[0][0].lossDate).toBe('2026-11-05')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('N08 & N09 — bloqueia IDs inválidos ou inexistentes de categoria e prédio entre opções carregadas', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create')

    const { wrapper } = await mountForm()
    await flushPromises()

    for (const badCat of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 999]) {
      await fillValidForm(wrapper, { categoryId: badCat })
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(createSpy).not.toHaveBeenCalled()
    }

    await fillValidForm(wrapper, { categoryId: 3, buildingId: 888 })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Prédio selecionado é inválido.')
  })

  it('N10 — falha ao carregar categorias exibe erro recuperável, bloqueia criação e permite recarregar categorias', async () => {
    setAuthenticatedSession()
    const catSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('Falha categorias'))
      .mockResolvedValueOnce(defaultCategories)
    vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport(),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Recarregar categorias')
    await fillValidForm(wrapper, { categoryId: 3 })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).not.toHaveBeenCalled()

    await findButton(wrapper, 'Recarregar categorias')!.trigger('click')
    await flushPromises()

    expect(catSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Recarregar categorias')

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('N11 — falha ao carregar prédios exibe aviso recuperável com Recarregar prédios, mas permite registrar sem prédio', async () => {
    setAuthenticatedSession()
    vi.spyOn(categoryService, 'list').mockResolvedValue(defaultCategories)
    vi.spyOn(buildingService, 'list').mockRejectedValueOnce(new Error('Falha prédios'))
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ buildingId: null }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Recarregar prédios')
    await fillValidForm(wrapper, { categoryId: 3, buildingId: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0].buildingId).toBeNull()
  })

  it('N12 — payload enviado no POST nunca inclui campos administrativos', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ buildingId: 2 }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper, { categoryId: 3, buildingId: 2 })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const payload = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['buildingId', 'categoryId', 'description', 'lossDate'])
    for (const forbidden of ['id', 'userId', 'status', 'confirmedItemId', 'createdAt', 'updatedAt', 'title', 'lostDate', 'suggestions']) {
      expect(Object.prototype.hasOwnProperty.call(payload, forbidden)).toBe(false)
    }
  })

  it('N14, N15, N16 & N17 — aceita sugestões vazias ou preenchidas sem renderizá-las, exibe snackbar e navega ao ID exato do backend', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const ui = useUiStore()
    const snackSpy = vi.spyOn(ui, 'showSnackbar')
    const result: CreateLostReportResult = {
      lostReport: makeReport({ id: 917 }),
      suggestions: [
        {
          id: 55,
          title: 'Mochila parecida',
          description: 'Preta',
          categoryId: 3,
          buildingId: 2,
          foundLocation: 'Hall',
          foundDate: '2026-11-04',
          status: 'AVAILABLE',
        },
      ],
    }
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValueOnce(result)

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'SuggestionCard' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('É este!')
    expect(wrapper.text()).not.toContain('Não é meu')
    expect(snackSpy).toHaveBeenCalledTimes(1)
    expect(snackSpy).toHaveBeenCalledWith('Perda registrada com sucesso.', 'success')
    await waitForRoute(testRouter, 'lost-report-detail')
    expect(testRouter.currentRoute.value.params.id).toBe('917')
  })

  it('N18 & N19 — duplo clique rápido e POST pendente bloqueiam duplicação e mostram carregamento antes de navegar', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    let resolvePost!: (val: CreateLostReportResult) => void
    const createSpy = vi.spyOn(lostReportService, 'create').mockImplementationOnce(
      () =>
        new Promise<CreateLostReportResult>((resolve) => {
          resolvePost = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    const submitBtn = findButton(wrapper, 'Registrar perda')!
    void wrapper.find('form').trigger('submit')
    void submitBtn.trigger('click')
    void wrapper.find('form').trigger('submit')
    await nextTick()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(submitBtn.attributes('disabled')).toBeDefined()
    expect(submitBtn.find('.v-progress-circular').exists() || wrapper.find('.v-progress-circular').exists()).toBe(true)
    expect(ui.snackbar.show).toBe(false)
    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')

    resolvePost({ lostReport: makeReport({ id: 42 }), suggestions: [] })
    await flushPromises()

    await waitForRoute(testRouter, 'lost-report-detail')
  })

  it('N20 — HTTP 400 preserva formulário preenchido, exibe error.details público e permite corrigir e enviar', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi
      .spyOn(lostReportService, 'create')
      .mockRejectedValueOnce(makeBackendError('O campo description deve conter pelo menos 10 caracteres.', 400))
      .mockResolvedValueOnce({
        lostReport: makeReport({ id: 88, description: 'Descrição corrigida e aceita no servidor.' }),
        suggestions: [],
      })

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('O campo description deve conter pelo menos 10 caracteres.')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Mochila preta com cadernos e carregador.',
    )

    await wrapper.find('textarea').setValue('Descrição corrigida e aceita no servidor.')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(2)
    await waitForRoute(testRouter, 'lost-report-detail')
    expect(testRouter.currentRoute.value.params.id).toBe('88')
  })

  it('N21 — HTTP 500 oculta detalhes internos, não mostra sucesso e não executa retry automático', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi
      .spyOn(lostReportService, 'create')
      .mockRejectedValueOnce(makeBackendError('SQLITE_CONSTRAINT_INTERNAL_DETAIL', 500))
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain(genericConfirmError)
    expect(wrapper.text()).not.toContain('SQLITE_CONSTRAINT_INTERNAL_DETAIL')
    expect(ui.snackbar.show).toBe(false)
    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('N22 — falha de rede preserva rascunho, não faz retry automático e orienta consulta em Minhas perdas', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockRejectedValueOnce(new Error('Network Error'))
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain(genericConfirmError)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Mochila preta com cadernos e carregador.',
    )
    expect(ui.snackbar.show).toBe(false)

    const mineLink = wrapper.findComponent({ name: 'ErrorAlert' }).exists()
      ? findButton(wrapper, 'Consultar Minhas perdas') ?? findButton(wrapper, 'Voltar para Minhas perdas')
      : findButton(wrapper, 'Consultar Minhas perdas')
    expect(mineLink).toBeDefined()
    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('N23 — HTTP 401 não executa logout duplicado dentro da NewLostReportView', async () => {
    const auth = setAuthenticatedSession()
    mockCatalogs()
    const logoutSpy = vi.spyOn(auth, 'logout')
    vi.spyOn(lostReportService, 'create').mockRejectedValueOnce(makeBackendError('Sessão expirada.', 401))

    const { wrapper } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(logoutSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Sessão expirada.')
  })

  it('N24 — resposta HTTP 201 malformada não exibe sucesso falso, não reenvia POST e preserva ID se relato válido sem sugestões válidas', async () => {
    const badPayloads = [
      null,
      { suggestions: [] },
      { lostReport: makeReport({ id: 0 }), suggestions: [] },
      { lostReport: makeReport({ userId: 999 }), suggestions: [] },
      { lostReport: makeReport({ status: 'RESOLVED' }), suggestions: [] },
      { lostReport: makeReport({ id: 77 }), suggestions: null },
    ]

    for (const badPayload of badPayloads) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 7 })
      mockCatalogs()
      const createSpy = vi
        .spyOn(lostReportService, 'create')
        .mockResolvedValueOnce(badPayload as unknown as CreateLostReportResult)
      const ui = useUiStore()

      const { wrapper, testRouter } = await mountForm()
      await flushPromises()

      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
      if (badPayload && typeof badPayload === 'object' && 'lostReport' in badPayload && (badPayload as any).lostReport?.id === 77) {
        expect(findButton(wrapper, 'Abrir detalhes')).toBeDefined()
      } else {
        expect(wrapper.text()).toContain(genericConfirmError)
      }
      wrapper.unmount()
    }
  })

  it('N25 — falha no router.push() após 201 preserva createdReportId, não reenvia POST e exibe Abrir detalhes', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValueOnce({
      lostReport: makeReport({ id: 503 }),
      suggestions: [],
    })

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    const pushSpy = vi
      .spyOn(testRouter, 'push')
      .mockRejectedValueOnce(new Error('Navigation aborted'))

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    const openBtn = findButton(wrapper, 'Abrir detalhes')
    expect(openBtn).toBeDefined()
    expect(openBtn!.attributes('href')).toBe('/minhas-perdas/503')

    await openBtn!.trigger('click')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    await waitForRoute(testRouter, 'lost-report-detail')
    expect(testRouter.currentRoute.value.params.id).toBe('503')
  })

  it('N26 — logout durante POST pendente limpa rascunho e ignora resposta tardia sem snackbar nem navegação', async () => {
    const auth = setAuthenticatedSession({ id: 7 }, 'token-a')
    mockCatalogs()
    let resolvePost!: (val: CreateLostReportResult) => void
    vi.spyOn(lostReportService, 'create').mockImplementationOnce(
      () =>
        new Promise<CreateLostReportResult>((resolve) => {
          resolvePost = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper, { description: 'Rascunho confidencial usuário A' })
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await flushPromises()

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')

    resolvePost({
      lostReport: makeReport({ id: 99, description: 'Rascunho confidencial usuário A' }),
      suggestions: [],
    })
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('N27 & N28 — troca de conta ou mesma JWT em nova sessionGeneration descarta resposta antiga e limpa rascunho', async () => {
    const auth = setAuthenticatedSession({ id: 7 }, 'same-jwt')
    mockCatalogs()
    let resolvePost!: (val: CreateLostReportResult) => void
    vi.spyOn(lostReportService, 'create').mockImplementationOnce(
      () =>
        new Promise<CreateLostReportResult>((resolve) => {
          resolvePost = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    await fillValidForm(wrapper, { description: 'Rascunho sessão anterior' })
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await nextTick()
    auth.sessionGeneration += 1
    auth.token = 'same-jwt'
    auth.user = makeUser({ id: 7 })
    await flushPromises()

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')

    resolvePost({
      lostReport: makeReport({ id: 101, description: 'Rascunho sessão anterior' }),
      suggestions: [],
    })
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('N29 — desmontagem durante POST pendente descarta resposta tardia sem efeitos ou navegação', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    let resolvePost!: (val: CreateLostReportResult) => void
    vi.spyOn(lostReportService, 'create').mockImplementationOnce(
      () =>
        new Promise<CreateLostReportResult>((resolve) => {
          resolvePost = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()
    const pushSpy = vi.spyOn(testRouter, 'push')

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()

    wrapper.unmount()
    resolvePost({ lostReport: makeReport({ id: 202 }), suggestions: [] })
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('N32, N33 & N34 — Cancelar e Voltar para Minhas perdas navegam via rota nomeada sem chamar cancel/items/admin', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    const confirmSuggestionSpy = vi.spyOn(lostReportService, 'confirmSuggestion')
    const itemListSpy = vi.spyOn(itemService, 'list')
    const catCreateSpy = vi.spyOn(categoryService, 'create')
    const bldCreateSpy = vi.spyOn(buildingService, 'create')

    const { wrapper, testRouter } = await mountForm()
    await flushPromises()

    const backBtn = findButton(wrapper, 'Voltar para Minhas perdas')!
    const cancelBtn = findButton(wrapper, 'Cancelar')!
    expect(backBtn.attributes('href')).toBe('/minhas-perdas')
    expect(cancelBtn.attributes('href')).toBe('/minhas-perdas')

    await cancelBtn.trigger('click')
    await flushPromises()

    await waitForRoute(testRouter, 'my-lost-reports')
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(confirmSuggestionSpy).not.toHaveBeenCalled()
    expect(itemListSpy).not.toHaveBeenCalled()
    expect(catCreateSpy).not.toHaveBeenCalled()
    expect(bldCreateSpy).not.toHaveBeenCalled()
  })

  it('N25b — Regressão 07.1: NavigationFailure resolvida sem throw (aborted) preserva createdReportId e oferece Abrir detalhes sem falso erro, ignorando apenas duplicated', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const createSpy = vi
      .spyOn(lostReportService, 'create')
      .mockResolvedValueOnce({
        lostReport: makeReport({ id: 504 }),
        suggestions: [],
      })
      .mockResolvedValueOnce({
        lostReport: makeReport({ id: 505 }),
        suggestions: [],
      })

    // 1) Guard aborta navegação -> router.push() resolve com NavigationFailureType.aborted sem lançar exceção
    {
      let blockNext = true
      const { wrapper, testRouter } = await mountForm()
      await flushPromises()

      testRouter.beforeEach((to) => {
        if (to.name === 'lost-report-detail' && blockNext) {
          blockNext = false
          return false
        }
      })

      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.text()).toContain(
          'Sua perda foi registrada, mas não foi possível abrir os detalhes automaticamente.',
        )
      })
      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
      expect(wrapper.text()).not.toContain(genericConfirmError)

      const openBtn = findButton(wrapper, 'Abrir detalhes')
      expect(openBtn).toBeDefined()
      expect(openBtn!.attributes('href')).toBe('/minhas-perdas/504')

      await openBtn!.trigger('click')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      await waitForRoute(testRouter, 'lost-report-detail')
      expect(testRouter.currentRoute.value.params.id).toBe('504')
      wrapper.unmount()
    }

    // 2) NavigationFailureType.duplicated real é ignorada sem falso alerta de falha
    {
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      mockCatalogs()

      const { wrapper, testRouter } = await mountForm()
      await flushPromises()

      const originalPush = testRouter.push.bind(testRouter)
      vi.spyOn(testRouter, 'push').mockImplementationOnce(() => originalPush('/minhas-perdas/nova'))

      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(2)
      expect(findButton(wrapper, 'Abrir detalhes')).toBeUndefined()
      wrapper.unmount()
    }
  })

  it('U13.2-05 — exibe orientação clara sobre correspondências automáticas sem adicionar campo inexistente de título', async () => {
    setAuthenticatedSession()
    mockCatalogs()

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Após o registro')
    expect(wrapper.text()).toContain('mesma categoria')
    expect(wrapper.text()).not.toContain('Título da perda')
    wrapper.unmount()
  })

  it('BS13.3-16 — falha no GET de prédios não duplica alerta sobre NewLostReportView, recupera ao clicar Recarregar prédios e preserva envio sem prédio', async () => {
    setAuthenticatedSession()
    vi.spyOn(categoryService, 'list').mockResolvedValue(defaultCategories)
    const listBuildingsSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(new Error('Falha 503 prédios'))
      .mockResolvedValueOnce(defaultBuildings)
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ buildingId: null }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar os prédios. Você ainda pode enviar indicando qualquer prédio.')
    expect(findButton(wrapper, 'Recarregar prédios')).toBeDefined()
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(wrapper.findAllComponents({ name: 'VAlert' }).filter((a) => a.text().includes('Não foi possível carregar os prédios'))).toHaveLength(1)

    await findButton(wrapper, 'Recarregar prédios')!.trigger('click')
    await flushPromises()

    expect(listBuildingsSpy).toHaveBeenCalledTimes(2)
    expect(createSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual(defaultBuildings)

    await fillValidForm(wrapper, { categoryId: 3, buildingId: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0].buildingId).toBeNull()
    wrapper.unmount()
  })

  it('CS14-17 — falha no GET de categorias não duplica alerta em NewLostReportView, recupera via Recarregar categorias e bloqueia categoria removida sem trocar v-model', async () => {
    setAuthenticatedSession()
    vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
    const listCategoriesSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('Falha 503 categorias'))
      .mockResolvedValueOnce(defaultCategories)
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ categoryId: 3 }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar as categorias disponíveis.')
    expect(findButton(wrapper, 'Recarregar categorias')).toBeDefined()
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(wrapper.findAllComponents({ name: 'VAlert' }).filter((a) => a.text().includes('Não foi possível carregar as categorias'))).toHaveLength(1)

    await findButton(wrapper, 'Recarregar categorias')!.trigger('click')
    await flushPromises()

    expect(listCategoriesSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(CategorySelect).findComponent({ name: 'VSelect' }).props('items')).toEqual(defaultCategories)

    await fillValidForm(wrapper, { categoryId: 3, buildingId: null })

    // Simula exclusão administrativa da categoria 3 enquanto formulário estava preenchido
    const categoriesStore = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      syncCatalog: (items: Category[]) => void
    }
    categoriesStore.syncCatalog(defaultCategories.filter((c) => c.id !== 3))
    await nextTick()

    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(3)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Categoria selecionada é inválida.')
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(3)
    wrapper.unmount()
  })

  it('R17-CAT-01 — recuperação via categoriesStore.syncCatalog após falha inicial atualiza formulário sem novo GET e sem alertas duplicados', async () => {
    setAuthenticatedSession()
    vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
    const listCategoriesSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('Falha 503 inicial'))
    const createSpy = vi.spyOn(lostReportService, 'create').mockResolvedValue({
      lostReport: makeReport({ categoryId: 3, buildingId: null }),
      suggestions: [],
    })

    const { wrapper } = await mountForm()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar as categorias disponíveis.')
    expect(
      wrapper.findAllComponents({ name: 'VAlert' }).filter((a) =>
        a.text().includes('Não foi possível carregar as categorias'),
      ),
    ).toHaveLength(1)

    const categoriesStore = useCategoriesStore()
    categoriesStore.syncCatalog(defaultCategories)
    await nextTick()

    expect(listCategoriesSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias disponíveis.')
    expect(
      wrapper.findComponent(CategorySelect).findComponent({ name: 'VSelect' }).props('disabled'),
    ).toBe(false)
    expect(
      wrapper.findComponent(CategorySelect).findComponent({ name: 'VSelect' }).props('items'),
    ).toEqual(defaultCategories)

    await fillValidForm(wrapper, { categoryId: 3, buildingId: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('R17-CAT-02 & R17-CAT-03 — renomear categoria ou recuperar falha temporária via store compartilhada preserva ID selecionado', async () => {
    setAuthenticatedSession()
    vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
    const listCategoriesSpy = vi
      .spyOn(categoryService, 'list')
      .mockResolvedValueOnce(defaultCategories)
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce([
        { id: 3, name: 'Mochilas e Bolsas', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 5, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
      ])

    const { wrapper } = await mountForm()
    await flushPromises()

    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 3)
    await nextTick()

    const categoriesStore = useCategoriesStore()
    // R17-CAT-02: renomear categoria na store compartilhada mantém o ID selecionado e atualiza nome visível
    categoriesStore.syncCatalog([
      { id: 3, name: 'Mochilas e Bolsas', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 5, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    await nextTick()

    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(3)
    expect(
      wrapper.findComponent(CategorySelect).findComponent({ name: 'VSelect' }).props('items'),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 3, name: 'Mochilas e Bolsas' })]),
    )

    // R17-CAT-03: falha temporária de GET seguida de recuperação preserva o ID selecionado
    await categoriesStore.ensureLoaded(true)
    await flushPromises()
    expect(wrapper.text()).toContain('Não foi possível carregar as categorias disponíveis.')
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(3)

    await findButton(wrapper, 'Recarregar categorias')!.trigger('click')
    await flushPromises()

    expect(listCategoriesSpy).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias disponíveis.')
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(3)
    wrapper.unmount()
  })
})
