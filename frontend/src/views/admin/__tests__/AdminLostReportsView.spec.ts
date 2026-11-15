import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import AdminLostReportsView from '../AdminLostReportsView.vue'
import { vuetify } from '@/theme'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { categoryService } from '@/services/category.service'
import { buildingService } from '@/services/building.service'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import type { Building, Category, LostReport, Page, User } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof globalThis.visualViewport === 'undefined') {
  Object.defineProperty(globalThis, 'visualViewport', {
    value: {
      width: 1280,
      height: 800,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
  })
}

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 10,
  name: 'Admin Sistema',
  email: 'admin@ufc.br',
  phone: null,
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 42,
  userId: 8,
  categoryId: 3,
  buildingId: 2,
  confirmedItemId: null,
  description: 'Mochila preta perdida no laboratório de computação.',
  lossDate: '2026-11-10',
  status: 'OPEN',
  createdAt: '2026-11-11T10:30:00.000Z',
  ...overrides,
})

const makePage = (
  items: LostReport[] = [makeReport()],
  paginationOverrides: Partial<Page<LostReport>['pagination']> = {},
): Page<LostReport> => {
  const perPage = paginationOverrides.per_page ?? 12
  const total = paginationOverrides.total ?? items.length
  return {
    data: items,
    pagination: {
      total,
      page: 1,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      ...paginationOverrides,
    },
  }
}

const defaultCategories: Category[] = [
  { id: 3, name: 'Eletrônicos', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 4, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
]

const defaultBuildings: Building[] = [
  {
    id: 2,
    name: 'Bloco 1',
    address: 'Campus Quixadá',
    pickupPoint: 'Recepção',
    serviceHours: '08h às 17h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 5,
    name: 'Biblioteca',
    address: 'Bloco Central',
    pickupPoint: 'Balcão',
    serviceHours: '08h às 20h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

function setAdminSession(userOverrides: Partial<User> = {}, token = 'token-admin-a') {
  const auth = useAuthStore()
  auth.sessionGeneration += 1
  auth.token = token
  auth.user = makeUser(userOverrides)
  localStorage.setItem('achadex.token', token)
  return auth
}

function makeHttpError(status: number, details = 'Erro na operação') {
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

function mockCatalogs() {
  vi.spyOn(categoryService, 'list').mockResolvedValue(defaultCategories)
  vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
}

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/perdas', name: 'admin-lost-reports', component: { template: '<div />' } },
      { path: '/403', name: 'forbidden', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', name: 'fallback', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/admin/perdas')
  await router.isReady()
  const wrapper = mount(AdminLostReportsView, {
    attachTo: document.body,
    global: { plugins: [vuetify, router] },
  })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(label))
}

function findBodyButton(label: string) {
  return Array.from(document.body.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  )
}

function getFilterSelect(wrapper: VueWrapper, testId: string) {
  return wrapper
    .findAllComponents({ name: 'VSelect' })
    .find((c) => c.attributes('data-test') === testId)!
}

describe('AdminLostReportsView (Etapa 12 — Administração de Perdas)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
  })

  describe('Listagem, filtros e paginação (F01–F21)', () => {
    it('F01 & F02 — tela funcional sem "Em construção" executa GET inicial paginado com per_page 12', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([]))

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.text()).not.toContain('Em construção')
      expect(wrapper.text()).toContain('Relatos de Perdas')
      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(listSpy).toHaveBeenCalledWith({ page: 1, per_page: 12 })
    })

    it('F03 & F15 — renderiza relatos válidos com usuário, categoria, prédio, data, status e total verdadeiro', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage(
          [
            makeReport({ id: 42, userId: 8, categoryId: 3, buildingId: 2, status: 'OPEN', lossDate: '2026-11-10' }),
            makeReport({ id: 43, userId: 9, categoryId: 4, buildingId: null, status: 'RESOLVED', lossDate: '2026-11-09' }),
          ],
          { total: 24, page: 1, per_page: 12, total_pages: 2 },
        ),
      )

      const { wrapper } = await mountView()
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('#42')
      expect(text).toContain('Usuário #8')
      expect(text).toContain('Eletrônicos')
      expect(text).toContain('Bloco 1')
      expect(text).toContain('10/11/2026')
      expect(text).toContain('Aberto')
      expect(text).toContain('Qualquer prédio')
      expect(text).toContain('Resolvido')
      expect(text).toContain('24')
    })

    it('F04 & F05 — exibe LoadingOverlay enquanto carrega sem EmptyState prematuro e EmptyState quando vazio', async () => {
      setAdminSession()
      mockCatalogs()
      let resolveList!: (val: Page<LostReport>) => void
      vi.spyOn(adminLostReportService, 'list').mockImplementationOnce(
        () => new Promise<Page<LostReport>>((resolve) => { resolveList = resolve }),
      )

      const { wrapper } = await mountView()
      await nextTick()

      expect(wrapper.findComponent({ name: 'LoadingOverlay' }).props('loading')).toBe(true)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

      resolveList(makePage([], { total: 0, page: 1, per_page: 12, total_pages: 0 }))
      await flushPromises()

      expect(wrapper.findComponent({ name: 'LoadingOverlay' }).props('loading')).toBe(false)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    })

    it('F06 & F07 — HTTP 500 exibe ErrorAlert recuperável e Retry executa apenas GET', async () => {
      setAdminSession()
      mockCatalogs()
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve')
      const listSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockResolvedValueOnce(makePage([makeReport({ id: 50 })]))

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      const retryBtn = findButton(wrapper, 'Tentar novamente')
      expect(retryBtn).toBeDefined()
      await retryBtn!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('#50')
    })

    it('F08, F09, F10, F11 & F12 — aplica filtros status, categoryId e buildingId na página 1 e limpa corretamente', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi.spyOn(adminLostReportService, 'list').mockImplementation(async (q) =>
        makePage([makeReport({
          status: q?.status ?? 'OPEN',
          categoryId: q?.categoryId ?? 3,
          buildingId: q?.buildingId ?? 2,
        })], { page: q?.page ?? 1, per_page: q?.per_page ?? 12 }),
      )

      const { wrapper } = await mountView()
      await flushPromises()

      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'RESOLVED')
      await getFilterSelect(wrapper, 'filter-category').vm.$emit('update:modelValue', 4)
      await getFilterSelect(wrapper, 'filter-building').vm.$emit('update:modelValue', 5)
      await findButton(wrapper, 'Filtrar')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenLastCalledWith({
        status: 'RESOLVED',
        categoryId: 4,
        buildingId: 5,
        page: 1,
        per_page: 12,
      })

      await findButton(wrapper, 'Limpar filtros')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenLastCalledWith({
        page: 1,
        per_page: 12,
      })
    })

    it('F13 & F14 — paginação envia página 2 preservando filtros e alteração de per_page volta à página 1', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi.spyOn(adminLostReportService, 'list').mockImplementation(async (q) =>
        makePage(
          [makeReport({ id: q?.page === 2 ? 20 : 10, status: q?.status ?? 'OPEN' })],
          { total: 30, page: q?.page ?? 1, per_page: q?.per_page ?? 12, total_pages: Math.ceil(30 / (q?.per_page ?? 12)) },
        ),
      )

      const { wrapper } = await mountView()
      await flushPromises()

      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'OPEN')
      await findButton(wrapper, 'Filtrar')!.trigger('click')
      await flushPromises()

      const footer = wrapper.findComponent({ name: 'PaginationFooter' })
      footer.vm.$emit('update:page', 2)
      await flushPromises()

      expect(listSpy).toHaveBeenLastCalledWith({ status: 'OPEN', page: 2, per_page: 12 })

      footer.vm.$emit('update:limit', 24)
      await flushPromises()

      expect(listSpy).toHaveBeenLastCalledWith({ status: 'OPEN', page: 1, per_page: 24 })
    })

    it('F16 — página fora do intervalo executa recuperação controlada sem loop de GETs', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage([makeReport({ id: 1 })], { total: 30, page: 1, per_page: 12, total_pages: 3 }))
        // Usuário pede página 3, mas total encolheu para 15 (total_pages: 2)
        .mockResolvedValueOnce(makePage([], { total: 15, page: 3, per_page: 12, total_pages: 2 }))
        // Recuperação controlada busca página 2 e para
        .mockResolvedValueOnce(makePage([makeReport({ id: 15 })], { total: 15, page: 2, per_page: 12, total_pages: 2 }))

      const { wrapper } = await mountView()
      await flushPromises()

      wrapper.findComponent({ name: 'PaginationFooter' }).vm.$emit('update:page', 3)
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(listSpy).toHaveBeenNthCalledWith(3, { page: 2, per_page: 12 })
      expect(wrapper.text()).toContain('#15')
    })

    it('F17, F18 & F19 — rejeita DTO inválido, paginação incoerente e IDs duplicados sem tratar como lista vazia', async () => {
      setAdminSession()
      mockCatalogs()
      const invalidPayloads: unknown[] = [
        // F17: DTO sem description válida
        { data: [{ id: 1, userId: 2, categoryId: 3, buildingId: null, confirmedItemId: null, description: '', lossDate: '2026-11-10', status: 'OPEN', createdAt: '2026-11-11T00:00:00Z' }], pagination: { total: 1, page: 1, per_page: 12, total_pages: 1 } },
        // F18: total_pages incoerente
        { data: [makeReport()], pagination: { total: 25, page: 1, per_page: 12, total_pages: 1 } },
        // F19: IDs duplicados
        makePage([makeReport({ id: 10 }), makeReport({ id: 10 })], { total: 2, page: 1, per_page: 12, total_pages: 1 }),
      ]

      for (const payload of invalidPayloads) {
        vi.restoreAllMocks()
        mockCatalogs()
        setAdminSession()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValueOnce(payload as Page<LostReport>)
        const { wrapper } = await mountView()
        await flushPromises()

        expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
        expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
        wrapper.unmount()
      }
    })

    it('F20 & F21 — GETs de filtros e páginas fora de ordem descartam a resposta mais antiga', async () => {
      setAdminSession()
      mockCatalogs()
      let resolveFirst!: (val: Page<LostReport>) => void
      let resolveFilterOpen!: (val: Page<LostReport>) => void
      let resolveFilterResolved!: (val: Page<LostReport>) => void

      vi.spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage([makeReport({ id: 1 })], { total: 30, page: 1, per_page: 12, total_pages: 3 }))
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveFilterOpen = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveFilterResolved = r }))

      const { wrapper } = await mountView()
      await flushPromises()

      // F21: Página 2 vs Página 3 fora de ordem
      const footer = wrapper.findComponent({ name: 'PaginationFooter' })
      footer.vm.$emit('update:page', 2)
      await nextTick()

      // F20: Filtro OPEN vs Filtro RESOLVED fora de ordem
      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'OPEN')
      await findButton(wrapper, 'Filtrar')!.trigger('click')
      await nextTick()

      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'RESOLVED')
      await findButton(wrapper, 'Filtrar')!.trigger('click')
      await nextTick()

      resolveFilterResolved(makePage([makeReport({ id: 99, status: 'RESOLVED' })]))
      await flushPromises()

      // Resolvendo as respostas atrasadas depois
      resolveFirst(makePage([makeReport({ id: 2, status: 'OPEN' })], { page: 2 }))
      resolveFilterOpen(makePage([makeReport({ id: 88, status: 'OPEN' })]))
      await flushPromises()

      expect(wrapper.text()).toContain('#99')
      expect(wrapper.text()).not.toContain('#88')
      expect(wrapper.text()).not.toContain('#2')
    })
  })

  describe('Consulta de detalhes (D01–D11)', () => {
    it('D01, D02, D03, D04, D05 & D06 — abre detalhes via endpoint admin, exibe todos DTOs sem inventar pessoa/item e trata prédio nulo', async () => {
      setAdminSession()
      mockCatalogs()
      const apiGetSpy = vi.spyOn(api, 'get')
      const reportListItem = makeReport({ id: 12, userId: 5, buildingId: null, confirmedItemId: 25 })
      const reportWithoutItem = makeReport({ id: 13, userId: 6, buildingId: 2, confirmedItemId: null })
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([reportListItem, reportWithoutItem]))
      const getByIdSpy = vi
        .spyOn(adminLostReportService, 'getById')
        .mockResolvedValueOnce(reportListItem)
        .mockResolvedValueOnce(reportWithoutItem)

      const { wrapper } = await mountView()
      await flushPromises()

      const detailButtons = wrapper.findAll('button').filter((b) => b.text().includes('Ver detalhes'))
      await detailButtons[0].trigger('click')
      await flushPromises()

      expect(getByIdSpy).toHaveBeenCalledWith(12)
      expect(apiGetSpy).not.toHaveBeenCalledWith('/lost-reports/12')
      const bodyText1 = document.body.textContent ?? ''
      expect(bodyText1).toContain('#12')
      expect(bodyText1).toContain('Usuário #5')
      expect(bodyText1).toContain('Qualquer prédio')
      expect(bodyText1).toContain('Item confirmado #25')
      expect(bodyText1).not.toContain('CPF')

      findBodyButton('Fechar')!.click()
      await nextTick()

      await detailButtons[1].trigger('click')
      await flushPromises()
      const bodyText2 = document.body.textContent ?? ''
      expect(bodyText2).toContain('#13')
      expect(bodyText2).toContain('Nenhum item confirmado')
    })

    it('D07 & D08 — trata HTTP 404 e HTTP 500 nos detalhes com retry apenas por GET', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 12 }), makeReport({ id: 13 })]))
      const getByIdSpy = vi
        .spyOn(adminLostReportService, 'getById')
        .mockRejectedValueOnce(makeHttpError(404, 'Relato não encontrado'))
        .mockRejectedValueOnce(makeHttpError(500, 'Erro servidor'))
        .mockResolvedValueOnce(makeReport({ id: 13, description: 'Detalhe recuperado #13' }))
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve')

      const { wrapper } = await mountView()
      await flushPromises()

      const detailButtons = wrapper.findAll('button').filter((b) => b.text().includes('Ver detalhes'))
      await detailButtons[0].trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('não encontrado')

      findBodyButton('Fechar')!.click()
      await nextTick()

      await detailButtons[1].trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('Tentar novamente')

      findBodyButton('Tentar novamente')!.click()
      await flushPromises()

      expect(getByIdSpy).toHaveBeenCalledTimes(3)
      expect(resolveSpy).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('Detalhe recuperado #13')
    })

    it('D09, D10 & D11 — troca de seleção descarta GET antigo, fechar durante GET não reabre e listagem preserva filtros/página', async () => {
      setAdminSession()
      mockCatalogs()
      let resolveFirst!: (val: LostReport) => void
      let resolveSecond!: (val: LostReport) => void
      let resolveThird!: (val: LostReport) => void

      vi.spyOn(adminLostReportService, 'list').mockImplementation(async (q) =>
        makePage(
          [makeReport({ id: 12, status: q?.status ?? 'OPEN' }), makeReport({ id: 13, status: q?.status ?? 'OPEN' })],
          {
            total: 30,
            page: q?.page ?? 1,
            per_page: q?.per_page ?? 12,
            total_pages: Math.ceil(30 / (q?.per_page ?? 12)),
          },
        ),
      )

      vi.spyOn(adminLostReportService, 'getById')
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveThird = r }))

      const { wrapper } = await mountView()
      await flushPromises()

      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'OPEN')
      const footer = wrapper.findComponent({ name: 'PaginationFooter' })
      footer.vm.$emit('update:limit', 24)
      await flushPromises()
      footer.vm.$emit('update:page', 2)
      await flushPromises()

      // Seleciona 12 e fecha diálogo antes de concluir -> resposta tardia não reabre
      await wrapper.findAll('button').filter((b) => b.text().includes('Ver detalhes'))[0].trigger('click')
      await nextTick()
      findBodyButton('Fechar')!.click()
      await nextTick()
      resolveFirst(makeReport({ id: 12, description: 'Tardia #12' }))
      await flushPromises()
      expect(document.body.textContent).not.toContain('Tardia #12')

      // Seleciona 12, depois seleciona 13 antes de 12 terminar -> 13 prevalece (D09)
      const detailButtons = wrapper.findAll('button').filter((b) => b.text().includes('Ver detalhes'))
      await detailButtons[0].trigger('click')
      await nextTick()
      findBodyButton('Fechar')!.click()
      await nextTick()
      await detailButtons[1].trigger('click')
      await nextTick()

      resolveThird(makeReport({ id: 13, description: 'Detalhe atual #13' }))
      await flushPromises()
      resolveSecond(makeReport({ id: 12, description: 'Detalhe obsoleto #12' }))
      await flushPromises()

      expect(document.body.textContent).toContain('Detalhe atual #13')
      expect(document.body.textContent).not.toContain('Detalhe obsoleto #12')

      findBodyButton('Fechar')!.click()
      await nextTick()
      // D11: preserva filtros e página
      expect(getFilterSelect(wrapper, 'filter-status').props('modelValue')).toBe('OPEN')
    })
  })

  describe('Resolução administrativa e segurança de concorrência/sessão (R01–R27)', () => {
    it('R01, R02, R03 & R04 — botão Resolver perda aparece apenas para OPEN (mesmo sem item confirmado) e cancelar diálogo envia 0 POSTs', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([
          makeReport({ id: 42, status: 'OPEN', confirmedItemId: null }),
          makeReport({ id: 43, status: 'RESOLVED' }),
          makeReport({ id: 44, status: 'CANCELLED' }),
        ]),
      )
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve')
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm').mockResolvedValueOnce(false)

      const { wrapper } = await mountView()
      await flushPromises()

      const resolveButtons = wrapper.findAll('button').filter((b) => b.text().includes('Resolver perda'))
      expect(resolveButtons).toHaveLength(1)

      await resolveButtons[0].trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(resolveSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Aberto')
    })

    it('R05, R06, R07, R08, R26 & R27 — confirmação envia 1 POST, evita duplo clique, atualiza para RESOLVED sem tocar em itens e exibe snackbar único', async () => {
      setAdminSession()
      mockCatalogs()
      const openReport = makeReport({ id: 42, status: 'OPEN', confirmedItemId: null })
      const resolvedReport = makeReport({ id: 42, status: 'RESOLVED', confirmedItemId: null })

      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([openReport]))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValue(openReport)

      let resolvePost!: (val: LostReport) => void
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolvePost = r }),
      )
      const apiPatchSpy = vi.spyOn(api, 'patch')
      const apiPutSpy = vi.spyOn(api, 'put')

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
      const snackbarSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      // R26: abrir detalhes nunca resolve
      await wrapper.findAll('button').filter((b) => b.text().includes('Ver detalhes'))[0].trigger('click')
      await flushPromises()
      expect(resolveSpy).not.toHaveBeenCalled()

      // R07: duplo clique durante escrita em andamento dispara apenas 1 POST
      const resolveBtn = findButton(wrapper, 'Resolver perda')!
      await resolveBtn.trigger('click')
      await flushPromises()
      await resolveBtn.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(resolveBtn.attributes('disabled')).toBeDefined()

      resolvePost(resolvedReport)
      await flushPromises()

      expect(snackbarSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Resolvido')
      expect(document.body.textContent).toContain('Resolvido')
      // R27: sem chamadas de mutação em item/entrega
      expect(apiPatchSpy).not.toHaveBeenCalled()
      expect(apiPutSpy).not.toHaveBeenCalled()
    })

    it('R09 & R10 — com filtro status=OPEN, resolução remove item da lista OPEN e reconcilia total e paginação por GET', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })], { total: 2 }))
        .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })], { total: 2 }))
        .mockResolvedValueOnce(makePage([makeReport({ id: 43, status: 'OPEN' })], { total: 1 }))

      vi.spyOn(adminLostReportService, 'resolve').mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getFilterSelect(wrapper, 'filter-status').vm.$emit('update:modelValue', 'OPEN')
      await findButton(wrapper, 'Filtrar')!.trigger('click')
      await flushPromises()

      await findButton(wrapper, 'Resolver perda')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(wrapper.text()).not.toContain('#42')
      expect(wrapper.text()).toContain('#43')
      expect(wrapper.text()).toContain('Total de registros: 1')
    })

    it('R11, R12 & R13 — HTTP 409 executa GET de recuperação (RESOLVED/CANCELLED) e trata falha 503 com retry só de GET', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve').mockRejectedValue(makeHttpError(409, 'Já encerrado'))
      const getByIdSpy = vi
        .spyOn(adminLostReportService, 'getById')
        .mockRejectedValueOnce(makeHttpError(503, 'Indisponível'))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'CANCELLED' }))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Resolver perda')!.trigger('click')
      await flushPromises()

      // R13: 409 seguido de GET 503 -> erro recuperável + botão Consultar estado atual (sem 2º POST)
      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(getByIdSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Consultar estado atual')

      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await flushPromises()

      // R12: CANCELLED confirmado pelo GET, sem sucesso falso
      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(getByIdSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Cancelado')

      // Novo cenário R11: HTTP 409 seguido de GET retornando RESOLVED
      wrapper.unmount()
      vi.restoreAllMocks()
      mockCatalogs()
      setAdminSession()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 77, status: 'OPEN' })]))
      const resolveSpy2 = vi.spyOn(adminLostReportService, 'resolve').mockRejectedValueOnce(makeHttpError(409))
      const getByIdSpy2 = vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 77, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

      const second = await mountView()
      await flushPromises()
      await findButton(second.wrapper, 'Resolver perda')!.trigger('click')
      await flushPromises()

      expect(resolveSpy2).toHaveBeenCalledTimes(1)
      expect(getByIdSpy2).toHaveBeenCalledWith(77)
      expect(second.wrapper.text()).toContain('Resolvido')
    })

    it('R14, R15, R16, R17 & R18 — 404, 500, falha de rede e HTTP 200 malformado/ID errado não repetem POST e oferecem GET', async () => {
      const errorScenarios = [
        { name: '404', mock: () => Promise.reject(makeHttpError(404, 'Relato não encontrado')) },
        { name: '500', mock: () => Promise.reject(makeHttpError(500, 'Erro interno')) },
        { name: 'network', mock: () => Promise.reject(new Error('Network Error')) },
        { name: 'malformed-200', mock: () => Promise.resolve({ id: 42, status: 'OPEN' } as unknown as LostReport) },
        { name: 'wrong-id-200', mock: () => Promise.resolve(makeReport({ id: 999, status: 'RESOLVED' })) },
      ]

      for (const scenario of errorScenarios) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        setAdminSession()

        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))
        const resolveSpy = vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(scenario.mock)
        const getByIdSpy = vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const successSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Resolver perda')!.trigger('click')
        await flushPromises()

        expect(resolveSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()

        if (scenario.name !== '404') {
          const checkBtn = findButton(wrapper, 'Consultar estado atual')
          expect(checkBtn).toBeDefined()
          await checkBtn!.trigger('click')
          await flushPromises()
          expect(getByIdSpy).toHaveBeenCalledWith(42)
          expect(resolveSpy).toHaveBeenCalledTimes(1)
        }
        wrapper.unmount()
      }
    })

    it('R19 — GET antigo iniciado antes do POST não restaura status OPEN após HTTP 200', async () => {
      setAdminSession()
      mockCatalogs()
      let resolveOldList!: (val: Page<LostReport>) => void
      vi.spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' })]))
        .mockImplementationOnce(() => new Promise((r) => { resolveOldList = r }))
      vi.spyOn(adminLostReportService, 'resolve').mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountView()
      await flushPromises()

      // Dispara GET lento antes do POST
      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      // POST completa antes do GET antigo terminar
      await findButton(wrapper, 'Resolver perda')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')

      // GET antigo retorna report #42 ainda OPEN -> deve ser descartado
      resolveOldList(makePage([makeReport({ id: 42, status: 'OPEN' })]))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Aberto')
    })

    it('R20, R21, R22 & R25 — logout, troca de conta, nova sessionGeneration com mesmo JWT e perda de papel descartam respostas e limpam dados', async () => {
      // R20: logout durante POST
      {
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-a')
        mockCatalogs()
        let resolvePost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42 })]))
        vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(() => new Promise((r) => { resolvePost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Resolver perda')!.trigger('click')
        await nextTick()

        auth.logout()
        await nextTick()
        resolvePost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }

      // R21 & R22: troca de conta e mesmo JWT com nova generation
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'same-jwt')
        let resolveOldPost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'list')
          .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' })]))
          .mockResolvedValueOnce(makePage([makeReport({ id: 99, status: 'OPEN' })]))
        vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(() => new Promise((r) => { resolveOldPost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Resolver perda')!.trigger('click')
        await nextTick()

        // Mesmo JWT, nova generation + conta B
        auth.sessionGeneration += 1
        auth.user = makeUser({ id: 20, role: 'SUPERADMIN' })
        await flushPromises()

        resolveOldPost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('#99')
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }

      // R25: perda de papel administrativo (ADMIN -> USER)
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-user')
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))

        const { wrapper } = await mountView()
        await flushPromises()
        expect(wrapper.text()).toContain('#42')

        auth.user = makeUser({ id: 10, role: 'USER' })
        await flushPromises()

        expect(wrapper.text()).not.toContain('#42')
        expect(findButton(wrapper, 'Resolver perda')).toBeUndefined()
        wrapper.unmount()
      }
    })

    it('R23 & R24 — desmontagem com diálogo aberto ou durante POST não envia POST tardio nem gera efeitos colaterais', async () => {
      // R23: diálogo aberto na desmontagem
      {
        setAdminSession()
        mockCatalogs()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42 })]))
        const resolveSpy = vi.spyOn(adminLostReportService, 'resolve')
        const ui = useUiStore()
        let resolveDialog!: (val: boolean) => void
        vi.spyOn(ui, 'confirm').mockImplementationOnce(() => new Promise<boolean>((r) => { resolveDialog = r }))

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Resolver perda')!.trigger('click')
        await nextTick()

        wrapper.unmount()
        resolveDialog(true)
        await flushPromises()

        expect(resolveSpy).not.toHaveBeenCalled()
      }

      // R24: desmontagem durante POST
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        setAdminSession()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42 })]))
        let resolvePost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(() => new Promise((r) => { resolvePost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Resolver perda')!.trigger('click')
        await flushPromises()

        wrapper.unmount()
        resolvePost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
      }
    })
  })

  describe('Etapa 12.1 — Limpeza de resolução após HTTP 409 e validação de per_page', () => {
    function getResolveButtonForReport(wrapper: VueWrapper, reportId: number) {
      const card = wrapper
        .findAllComponents({ name: 'VCard' })
        .find((c) => c.text().includes(`Relato #${reportId}`))
      return card?.findAll('button').find((b) => b.text().includes('Resolver perda'))
    }

    it('R12.1-01 — HTTP 409 + GET RESOLVED atualiza #42 e libera resolução subsequente de #43', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN', description: 'Mochila 42 aberta' })
      const report43 = makeReport({ id: 43, status: 'OPEN', description: 'Mochila 43 aberta' })

      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42, report43]))
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409, 'Relato já resolvido'))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED', description: 'Mochila 43 aberta' }))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(
        makeReport({ id: 42, status: 'RESOLVED', description: 'Mochila 42 aberta' }),
      )

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(resolveSpy).toHaveBeenCalledWith(42)
      expect(successSpy).not.toHaveBeenCalled()
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
      expect(wrapper.text()).toContain('Resolvido')

      const btn43AfterConflict = getResolveButtonForReport(wrapper, 43)!
      expect(btn43AfterConflict).toBeDefined()
      expect(btn43AfterConflict.attributes('disabled')).toBeUndefined()

      await btn43AfterConflict.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenLastCalledWith(43)
      expect(successSpy).toHaveBeenCalledTimes(1)
      expect(getResolveButtonForReport(wrapper, 43)).toBeUndefined()
    })

    it('R12.1-02 — HTTP 409 + GET CANCELLED exibe Cancelado em #42 e permite resolver #43', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN' })
      const report43 = makeReport({ id: 43, status: 'OPEN' })

      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42, report43]))
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409, 'Cancelado'))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(
        makeReport({ id: 42, status: 'CANCELLED' }),
      )

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Cancelado')
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
      expect(successSpy).not.toHaveBeenCalled()
      expect(resolveSpy).toHaveBeenCalledTimes(1)

      const btn43 = getResolveButtonForReport(wrapper, 43)!
      expect(btn43.attributes('disabled')).toBeUndefined()

      await btn43.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenLastCalledWith(43)
    })

    it('R12.1-03 & R12.1-04 — HTTP 409 + GET 503 libera resolução de outro relato e retry executa somente GET', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN' })
      const report43 = makeReport({ id: 43, status: 'OPEN' })

      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42, report43]))
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409, 'Conflito'))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
      const getByIdSpy = vi
        .spyOn(adminLostReportService, 'getById')
        .mockRejectedValueOnce(makeHttpError(503, 'Indisponível'))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))

      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Consultar estado atual')
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()

      // R12.1-04: retry executa exclusivamente GET e não repete POST #42
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await flushPromises()

      expect(getByIdSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()

      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenLastCalledWith(43)
    })

    it('R12.1-05 — HTTP 409 + GET 404 apresenta não encontrado sem prender resolução de #43', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
      vi.spyOn(adminLostReportService, 'getById').mockRejectedValueOnce(makeHttpError(404, 'Não encontrado'))
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(successSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('não encontrado')

      const btn43 = getResolveButtonForReport(wrapper, 43)!
      expect(btn43.attributes('disabled')).toBeUndefined()
      await btn43.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenLastCalledWith(43)
    })

    it('R12.1-06 — HTTP 409 + DTO inválido rejeita resposta, libera resolving e permite resolver #43', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(
        makeReport({ id: 99, status: 'RESOLVED' }),
      )
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Consultar estado atual')
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()

      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(resolveSpy).toHaveBeenLastCalledWith(43)
    })

    it('R12.1-07 — HTTP 409 + GET ainda OPEN libera nova decisão explícita sem POST automático', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 42, status: 'OPEN' }))
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(successSpy).not.toHaveBeenCalled()

      const btn42 = getResolveButtonForReport(wrapper, 42)!
      expect(btn42.attributes('disabled')).toBeUndefined()

      await btn42.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(successSpy).toHaveBeenCalledTimes(1)
    })

    it('R12.1-08 — recuperação pendente mantém exclusão mútua e libera ao finalizar o GET', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409))
        .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
      let resolveRecoveryGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveRecoveryGet = r }),
      )
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      // Enquanto GET de recuperação pende, botão #43 fica desabilitado
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeDefined()
      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      expect(resolveSpy).toHaveBeenCalledTimes(1)

      resolveRecoveryGet(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()

      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()
      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
    })

    it('R12.1-09 — recuperações manuais fora de ordem descartam a mais antiga e preservam checkingRecovery da mais recente', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))
      vi.spyOn(adminLostReportService, 'resolve').mockRejectedValueOnce(makeHttpError(500))
      let resolveFirstGet!: (val: LostReport) => void
      let resolveSecondGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById')
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveFirstGet = r }))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveSecondGet = r }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      const findConsultVBtn = () =>
        wrapper.findAllComponents({ name: 'VBtn' }).find((b) => b.text().includes('Consultar estado atual'))!
      const consultBtn = findButton(wrapper, 'Consultar estado atual')!
      await consultBtn.trigger('click')
      await nextTick()
      await consultBtn.trigger('click')
      await nextTick()

      // Antiga resolve primeiro enquanto nova ainda está pendente -> não deve aplicar OPEN nem limpar loading da nova
      resolveFirstGet(makeReport({ id: 42, status: 'OPEN' }))
      await flushPromises()
      expect(findConsultVBtn().props('loading')).toBe(true)

      // Nova resolve com RESOLVED
      resolveSecondGet(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')
    })

    it('R12.1-10 — duplo clique após recuperação de 409 envia apenas 1 POST para #43', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )
      let resolvePost43!: (val: LostReport) => void
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(409))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePost43 = r }))
      vi.spyOn(adminLostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      const btn43 = getResolveButtonForReport(wrapper, 43)!
      await btn43.trigger('click')
      await flushPromises()
      await btn43.trigger('click')
      await flushPromises()

      expect(resolveSpy).toHaveBeenCalledTimes(2)
      resolvePost43(makeReport({ id: 43, status: 'RESOLVED' }))
      await flushPromises()
    })

    it('R12.1-11, R12.1-12, R12.1-13 & R12.1-14 — logout, troca de conta, nova generation e perda de papel durante POST/409 isolam sessões', async () => {
      // Logout durante GET de recuperação pós-409
      {
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-a')
        mockCatalogs()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42 })]))
        vi.spyOn(adminLostReportService, 'resolve').mockRejectedValueOnce(makeHttpError(409))
        let resolveRecovery!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
          () => new Promise<LostReport>((r) => { resolveRecovery = r }),
        )
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        auth.logout()
        await nextTick()
        resolveRecovery(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }

      // Troca de conta A -> B durante POST de A quando A já está pendente e B inicia operação legítima
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'same-jwt')
        let rejectOldPostA!: (err: unknown) => void
        let resolvePostB!: (val: LostReport) => void
        const resolveSpy = vi
          .spyOn(adminLostReportService, 'resolve')
          .mockImplementationOnce(() => new Promise((_, rej) => { rejectOldPostA = rej }))
          .mockImplementationOnce(() => new Promise((r) => { resolvePostB = r }))
        vi.spyOn(adminLostReportService, 'list')
          .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' })]))
          .mockResolvedValueOnce(makePage([makeReport({ id: 99, status: 'OPEN' })]))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await nextTick()

        // Troca de conta com mesmo JWT e nova generation
        auth.sessionGeneration += 1
        auth.user = makeUser({ id: 20, role: 'SUPERADMIN' })
        await flushPromises()

        await getResolveButtonForReport(wrapper, 99)!.trigger('click')
        await flushPromises()
        expect(getResolveButtonForReport(wrapper, 99)!.attributes('disabled')).toBeDefined()

        // Operação antiga de A rejeita 500 -> não deve limpar loading nem injetar erro em B
        rejectOldPostA(makeHttpError(500))
        await flushPromises()
        expect(getResolveButtonForReport(wrapper, 99)!.attributes('disabled')).toBeDefined()
        expect(wrapper.text()).not.toContain('Consultar estado atual')
        expect(resolveSpy).toHaveBeenCalledTimes(2)

        resolvePostB(makeReport({ id: 99, status: 'RESOLVED' }))
        await flushPromises()
        expect(wrapper.text()).toContain('Resolvido')
        wrapper.unmount()
      }

      // R12.1-14: perda de papel ADMIN -> USER durante POST/409 limpa dados e ignora resposta tardia
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-role')
        let rejectPost409!: (err: unknown) => void
        vi.spyOn(adminLostReportService, 'list').mockResolvedValueOnce(
          makePage([makeReport({ id: 42, status: 'OPEN' })]),
        )
        vi.spyOn(adminLostReportService, 'resolve').mockImplementationOnce(
          () => new Promise((_, rej) => { rejectPost409 = rej }),
        )
        const getByIdSpy = vi.spyOn(adminLostReportService, 'getById')
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await nextTick()

        auth.user = makeUser({ id: 10, role: 'USER' })
        await flushPromises()
        expect(wrapper.text()).not.toContain('#42')

        rejectPost409(makeHttpError(409))
        await flushPromises()
        expect(getByIdSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }
    })

    it('R12.1-15 — desmontagem durante GET de recuperação não aplica efeitos tardios nem afeta nova montagem', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))
      vi.spyOn(adminLostReportService, 'resolve').mockRejectedValueOnce(makeHttpError(409))
      let resolveRecovery!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveRecovery = r }),
      )
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      wrapper.unmount()
      resolveRecovery(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()

      expect(snackSpy).not.toHaveBeenCalled()
    })

    it('R12.1-16 & R12.1-17 — HTTP 200 normal e falhas (500, rede, 200 inválido) liberam estado para resolver #43', async () => {
      // R12.1-16: HTTP 200 normal em #42 seguido de #43
      {
        setAdminSession()
        mockCatalogs()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
          makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
        )
        const resolveSpy = vi
          .spyOn(adminLostReportService, 'resolve')
          .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
          .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
        const getByIdSpy = vi.spyOn(adminLostReportService, 'getById')
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValue(true)
        const successSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        expect(successSpy).toHaveBeenCalledTimes(1)
        expect(getByIdSpy).not.toHaveBeenCalled()

        await getResolveButtonForReport(wrapper, 43)!.trigger('click')
        await flushPromises()
        expect(resolveSpy).toHaveBeenCalledTimes(2)
        expect(successSpy).toHaveBeenCalledTimes(2)
        wrapper.unmount()
      }

      // R12.1-17: 500, rede e 200 inválido liberam #43
      for (const failure of [
        () => Promise.reject(makeHttpError(500)),
        () => Promise.reject(new Error('Network Error')),
        () => Promise.resolve({ id: 42, status: 'OPEN' } as unknown as LostReport),
      ]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        setAdminSession()

        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
          makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
        )
        const resolveSpy = vi
          .spyOn(adminLostReportService, 'resolve')
          .mockImplementationOnce(failure)
          .mockResolvedValueOnce(makeReport({ id: 43, status: 'RESOLVED' }))
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        expect(resolveSpy).toHaveBeenCalledTimes(1)
        expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()

        await getResolveButtonForReport(wrapper, 43)!.trigger('click')
        await flushPromises()
        expect(resolveSpy).toHaveBeenCalledTimes(2)
        wrapper.unmount()
      }
    })

    it('P12.1-08 — view rejeita per_page divergente (solicitado 12, recebido 24) sem estado vazio e permite retry correto', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage([], { total: 0, page: 1, per_page: 24, total_pages: 0 }))
        .mockResolvedValueOnce(makePage([makeReport({ id: 77 })], { total: 1, page: 1, per_page: 12, total_pages: 1 }))

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

      await findButton(wrapper, 'Tentar novamente')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(listSpy).toHaveBeenNthCalledWith(2, { page: 1, per_page: 12 })
      expect(wrapper.text()).toContain('#77')
    })
  })

  describe('Etapa 12.2 — Invalidação de GET de recuperação antigo ao iniciar novo POST', () => {
    function getResolveButtonForReport(wrapper: VueWrapper, reportId: number) {
      const card = wrapper
        .findAllComponents({ name: 'VCard' })
        .find((c) => c.text().includes(`Relato #${reportId}`))
      return card?.findAll('button').find((b) => b.text().includes('Resolver perda'))
    }

    function findDetailDialogCard() {
      return Array.from(document.body.querySelectorAll('.v-card')).find((el) =>
        el.textContent?.includes('Detalhes do relato #42'),
      )
    }

    function findConsultVBtn(wrapper: VueWrapper) {
      return wrapper
        .findAllComponents({ name: 'VBtn' })
        .find((b) => b.text().includes('Consultar estado atual'))
    }

    it('R12.2-01 — GET antigo com OPEN não reverte POST confirmado RESOLVED', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN', description: 'Mochila #42' })
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42]))

      let resolveStaleGet!: (val: LostReport) => void
      const getByIdSpy = vi
        .spyOn(adminLostReportService, 'getById')
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveStaleGet = r }))

      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED', description: 'Mochila #42' }))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      // 1a tentativa falha com 500 -> exibe "Consultar estado atual"
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Consultar estado atual')

      // Inicia GET manual de recuperação (pendente)
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()
      expect(getByIdSpy).toHaveBeenCalledTimes(1)

      // Enquanto GET antigo está pendente, inicia novo POST -> retorna HTTP 200 RESOLVED
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Resolvido')
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
      expect(successSpy).toHaveBeenCalledTimes(1)

      // GET antigo finalmente resolve com OPEN -> deve ser descartado integralmente
      resolveStaleGet(makeReport({ id: 42, status: 'OPEN', description: 'Mochila #42' }))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Aberto')
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledTimes(2)
      expect(successSpy).toHaveBeenCalledTimes(1)
    })

    it('R12.2-02 — GET antigo com OPEN não altera o painel de detalhes após POST confirmado', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN', description: 'Carteira #42' })
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42]))

      let resolveStaleGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById')
        .mockResolvedValueOnce(report42) // abertura inicial dos detalhes
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveStaleGet = r }))

      vi.spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED', description: 'Carteira #42' }))

      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Ver detalhes')!.trigger('click')
      await flushPromises()
      expect(findDetailDialogCard()?.textContent).toContain('Aberto')

      // 1a tentativa pela listagem falha com 500
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      // 2a tentativa resolve com 200 RESOLVED
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')
      expect(findDetailDialogCard()?.textContent).toContain('Resolvido')
      expect(findDetailDialogCard()?.textContent).not.toContain('Resolver perda')

      // GET antigo retorna OPEN
      resolveStaleGet(makeReport({ id: 42, status: 'OPEN', description: 'Carteira #42' }))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Aberto')
      expect(findDetailDialogCard()?.textContent).toContain('Resolvido')
      expect(findDetailDialogCard()?.textContent).not.toContain('Aberto')
      expect(findDetailDialogCard()?.textContent).not.toContain('Resolver perda')
    })

    it('R12.2-03 — GET antigo com CANCELLED não sobrescreve RESOLVED confirmado', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))

      let resolveStaleGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveStaleGet = r }),
      )
      vi.spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')

      resolveStaleGet(makeReport({ id: 42, status: 'CANCELLED' }))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Cancelado')
    })

    it('R12.2-04 — GET antigo rejeitado (HTTP 503) não exibe erro obsoleto sobre sucesso confirmado', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))

      let rejectStaleGet!: (err: unknown) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((_, rej) => { rejectStaleGet = rej }),
      )
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')

      rejectStaleGet(makeHttpError(503))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Não foi possível consultar o estado atual')
      expect(wrapper.text()).not.toContain('Consultar estado atual')
      expect(resolveSpy).toHaveBeenCalledTimes(2)
    })

    it('R12.2-05 — GET antigo com DTO inválido não exibe erro nem substitui estado confirmado', async () => {
      setAdminSession()
      mockCatalogs()
      const listSpy = vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' })]),
      )

      let resolveStaleGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveStaleGet = r }),
      )
      vi.spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce(makeReport({ id: 42, status: 'RESOLVED' }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      resolveStaleGet({ id: 999, status: 'OPEN' } as unknown as LostReport)
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(wrapper.text()).not.toContain('Não foi possível validar o estado atual')

      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await flushPromises()
      expect(listSpy).toHaveBeenCalledTimes(2)
    })

    it('R12.2-06 — checkingRecovery é liberado quando novo POST inicia e GET antigo não limpa loading de GET novo', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))

      let resolveFirstGet!: (val: LostReport) => void
      let resolveSecondGet!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById')
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveFirstGet = r }))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveSecondGet = r }))

      vi.spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockRejectedValueOnce(makeHttpError(500))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      // 1o GET em andamento -> loading ativo
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()
      expect(findConsultVBtn(wrapper)?.props('loading')).toBe(true)

      // 2o POST inicia (e falha com 500, reexibindo botão Consultar estado atual)
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      // checkingRecovery foi limpo pela invalidação da recuperação antiga (não herda loading preso)
      expect(findConsultVBtn(wrapper)?.props('loading')).toBe(false)

      // Inicia 2o GET legítimo -> loading ativo pelo 2o GET
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()
      expect(findConsultVBtn(wrapper)?.props('loading')).toBe(true)

      // 1o GET antigo termina tardiamente -> NÃO deve limpar loading do 2o GET
      resolveFirstGet(makeReport({ id: 42, status: 'OPEN' }))
      await flushPromises()
      expect(findConsultVBtn(wrapper)?.props('loading')).toBe(true)

      resolveSecondGet(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')
    })

    it('R12.2-07 — cancelar confirmação de novo POST preserva GET de recuperação em andamento', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42, status: 'OPEN' })]))

      let resolveRecovery!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveRecovery = r }),
      )
      const resolveSpy = vi.spyOn(adminLostReportService, 'resolve').mockRejectedValueOnce(makeHttpError(500))
      vi.spyOn(useUiStore(), 'confirm')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()

      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      // Usuário abre confirmação de nova tentativa e cancela -> 0 POSTs extras
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(1)

      // Recuperação anteriormente iniciada permanece válida e aplica RESOLVED
      resolveRecovery(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()

      expect(wrapper.text()).toContain('Resolvido')
      expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
    })

    it('R12.2-08 & R12.2-09 — nova recuperação após HTTP 409 permanece válida e GET antigo não sobrescreve seu resultado nem loading', async () => {
      // R12.2-08: GET A antigo termina antes de GET B (409)
      {
        setAdminSession()
        mockCatalogs()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
          makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
        )
        let resolveStaleA!: (val: LostReport) => void
        let resolveConflictB!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById')
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveStaleA = r }))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveConflictB = r }))

        const resolveSpy = vi
          .spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockRejectedValueOnce(makeHttpError(409))
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()

        // POST B retorna 409 e inicia GET B de recuperação
        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        // GET A antigo retorna OPEN -> descartado; GET B ainda em andamento
        resolveStaleA(makeReport({ id: 42, status: 'OPEN' }))
        await flushPromises()

        resolveConflictB(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(wrapper.text()).toContain('Resolvido')
        expect(resolveSpy).toHaveBeenCalledTimes(2)
        expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()
        wrapper.unmount()
      }

      // R12.2-09: GET B (409) termina primeiro com RESOLVED e GET A antigo termina depois com OPEN
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        setAdminSession()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
          makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
        )
        let resolveStaleA!: (val: LostReport) => void
        let resolveConflictB!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById')
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveStaleA = r }))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolveConflictB = r }))

        vi.spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockRejectedValueOnce(makeHttpError(409))
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        // GET B conclui primeiro
        resolveConflictB(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()
        expect(wrapper.text()).toContain('Resolvido')
        expect(wrapper.text()).toContain('Este relato já havia sido resolvido anteriormente.')

        // GET A conclui depois com OPEN -> não reverte nem sobrescreve mensagem
        resolveStaleA(makeReport({ id: 42, status: 'OPEN' }))
        await flushPromises()

        const card42Text = wrapper
          .findAllComponents({ name: 'VCard' })
          .find((c) => c.text().includes('Relato #42'))!
          .text()
        expect(card42Text).toContain('Resolvido')
        expect(card42Text).not.toContain('Aberto')
        expect(getResolveButtonForReport(wrapper, 42)).toBeUndefined()
        expect(wrapper.text()).toContain('Este relato já havia sido resolvido anteriormente.')
        expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()
        wrapper.unmount()
      }
    })

    it('R12.2-10 — GET antigo terminando durante POST pendente não aplica dados nem libera resolving prematuramente', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )

      let resolveStaleA!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((r) => { resolveStaleA = r }),
      )
      let resolvePostB!: (val: LostReport) => void
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePostB = r }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      // POST B inicia e fica pendente
      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeDefined()

      // GET A resolve com CANCELLED enquanto POST B está em andamento -> descartado e resolving continua ativo
      resolveStaleA(makeReport({ id: 42, status: 'CANCELLED' }))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Cancelado')
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeDefined()

      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(2)

      resolvePostB(makeReport({ id: 42, status: 'RESOLVED' }))
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')
      expect(getResolveButtonForReport(wrapper, 43)!.attributes('disabled')).toBeUndefined()
    })

    it('R12.2-11 — novo POST em outro relato (#43) invalida recuperação antiga pendente de #42', async () => {
      setAdminSession()
      mockCatalogs()
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(
        makePage([makeReport({ id: 42, status: 'OPEN' }), makeReport({ id: 43, status: 'OPEN' })]),
      )

      let rejectStale42!: (err: unknown) => void
      vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
        () => new Promise<LostReport>((_, rej) => { rejectStale42 = rej }),
      )
      let resolvePost43!: (val: LostReport) => void
      vi.spyOn(adminLostReportService, 'resolve')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePost43 = r }))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      await getResolveButtonForReport(wrapper, 42)!.trigger('click')
      await flushPromises()
      await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
      await nextTick()

      // Novo POST para #43 inicia e fica pendente
      await getResolveButtonForReport(wrapper, 43)!.trigger('click')
      await flushPromises()
      expect(getResolveButtonForReport(wrapper, 42)!.attributes('disabled')).toBeDefined()

      // GET antigo de #42 falha com 503 durante POST de #43 -> erro de #42 descartado e loading de #43 preservado
      rejectStale42(makeHttpError(503))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Não foi possível consultar o estado atual')
      expect(getResolveButtonForReport(wrapper, 42)!.attributes('disabled')).toBeDefined()

      resolvePost43(makeReport({ id: 43, status: 'RESOLVED' }))
      await flushPromises()
      expect(wrapper.text()).toContain('Resolvido')
      expect(getResolveButtonForReport(wrapper, 42)!.attributes('disabled')).toBeUndefined()
    })

    it('R12.2-12, R12.2-13, R12.2-14, R12.2-15 & R12.2-16 — logout, troca de conta, nova generation, perda de papel e desmontagem durante corrida isolam estado', async () => {
      // R12.2-12: logout durante corrida GET A + POST B
      {
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-a')
        mockCatalogs()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([makeReport({ id: 42 })]))
        let resolveStaleGet!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
          () => new Promise<LostReport>((r) => { resolveStaleGet = r }),
        )
        let resolvePost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValue(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()
        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        auth.logout()
        await nextTick()
        resolveStaleGet(makeReport({ id: 42, status: 'OPEN' }))
        resolvePost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }

      // R12.2-13 & R12.2-14: troca de conta e mesmo JWT com nova sessionGeneration durante corrida
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'same-jwt')
        let resolveRecoveryA!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
          () => new Promise<LostReport>((r) => { resolveRecoveryA = r }),
        )
        let resolvePostB!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePostB = r }))
        vi.spyOn(adminLostReportService, 'list')
          .mockResolvedValueOnce(makePage([makeReport({ id: 42, status: 'OPEN' })]))
          .mockResolvedValueOnce(makePage([makeReport({ id: 99, status: 'OPEN' })]))
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()

        auth.sessionGeneration += 1
        auth.user = makeUser({ id: 20, role: 'SUPERADMIN' })
        await flushPromises()

        await getResolveButtonForReport(wrapper, 99)!.trigger('click')
        await flushPromises()
        expect(getResolveButtonForReport(wrapper, 99)!.attributes('disabled')).toBeDefined()

        resolveRecoveryA(makeReport({ id: 42, status: 'OPEN' }))
        await flushPromises()
        expect(wrapper.text()).not.toContain('#42')
        expect(getResolveButtonForReport(wrapper, 99)!.attributes('disabled')).toBeDefined()

        resolvePostB(makeReport({ id: 99, status: 'RESOLVED' }))
        await flushPromises()
        expect(wrapper.text()).toContain('Resolvido')
        wrapper.unmount()
      }

      // R12.2-15: perda de papel ADMIN -> USER durante corrida
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-role')
        vi.spyOn(adminLostReportService, 'list').mockResolvedValueOnce(makePage([makeReport({ id: 42 })]))
        let resolveStaleGet!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
          () => new Promise<LostReport>((r) => { resolveStaleGet = r }),
        )
        let resolvePost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValue(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()
        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        auth.user = makeUser({ id: 10, role: 'USER' })
        await flushPromises()
        resolveStaleGet(makeReport({ id: 42, status: 'OPEN' }))
        resolvePost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('#42')
        wrapper.unmount()
      }

      // R12.2-16: desmontagem com GET e POST pendentes
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        mockCatalogs()
        setAdminSession()
        vi.spyOn(adminLostReportService, 'list').mockResolvedValueOnce(makePage([makeReport({ id: 42 })]))
        let resolveStaleGet!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'getById').mockImplementationOnce(
          () => new Promise<LostReport>((r) => { resolveStaleGet = r }),
        )
        let resolvePost!: (val: LostReport) => void
        vi.spyOn(adminLostReportService, 'resolve')
          .mockRejectedValueOnce(makeHttpError(500))
          .mockImplementationOnce(() => new Promise<LostReport>((r) => { resolvePost = r }))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValue(true)
        const snackSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()
        await findButton(wrapper, 'Consultar estado atual')!.trigger('click')
        await nextTick()
        await getResolveButtonForReport(wrapper, 42)!.trigger('click')
        await flushPromises()

        wrapper.unmount()
        resolveStaleGet(makeReport({ id: 42, status: 'OPEN' }))
        resolvePost(makeReport({ id: 42, status: 'RESOLVED' }))
        await flushPromises()

        expect(snackSpy).not.toHaveBeenCalled()
      }
    })
  })

  describe('Etapa 17 — R17-CONF-01: preservação de confirmação global externa', () => {
    it('R17-CONF-01 — resolução de relato não substitui diálogo global externo já aberto e volta a funcionar após liberação', async () => {
      setAdminSession()
      mockCatalogs()
      const report42 = makeReport({ id: 42, status: 'OPEN' })
      vi.spyOn(adminLostReportService, 'list').mockResolvedValue(makePage([report42]))
      const resolveSpy = vi
        .spyOn(adminLostReportService, 'resolve')
        .mockResolvedValue(makeReport({ id: 42, status: 'RESOLVED' }))

      const { wrapper } = await mountView()
      await flushPromises()

      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Fluxo concorrente em andamento.',
      })
      const externalResolver = ui.confirmDialog.resolve
      let settled = false
      void externalPromise.then(() => {
        settled = true
      })

      const card = wrapper
        .findAllComponents({ name: 'VCard' })
        .find((c) => c.text().includes('Relato #42'))
      const resolveBtn = card?.findAll('button').find((b) => b.text().includes('Resolver perda'))
      await resolveBtn!.trigger('click')
      await flushPromises()

      expect(ui.confirmDialog.resolve).toBe(externalResolver)
      expect(ui.confirmDialog.title).toBe('Confirmação externa')
      expect(resolveSpy).not.toHaveBeenCalled()

      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(false)
      await flushPromises()
      expect(settled).toBe(true)

      await resolveBtn!.trigger('click')
      await flushPromises()
      expect(ui.confirmDialog.title).toBe('Resolver relato de perda?')
      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(resolveSpy).toHaveBeenCalledWith(42)
    })
  })
})
