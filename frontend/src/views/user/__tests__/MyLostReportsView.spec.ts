import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import MyLostReportsView from '../MyLostReportsView.vue'
import { vuetify } from '@/theme'
import { lostReportService } from '@/services/lostReport.service'
import { useAuthStore } from '@/stores/authStore'
import type { LostReport, User } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  name: 'Ana Beatriz',
  email: 'ana@ufc.br',
  phone: '(88) 99999-0000',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 1,
  userId: 1,
  categoryId: 2,
  buildingId: 4,
  confirmedItemId: null,
  description: 'Fones de ouvido brancos',
  lossDate: '2026-10-23',
  status: 'OPEN',
  createdAt: '2026-10-24T10:00:00.000Z',
  ...overrides,
})

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

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/minhas-perdas',
        name: 'my-lost-reports',
        component: { template: '<div />' },
      },
      {
        path: '/minhas-perdas/nova',
        name: 'new-lost-report',
        component: { template: '<div data-test="new-lost-report-route" />' },
      },
      {
        path: '/minhas-perdas/:id',
        name: 'lost-report-detail',
        component: { template: '<div data-test="detail-route" />' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'fallback-stub',
        component: { template: '<div />' },
      },
    ],
  })
}

function mountView(customRouter?: Router) {
  const testRouter = customRouter ?? createTestRouter()
  return mount(MyLostReportsView, {
    global: {
      plugins: [vuetify, testRouter],
    },
  })
}

describe('MyLostReportsView (Etapa 03 — Listagem de Minhas perdas)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('L01 — ao montar autenticada, chama lostReportService.mine() e não exibe texto "Em construção"', async () => {
    setAuthenticatedSession()
    const mineSpy = vi.spyOn(lostReportService, 'mine').mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(mineSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('Em construção')
  })

  it('L03 — exibe LoadingOverlay enquanto pendente e oculta ao concluir', async () => {
    setAuthenticatedSession()
    let resolveMine!: (value: LostReport[]) => void
    vi.spyOn(lostReportService, 'mine').mockImplementation(
      () =>
        new Promise<LostReport[]>((resolve) => {
          resolveMine = resolve
        }),
    )

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('.loading-overlay').exists()).toBe(true)

    resolveMine([makeReport()])
    await flushPromises()

    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
    expect(wrapper.text()).toContain('Fones de ouvido brancos')
  })

  it('L04 — renderiza lista de LostReportCard com os dados reais da API', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 11, description: 'Carregador USB-C', categoryId: 7, buildingId: 2, status: 'OPEN' }),
      makeReport({ id: 12, description: 'Guarda-chuva preto', categoryId: 8, buildingId: null, status: 'RESOLVED' }),
    ])

    const wrapper = mountView()
    await flushPromises()

    const cards = wrapper.findAllComponents({ name: 'LostReportCard' })
    expect(cards).toHaveLength(2)
    expect(wrapper.text()).toContain('Carregador USB-C')
    expect(wrapper.text()).toContain('Categoria #7')
    expect(wrapper.text()).toContain('Prédio #2')
    expect(wrapper.text()).toContain('Aberta')
    expect(wrapper.text()).toContain('Guarda-chuva preto')
    expect(wrapper.text()).toContain('Qualquer prédio')
    expect(wrapper.text()).toContain('Resolvida')
  })

  it('L05 — exibe EmptyState quando GET retorna array vazio e não exibe lista ou erro', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Ocorreu um erro inesperado.')
  })

  it('L06 — exibe ErrorAlert genérico quando GET retorna HTTP 503 sem expor error.details interno', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockRejectedValue(
      makeBackendError('Falha ao consultar perdas no servidor.', 503),
    )

    const wrapper = mountView()
    await flushPromises()

    const alert = wrapper.findComponent({ name: 'ErrorAlert' })
    expect(alert.exists()).toBe(true)
    expect(wrapper.text()).toContain('Não foi possível carregar suas perdas. Tente novamente.')
    expect(wrapper.text()).not.toContain('Falha ao consultar perdas no servidor.')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  it('trata resposta malformada (não-array) como erro recuperável e não como lista vazia', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue({ items: [] } as unknown as LostReport[])

    const wrapper = mountView()
    await flushPromises()

    const alert = wrapper.findComponent({ name: 'ErrorAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('error')).toBe('Não foi possível carregar suas perdas. Tente novamente.')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  it('L07 — botão "Tentar novamente" refaz GET, remove ErrorAlert e exibe os dados quando recupera', async () => {
    setAuthenticatedSession()
    const mineSpy = vi
      .spyOn(lostReportService, 'mine')
      .mockRejectedValueOnce(makeBackendError('Erro temporário', 400))
      .mockResolvedValueOnce([makeReport({ id: 20, description: 'Chave do carro' })])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Erro temporário')

    const retryButton = wrapper.findAll('button').find((btn) => btn.text().includes('Tentar novamente'))
    expect(retryButton).toBeDefined()
    await retryButton!.trigger('click')
    await flushPromises()

    expect(mineSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Chave do carro')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('L12 — ignora resposta atrasada após logout e não exibe dados da sessão encerrada', async () => {
    const auth = setAuthenticatedSession({ id: 1 }, 'token-a')
    let resolveMine!: (value: LostReport[]) => void
    vi.spyOn(lostReportService, 'mine').mockImplementation(
      () =>
        new Promise<LostReport[]>((resolve) => {
          resolveMine = resolve
        }),
    )

    const wrapper = mountView()
    await nextTick()

    auth.logout()
    await nextTick()

    resolveMine([makeReport({ id: 99, description: 'Documento sigiloso A' })])
    await flushPromises()

    expect(wrapper.text()).not.toContain('Documento sigiloso A')
    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
  })

  it('L13 — ignora resposta atrasada do usuário A após troca de conta para usuário B', async () => {
    setAuthenticatedSession({ id: 1, email: 'a@ufc.br' }, 'token-a')
    let resolveA!: (value: LostReport[]) => void
    let resolveB!: (value: LostReport[]) => void

    const mineSpy = vi
      .spyOn(lostReportService, 'mine')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveB = resolve
          }),
      )

    const wrapper = mountView()
    await nextTick()

    setAuthenticatedSession({ id: 2, email: 'b@ufc.br' }, 'token-b')
    await flushPromises()

    resolveB([makeReport({ id: 2, userId: 2, description: 'Item exclusivo B' })])
    await flushPromises()

    resolveA([makeReport({ id: 1, userId: 1, description: 'Item sigiloso A' })])
    await flushPromises()

    expect(mineSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Item exclusivo B')
    expect(wrapper.text()).not.toContain('Item sigiloso A')
  })

  it('L14 — ao trocar de conta, limpa imediatamente os cards antigos antes do novo GET resolver', async () => {
    setAuthenticatedSession({ id: 1, email: 'a@ufc.br' }, 'token-a')
    let resolveB!: (value: LostReport[]) => void

    vi.spyOn(lostReportService, 'mine')
      .mockResolvedValueOnce([makeReport({ id: 1, userId: 1, description: 'Carteira do usuário A' })])
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveB = resolve
          }),
      )

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Carteira do usuário A')

    setAuthenticatedSession({ id: 2, email: 'b@ufc.br' }, 'token-b')
    await nextTick()

    expect(wrapper.text()).not.toContain('Carteira do usuário A')
    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)

    resolveB([makeReport({ id: 2, userId: 2, description: 'Notebook do usuário B' })])
    await flushPromises()
    expect(wrapper.text()).toContain('Notebook do usuário B')
  })

  it('L15 — erro atrasado de requisição antiga não sobrescreve lista válida mais recente', async () => {
    setAuthenticatedSession({ id: 1 }, 'token-a')
    let rejectOld!: (err: unknown) => void
    let resolveNew!: (value: LostReport[]) => void

    vi.spyOn(lostReportService, 'mine')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((_, reject) => {
            rejectOld = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveNew = resolve
          }),
      )

    const wrapper = mountView()
    await nextTick()

    setAuthenticatedSession({ id: 2 }, 'token-b')
    await flushPromises()

    resolveNew([makeReport({ id: 5, userId: 2, description: 'Óculos do usuário B' })])
    await flushPromises()

    rejectOld(makeBackendError('Erro obsoleto da sessão A'))
    await flushPromises()

    expect(wrapper.text()).toContain('Óculos do usuário B')
    expect(wrapper.text()).not.toContain('Erro obsoleto da sessão A')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('L16 — resposta atrasada após desmontagem é descartada com segurança', async () => {
    setAuthenticatedSession()
    let resolveMine!: (value: LostReport[]) => void
    vi.spyOn(lostReportService, 'mine').mockImplementation(
      () =>
        new Promise<LostReport[]>((resolve) => {
          resolveMine = resolve
        }),
    )

    const wrapper = mountView()
    await nextTick()
    wrapper.unmount()

    resolveMine([makeReport({ id: 44, description: 'Após desmontagem' })])
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
  })

  it('L17 — múltiplos cliques em "Tentar novamente" mantêm apenas a resposta da última tentativa', async () => {
    setAuthenticatedSession()
    let rejectFirst!: (err: unknown) => void
    let resolveSecond!: (value: LostReport[]) => void
    let resolveThird!: (value: LostReport[]) => void

    vi.spyOn(lostReportService, 'mine')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((_, reject) => {
            rejectFirst = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveSecond = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport[]>((resolve) => {
            resolveThird = resolve
          }),
      )

    const wrapper = mountView()
    await nextTick()

    rejectFirst(makeBackendError('Erro inicial'))
    await flushPromises()

    const retryButton = wrapper.findAll('button').find((btn) => btn.text().includes('Tentar novamente'))!
    const firstRetryClick = retryButton.trigger('click')
    const secondRetryClick = retryButton.trigger('click')
    await Promise.all([firstRetryClick, secondRetryClick])
    await nextTick()

    resolveThird([makeReport({ id: 3, description: 'Resposta mais recente' })])
    await flushPromises()

    resolveSecond([makeReport({ id: 2, description: 'Resposta intermediária obsoleta' })])
    await flushPromises()

    expect(wrapper.text()).toContain('Resposta mais recente')
    expect(wrapper.text()).not.toContain('Resposta intermediária obsoleta')
  })

  it('L18 — ao recarregar com mesma rota e usuário reautenticado no store, exibe dados da nova sessão', async () => {
    setAuthenticatedSession({ id: 1 }, 'token-1')
    vi.spyOn(lostReportService, 'mine')
      .mockResolvedValueOnce([makeReport({ id: 1, description: 'Perda 1' })])
      .mockResolvedValueOnce([makeReport({ id: 2, description: 'Perda 2' })])

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Perda 1')

    setAuthenticatedSession({ id: 2, email: 'novo@ufc.br' }, 'token-2')
    await flushPromises()

    expect(wrapper.text()).toContain('Perda 2')
    expect(wrapper.text()).not.toContain('Perda 1')
  })
})

describe('MyLostReportsView (Etapa 03.1 — Alertas, erros 5xx e validação do DTO)', () => {
  const genericError = 'Não foi possível carregar suas perdas. Tente novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('C01 — durante carregamento pendente, ErrorAlert não existe na árvore e nenhum erro ou card aparece', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockImplementation(() => new Promise(() => {}))

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('.loading-overlay').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Ocorreu um erro inesperado.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
  })

  it('C02 — após carregar registros válidos, cards aparecem e ErrorAlert não existe', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 1, description: 'Agenda escolar verde' }),
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(1)
    expect(wrapper.text()).toContain('Agenda escolar verde')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Ocorreu um erro inesperado.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
  })

  it('C03 — em lista vazia ([]), EmptyState aparece e ErrorAlert não existe na árvore', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Ocorreu um erro inesperado.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
  })

  it('C04 — em erro real, ErrorAlert existe na árvore com mensagem adequada e botão Tentar novamente funcional', async () => {
    setAuthenticatedSession()
    const mineSpy = vi
      .spyOn(lostReportService, 'mine')
      .mockRejectedValueOnce(makeBackendError('Filtro de status inválido.', 400))
      .mockResolvedValueOnce([makeReport()])

    const wrapper = mountView()
    await flushPromises()

    const alert = wrapper.findComponent({ name: 'ErrorAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Filtro de status inválido.')

    await alert.find('button').trigger('click')
    await flushPromises()
    expect(mineSpy).toHaveBeenCalledTimes(2)
  })

  it('C05 — após clicar em Tentar novamente e recuperar com sucesso, ErrorAlert deixa de existir no DOM', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine')
      .mockRejectedValueOnce(makeBackendError('Falha interna 500', 500))
      .mockResolvedValueOnce([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)

    await wrapper.findComponent({ name: 'ErrorAlert' }).find('button').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain(genericError)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('C06 — HTTP 400 com error.details válido exibe a descrição retornada pelo backend', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockRejectedValue(
      makeBackendError('Parâmetro de consulta inválido.', 400),
    )

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Parâmetro de consulta inválido.')
  })

  it('C07 — HTTP 500 com detalhe interno oculta details internos, exibe mensagem genérica e mantém sessão', async () => {
    const auth = setAuthenticatedSession({ id: 10 }, 'token-estavel')
    vi.spyOn(lostReportService, 'mine').mockRejectedValue(
      makeBackendError('SQLITE_ERROR: database failure at internal path', 500),
    )

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain(genericError)
    expect(wrapper.text()).not.toContain('SQLITE_ERROR')
    expect(wrapper.text()).not.toContain('internal path')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
    expect(auth.token).toBe('token-estavel')
    expect(auth.user?.id).toBe(10)
  })

  it('C08 — HTTP 503 com error.details oculta detalhe interno e exibe apenas mensagem genérica', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockRejectedValue(
      makeBackendError('Upstream SQLite worker timed out', 503),
    )

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)
    expect(wrapper.text()).not.toContain('Upstream SQLite')
  })

  it('C09 — erro de rede sem response exibe mensagem genérica, preserva sessão e permite retry', async () => {
    const auth = setAuthenticatedSession({ id: 5 }, 'token-rede')
    const networkErr = new AxiosError('Network Error', 'ERR_NETWORK')
    const mineSpy = vi
      .spyOn(lostReportService, 'mine')
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce([makeReport({ id: 77, description: 'Após reconexão' })])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain(genericError)
    expect(auth.token).toBe('token-rede')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)

    await wrapper.findComponent({ name: 'ErrorAlert' }).find('button').trigger('click')
    await flushPromises()

    expect(mineSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Após reconexão')
  })

  it('C10 — resposta de erro malformada (details ausente, vazio ou não-string) usa mensagem genérica sem lançar exceção', async () => {
    setAuthenticatedSession()
    const malformedCases = [
      { error: {} },
      { error: { code: 400, details: '   ' } },
      { error: { code: 400, details: 12345 } },
      { error: { code: 400, details: null } },
      'plain text body',
    ]

    for (const data of malformedCases) {
      vi.restoreAllMocks()
      const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
      const err = new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, null, {
        status: 400,
        statusText: 'Bad Request',
        headers: new AxiosHeaders(),
        config,
        data,
      })
      vi.spyOn(lostReportService, 'mine').mockRejectedValueOnce(err)

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      expect(wrapper.text()).toContain(genericError)
      wrapper.unmount()
    }
  })

  it('C11 — HTTP 401 não provoca logout duplicado dentro da MyLostReportsView (preserva responsabilidade do interceptor)', async () => {
    const auth = setAuthenticatedSession({ id: 1 }, 'token-a')
    const logoutSpy = vi.spyOn(auth, 'logout')
    vi.spyOn(lostReportService, 'mine').mockRejectedValue(
      makeBackendError('Token expirado ou inválido.', 401),
    )

    const wrapper = mountView()
    await flushPromises()

    expect(logoutSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Token expirado ou inválido.')
  })

  it('C12 — rejeita registro sem categoryId como resposta inválida', async () => {
    setAuthenticatedSession()
    const { categoryId: _omitted, ...withoutCategory } = makeReport()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      withoutCategory as unknown as LostReport,
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)
  })

  it('C13 — rejeita registro sem propriedade buildingId explícita', async () => {
    setAuthenticatedSession()
    const { buildingId: _omitted, ...withoutBuildingKey } = makeReport()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      withoutBuildingKey as unknown as LostReport,
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)
  })

  it('C14 — aceita registro válido com buildingId: null e exibe "Qualquer prédio"', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([makeReport({ buildingId: null })])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(1)
    expect(wrapper.text()).toContain('Qualquer prédio')
  })

  it('C15 — rejeita registro com status ausente ou fora do conjunto OPEN/RESOLVED/CANCELLED', async () => {
    setAuthenticatedSession()
    const invalidStatuses = [
      { ...makeReport(), status: 'PENDING' },
      { ...makeReport(), status: '' },
      (({ status: _s, ...rest }) => rest)(makeReport()),
    ]

    for (const invalidReport of invalidStatuses) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'mine').mockResolvedValue([
        invalidReport as unknown as LostReport,
      ])

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('C16 — rejeita identificadores inválidos e descrição vazia; aceita confirmedItemId null ou inteiro positivo', async () => {
    setAuthenticatedSession()
    const invalidPayloads = [
      { ...makeReport(), id: 0 },
      { ...makeReport(), id: -3 },
      { ...makeReport(), id: 1.5 },
      { ...makeReport(), id: Number.NaN },
      { ...makeReport(), userId: '1' },
      { ...makeReport(), categoryId: 0 },
      { ...makeReport(), buildingId: -1 },
      { ...makeReport(), buildingId: 2.2 },
      { ...makeReport(), confirmedItemId: 0 },
      (({ confirmedItemId: _c, ...rest }) => rest)(makeReport()),
      { ...makeReport(), description: '   ' },
    ]

    for (const invalid of invalidPayloads) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'mine').mockResolvedValue([invalid as unknown as LostReport])

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      wrapper.unmount()
    }

    vi.restoreAllMocks()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 1, confirmedItemId: null }),
      makeReport({ id: 2, confirmedItemId: 42, description: 'Com item confirmado' }),
    ])
    const validWrapper = mountView()
    await flushPromises()
    expect(validWrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(2)
    expect(validWrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('C17 — rejeita lossDate inválida ou fora de YYYY-MM-DD e preserva data válida sem deslocamento', async () => {
    setAuthenticatedSession()
    for (const badDate of ['2026-02-30', '23/10/2026', '2026-10-23T00:00:00Z', 'invalid', '']) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'mine').mockResolvedValue([
        { ...makeReport(), lossDate: badDate } as unknown as LostReport,
      ])

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      wrapper.unmount()
    }

    vi.restoreAllMocks()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([makeReport({ lossDate: '2026-10-23' })])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('23/10/2026')
    expect(wrapper.text()).not.toContain('22/10/2026')
  })

  it('C18 — rejeita createdAt ausente ou inválido e aceita registro válido sem updatedAt', async () => {
    setAuthenticatedSession()
    const invalidCreatedAt = [
      (({ createdAt: _c, ...rest }) => rest)(makeReport()),
      { ...makeReport(), createdAt: '' },
      { ...makeReport(), createdAt: 'data-invalida' },
    ]

    for (const invalid of invalidCreatedAt) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'mine').mockResolvedValue([invalid as unknown as LostReport])

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('C19 — rejeita array parcialmente corrompido sem renderizar o item válido ou tratar como lista vazia', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 1, description: 'Primeiro relato válido' }),
      { id: 2, description: 'Segundo incompleto', lossDate: '2026-10-23' } as unknown as LostReport,
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Primeiro relato válido')
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)
  })

  it('C20 — aceita [] como lista vazia válida sem exibir erro', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('C21 — aceita array completo com os três status e combinações válidas de buildingId e confirmedItemId', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 1, status: 'OPEN', buildingId: 1, confirmedItemId: null, description: 'Item aberto' }),
      makeReport({ id: 2, status: 'RESOLVED', buildingId: null, confirmedItemId: 9, description: 'Item resolvido' }),
      makeReport({ id: 3, status: 'CANCELLED', buildingId: 4, confirmedItemId: null, description: 'Item cancelado' }),
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'LostReportCard' })).toHaveLength(3)
    expect(wrapper.text()).toContain('Aberta')
    expect(wrapper.text()).toContain('Resolvida')
    expect(wrapper.text()).toContain('Cancelada')
    expect(wrapper.text()).toContain('Prédio #1')
    expect(wrapper.text()).toContain('Qualquer prédio')
  })

  it('D20 — cada card exibe "Ver detalhes" navegando para lost-report-detail com o ID correto e sem botões de escrita', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 11, description: 'Chaveiro UFC' }),
      makeReport({ id: 29, description: 'Calculadora científica' }),
    ])

    const testRouter = createTestRouter()
    await testRouter.push('/minhas-perdas')
    await testRouter.isReady()

    const wrapper = mountView(testRouter)
    await flushPromises()

    const cards = wrapper.findAllComponents({ name: 'LostReportCard' })
    expect(cards).toHaveLength(2)

    const detailLinks = cards.map((card) =>
      card.findAll('a, button').find((el) => el.text().includes('Ver detalhes')),
    )
    expect(detailLinks[0]).toBeDefined()
    expect(detailLinks[1]).toBeDefined()
    expect(detailLinks[0]!.attributes('href')).toBe('/minhas-perdas/11')
    expect(detailLinks[1]!.attributes('href')).toBe('/minhas-perdas/29')

    const text = wrapper.text()
    expect(text).not.toContain('Editar')
    expect(text).not.toContain('Cancelar')
    expect(text).not.toContain('Confirmar')
    expect(text).not.toContain('Nova perda')

    await detailLinks[0]!.trigger('click')
    await flushPromises()

    expect(testRouter.currentRoute.value.name).toBe('lost-report-detail')
    expect(testRouter.currentRoute.value.params.id).toBe('11')
  })

  it('N30 — botão "Registrar perda" no PageHeader navega pela rota nomeada new-lost-report', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([makeReport({ id: 1 })])

    const testRouter = createTestRouter()
    await testRouter.push('/minhas-perdas')
    await testRouter.isReady()

    const wrapper = mountView(testRouter)
    await flushPromises()

    const newBtn = wrapper.findAll('a, button').find((el) => el.text().includes('Registrar perda'))
    expect(newBtn).toBeDefined()
    expect(newBtn!.attributes('href')).toBe('/minhas-perdas/nova')

    await newBtn!.trigger('click')
    await flushPromises()

    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('N31 — EmptyState oferece acesso ao registro pela rota nomeada new-lost-report', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'mine').mockResolvedValue([])

    const testRouter = createTestRouter()
    await testRouter.push('/minhas-perdas')
    await testRouter.isReady()

    const wrapper = mountView(testRouter)
    await flushPromises()

    const emptyState = wrapper.findComponent({ name: 'EmptyState' })
    expect(emptyState.exists()).toBe(true)

    const newAction = emptyState.findAll('a, button').find((el) => el.text().includes('Registrar perda'))
    expect(newAction).toBeDefined()
    expect(newAction!.attributes('href')).toBe('/minhas-perdas/nova')

    await newAction!.trigger('click')
    await flushPromises()

    expect(testRouter.currentRoute.value.name).toBe('new-lost-report')
  })

  it('U13.2-04 — filtro local por status filtra relatos exibidos sem novas chamadas GET e permite limpar para mostrar todos', async () => {
    setAuthenticatedSession()
    const mineSpy = vi.spyOn(lostReportService, 'mine').mockResolvedValue([
      makeReport({ id: 1, description: 'Chaveiro azul aberto', status: 'OPEN' }),
      makeReport({ id: 2, description: 'Garrafa térmica resolvida', status: 'RESOLVED' }),
    ])

    const testRouter = createTestRouter()
    await testRouter.push('/minhas-perdas')
    await testRouter.isReady()

    const wrapper = mountView(testRouter)
    await flushPromises()

    expect(wrapper.text()).toContain('Chaveiro azul aberto')
    expect(wrapper.text()).toContain('Garrafa térmica resolvida')

    const resolvedBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Resolvidas')
    expect(resolvedBtn).toBeDefined()
    await resolvedBtn!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Garrafa térmica resolvida')
    expect(wrapper.text()).not.toContain('Chaveiro azul aberto')
    expect(mineSpy).toHaveBeenCalledTimes(1)

    const cancelledBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Canceladas')
    expect(cancelledBtn).toBeDefined()
    await cancelledBtn!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Nenhuma perda encontrada para este filtro.')
    const showAllBtn = wrapper.findAll('button').find((b) => b.text().includes('Mostrar todas'))
    expect(showAllBtn).toBeDefined()
    await showAllBtn!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Chaveiro azul aberto')
    expect(wrapper.text()).toContain('Garrafa térmica resolvida')
    expect(mineSpy).toHaveBeenCalledTimes(1)
  })
})
