import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import LostReportDetailView from '../LostReportDetailView.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import DatePickerField from '@/components/form/DatePickerField.vue'
import { vuetify } from '@/theme'
import { lostReportService } from '@/services/lostReport.service'
import { categoryService } from '@/services/category.service'
import { buildingService } from '@/services/building.service'
import { useAuthStore } from '@/stores/authStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDateTime } from '@/utils/format'
import type { Building, Category, LostReport, Page, PublicCatalogItem, User } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 3,
  name: 'Ana Beatriz',
  email: 'ana@ufc.br',
  phone: '(88) 99999-0000',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 12,
  userId: 3,
  categoryId: 5,
  buildingId: 2,
  confirmedItemId: null,
  description: 'Mochila preta com cadernos e documentos pessoais.',
  lossDate: '2026-10-23',
  status: 'OPEN',
  createdAt: '2026-10-24T12:00:00.000Z',
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

function createDetailRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/minhas-perdas',
        name: 'my-lost-reports',
        component: { template: '<div data-test="my-lost-reports" />' },
      },
      {
        path: '/minhas-perdas/:id',
        name: 'lost-report-detail',
        component: LostReportDetailView,
      },
      {
        path: '/itens/:id',
        name: 'item-detail',
        component: { template: '<div data-test="item-detail" />' },
      },
    ],
  })
}

async function mountDetail(path = '/minhas-perdas/12') {
  const testRouter = createDetailRouter()
  await testRouter.push(path)
  await testRouter.isReady()

  const wrapper = mount(LostReportDetailView, {
    global: {
      plugins: [vuetify, testRouter],
    },
  })

  return { wrapper, testRouter }
}

function defaultEmptyCatalogPage(): Page<PublicCatalogItem> {
  return {
    data: [],
    pagination: { total: 0, page: 1, per_page: 12, total_pages: 0 },
  }
}

describe('LostReportDetailView (Etapa 04 — Detalhes da perda)', () => {
  const genericError = 'Não foi possível carregar os detalhes da perda. Tente novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(defaultEmptyCatalogPage())
  })

  it('D01 — ao abrir /minhas-perdas/12 autenticado, chama getById(12) uma única vez e não executa mine ou escrita', async () => {
    setAuthenticatedSession()
    const getByIdSpy = vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const mineSpy = vi.spyOn(lostReportService, 'mine')
    const createSpy = vi.spyOn(lostReportService, 'create')
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(getByIdSpy).toHaveBeenCalledTimes(1)
    expect(getByIdSpy).toHaveBeenCalledWith(12)
    expect(mineSpy).not.toHaveBeenCalled()
    expect(createSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Em construção')
  })

  it('D03 — exibe LoadingOverlay enquanto GET está pendente, sem dados antigos ou ErrorAlert falso', async () => {
    setAuthenticatedSession()
    let resolveDetail!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'getById').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveDetail = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    expect(wrapper.find('.loading-overlay').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Mochila preta')

    resolveDetail(makeReport())
    await flushPromises()

    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mochila preta com cadernos e documentos pessoais.')
  })

  it('D04 — exibe ID, descrição completa sem truncamento, categoria, prédio, data da perda, registro, status e item confirmado', async () => {
    setAuthenticatedSession()
    const longDescription =
      'Mochila preta de nylon com três compartimentos, chaveiro azul da UFC,\ncaderno de Estruturas de Dados, estojo cinza e carregador USB-C.'
    const report = makeReport({
      id: 12,
      categoryId: 5,
      buildingId: 2,
      confirmedItemId: 25,
      description: longDescription,
      lossDate: '2026-10-23',
      status: 'OPEN',
      createdAt: '2026-10-24T12:00:00.000Z',
    })
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(report)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('#12')
    expect(text).toContain(longDescription)
    expect(wrapper.find('.lost-report-description').exists()).toBe(false)
    expect(text).toContain('Categoria #5')
    expect(text).toContain('Prédio #2')
    expect(text).toContain('23/10/2026')
    expect(text).toContain(formatDateTime('2026-10-24T12:00:00.000Z'))
    expect(text).toContain('Aberta')
    expect(text).toContain('Item confirmado: #25')
    expect(wrapper.findComponent({ name: 'StatusChip' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('D04b — exibe os nomes cadastrados de categoria e prédio no detalhe quando o catálogo está disponível', async () => {
    setAuthenticatedSession()
    useCategoriesStore().syncCatalog(defaultCategories)
    useBuildingsStore().syncCatalog(defaultBuildings)
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ categoryId: 5, buildingId: 2 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain(defaultCategories.find((c) => c.id === 5)!.name)
    expect(text).toContain('Bloco I')
    expect(text).not.toContain('Categoria #5')
    expect(text).not.toContain('Prédio #2')
  })

  it('não exibe confirmação falsa quando confirmedItemId é null e não expõe confirmação de sugestão', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ confirmedItemId: null }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('Item confirmado')
    expect(text).not.toContain('Confirmar')
  })

  it('D05 — quando buildingId é null, exibe "Qualquer prédio" sem "null" ou "undefined"', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ buildingId: null }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Qualquer prédio')
    expect(text).not.toContain('Prédio #null')
    expect(text).not.toContain('undefined')
  })

  it('D06 — renderiza StatusChip para OPEN, RESOLVED e CANCELLED', async () => {
    setAuthenticatedSession()
    const expectations: Array<{ status: LostReport['status']; label: string }> = [
      { status: 'OPEN', label: 'Aberta' },
      { status: 'RESOLVED', label: 'Resolvida' },
      { status: 'CANCELLED', label: 'Cancelada' },
    ]

    for (const item of expectations) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: item.status }))
      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      expect(wrapper.findComponent({ name: 'StatusChip' }).props('status')).toBe(item.status)
      expect(wrapper.text()).toContain(item.label)
      wrapper.unmount()
    }
  })

  it('D07 — formata lossDate 2026-10-23 como 23/10/2026 sem deslocamento de fuso horário', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ lossDate: '2026-10-23' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(wrapper.text()).toContain('23/10/2026')
    expect(wrapper.text()).not.toContain('22/10/2026')
  })

  it('D08 — HTTP 404 exibe "Relato de perda não encontrado.", oculta dados antigos e oferece retorno à listagem', async () => {
    setAuthenticatedSession()
    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, description: 'Relato anterior A' }))
      .mockRejectedValueOnce(makeBackendError('Outro usuário não autorizado ou inexistente', 404))

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    expect(wrapper.text()).toContain('Relato anterior A')

    await testRouter.push('/minhas-perdas/99')
    await flushPromises()

    expect(getByIdSpy).toHaveBeenCalledWith(99)
    expect(wrapper.text()).toContain('Relato de perda não encontrado.')
    expect(wrapper.text()).not.toContain('Relato anterior A')
    expect(wrapper.text()).not.toContain('Outro usuário')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

    const backControl = wrapper.findAll('a, button').find((el) => el.text().includes('Voltar para Minhas perdas'))
    expect(backControl).toBeDefined()
    await backControl!.trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.name).toBe('my-lost-reports')
  })

  it('D09 — IDs inválidos na rota não disparam GET e exibem estado de ID inválido com retorno à listagem', async () => {
    setAuthenticatedSession()
    const invalidIds = ['0', '-1', 'abc', '1.5', '1e3', '01', '9007199254740992']

    for (const badId of invalidIds) {
      vi.restoreAllMocks()
      const getByIdSpy = vi.spyOn(lostReportService, 'getById')

      const { wrapper, testRouter } = await mountDetail(`/minhas-perdas/${badId}`)
      await flushPromises()

      expect(getByIdSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Identificador de perda inválido.')
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)

      const backControl = wrapper.findAll('a, button').find((el) => el.text().includes('Voltar para Minhas perdas'))
      expect(backControl).toBeDefined()
      await backControl!.trigger('click')
      await flushPromises()
      expect(testRouter.currentRoute.value.name).toBe('my-lost-reports')

      wrapper.unmount()
    }
  })

  it('D10 — HTTP 500 e 503 exibem mensagem genérica sem detalhes internos, preservam sessão e permitem retry', async () => {
    for (const status of [500, 503]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession({ id: 3 }, 'token-estavel')
      vi.spyOn(lostReportService, 'getById').mockRejectedValue(
        makeBackendError('SQLITE_ERROR: internal database trace', status),
      )

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      const alert = wrapper.findComponent({ name: 'ErrorAlert' })
      expect(alert.exists()).toBe(true)
      expect(wrapper.text()).toContain(genericError)
      expect(wrapper.text()).not.toContain('SQLITE_ERROR')
      expect(auth.token).toBe('token-estavel')
      expect(auth.user?.id).toBe(3)
      wrapper.unmount()
    }
  })

  it('D11 — botão "Tentar novamente" refaz GET, remove ErrorAlert e renderiza detalhes ao recuperar', async () => {
    setAuthenticatedSession()
    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
      .mockResolvedValueOnce(makeReport({ id: 12, description: 'Guarda-chuva azul recuperado' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const alert = wrapper.findComponent({ name: 'ErrorAlert' })
    expect(alert.exists()).toBe(true)
    expect(wrapper.text()).toContain(genericError)

    await alert.find('button').trigger('click')
    await flushPromises()

    expect(getByIdSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Guarda-chuva azul recuperado')
  })

  it('D12 — rejeita DTO malformado ou userId incompatível falhando fechado sem renderizar dados parciais', async () => {
    setAuthenticatedSession({ id: 3 })
    const malformedPayloads = [
      (({ description: _d, ...rest }) => rest)(makeReport()),
      { ...makeReport(), status: 'INVALID' },
      (({ buildingId: _b, ...rest }) => rest)(makeReport()),
      { ...makeReport(), lossDate: '2026-02-30' },
      { ...makeReport(), createdAt: 'not-a-date' },
      { ...makeReport(), userId: 999 },
    ]

    for (const badPayload of malformedPayloads) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(badPayload as unknown as LostReport)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      expect(wrapper.text()).toContain(genericError)
      expect(wrapper.text()).not.toContain('Categoria #5')
      wrapper.unmount()
    }
  })

  it('D13 — ignora resposta atrasada após logout e mantém sessão encerrada sem expor detalhes privados', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
    let resolveGet!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'getById').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveGet = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    auth.logout()
    await nextTick()

    resolveGet(makeReport({ description: 'Documento confidencial da sessão encerrada' }))
    await flushPromises()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(wrapper.text()).not.toContain('Documento confidencial da sessão encerrada')
  })

  it('D14 — troca de conta de A para B descarta resposta atrasada de A e exibe apenas B', async () => {
    setAuthenticatedSession({ id: 3, email: 'a@ufc.br' }, 'token-a')
    let resolveA!: (value: LostReport) => void
    let resolveB!: (value: LostReport) => void

    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolveA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolveB = resolve
          }),
      )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    setAuthenticatedSession({ id: 9, email: 'b@ufc.br' }, 'token-b')
    await flushPromises()

    resolveB(makeReport({ id: 12, userId: 9, description: 'Pertence ao usuário B' }))
    await flushPromises()

    resolveA(makeReport({ id: 12, userId: 3, description: 'Sigilo do usuário A' }))
    await flushPromises()

    expect(getByIdSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Pertence ao usuário B')
    expect(wrapper.text()).not.toContain('Sigilo do usuário A')
  })

  it('D15 — mesmo JWT e userId em nova sessionGeneration descarta resposta da geração anterior', async () => {
    const auth = setAuthenticatedSession({ id: 3, email: 'a@ufc.br' }, 'mesmo-jwt')
    let resolveGen1!: (value: LostReport) => void
    let resolveGen2!: (value: LostReport) => void

    vi.spyOn(lostReportService, 'getById')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolveGen1 = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolveGen2 = resolve
          }),
      )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    auth.logout()
    await nextTick()
    setAuthenticatedSession({ id: 3, email: 'a@ufc.br' }, 'mesmo-jwt')
    await flushPromises()

    resolveGen2(makeReport({ description: 'Carregamento da geração atual' }))
    await flushPromises()

    resolveGen1(makeReport({ description: 'Resposta obsoleta com mesmo JWT' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Carregamento da geração atual')
    expect(wrapper.text()).not.toContain('Resposta obsoleta com mesmo JWT')
  })

  it('D16 — mudança de parâmetro /minhas-perdas/12 -> /minhas-perdas/13 limpa imediatamente 12 e ignora resposta atrasada de 12', async () => {
    setAuthenticatedSession()
    let resolve12!: (value: LostReport) => void
    let resolve13!: (value: LostReport) => void

    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve12 = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve13 = resolve
          }),
      )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await nextTick()

    expect(getByIdSpy).toHaveBeenNthCalledWith(1, 12)
    expect(getByIdSpy).toHaveBeenNthCalledWith(2, 13)
    expect(wrapper.text()).not.toContain('Relato 12 obsoleto')

    resolve13(makeReport({ id: 13, description: 'Relato 13 atual' }))
    await flushPromises()

    resolve12(makeReport({ id: 12, description: 'Relato 12 obsoleto' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Relato 13 atual')
    expect(wrapper.text()).not.toContain('Relato 12 obsoleto')
  })

  it('D17 — mudanças sucessivas 12 -> 13 -> 14 com respostas fora de ordem (13, 12, 14) exibem apenas 14', async () => {
    setAuthenticatedSession()
    let resolve12!: (value: LostReport) => void
    let resolve13!: (value: LostReport) => void
    let resolve14!: (value: LostReport) => void

    vi.spyOn(lostReportService, 'getById')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve12 = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve13 = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve14 = resolve
          }),
      )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await nextTick()

    await testRouter.push('/minhas-perdas/14')
    await nextTick()

    resolve13(makeReport({ id: 13, description: 'Relato 13' }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Relato 13')

    resolve12(makeReport({ id: 12, description: 'Relato 12' }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Relato 12')

    resolve14(makeReport({ id: 14, description: 'Relato 14 final' }))
    await flushPromises()
    expect(wrapper.text()).toContain('Relato 14 final')
    expect(wrapper.text()).not.toContain('Relato 13')
    expect(wrapper.text()).not.toContain('Relato 12')
  })

  it('D18 — erro atrasado do ID 12 não contamina a rota atual de ID 13', async () => {
    setAuthenticatedSession()
    let reject12!: (err: unknown) => void
    let resolve13!: (value: LostReport) => void

    vi.spyOn(lostReportService, 'getById')
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((_, reject) => {
            reject12 = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolve13 = resolve
          }),
      )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await nextTick()

    resolve13(makeReport({ id: 13, description: 'Relato 13 íntegro' }))
    await flushPromises()

    reject12(makeBackendError('Falha obsoleta do ID 12', 404))
    await flushPromises()

    expect(wrapper.text()).toContain('Relato 13 íntegro')
    expect(wrapper.text()).not.toContain('Relato de perda não encontrado.')
    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
  })

  it('D19 — desmontagem durante GET descarta resolução ou rejeição atrasada com segurança', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-ok')
    let resolvePending!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'getById').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePending = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()
    wrapper.unmount()

    resolvePending(makeReport({ description: 'Após desmontagem' }))
    await flushPromises()
    expect(auth.token).toBe('token-ok')

    vi.restoreAllMocks()
    let rejectPending!: (err: unknown) => void
    vi.spyOn(lostReportService, 'getById').mockImplementationOnce(
      () =>
        new Promise<LostReport>((_, reject) => {
          rejectPending = reject
        }),
    )

    const { wrapper: wrapper2 } = await mountDetail('/minhas-perdas/12')
    await nextTick()
    wrapper2.unmount()

    rejectPending(makeBackendError('Erro após unmount', 500))
    await flushPromises()
    expect(auth.token).toBe('token-ok')
  })

  it('D21 — ação "Voltar para Minhas perdas" navega para a rota nomeada my-lost-reports sem depender de histórico', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const backControl = wrapper.findAll('a, button').find((el) => el.text().includes('Voltar para Minhas perdas'))
    expect(backControl).toBeDefined()
    expect(backControl!.attributes('href')).toBe('/minhas-perdas')

    await backControl!.trigger('click')
    await flushPromises()

    expect(testRouter.currentRoute.value.name).toBe('my-lost-reports')
  })
})

const defaultCategories: Category[] = [
  { id: 2, name: 'Acessórios', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 5, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 8, name: 'Eletrônicos', createdAt: '2026-01-01T00:00:00.000Z' },
]

const defaultBuildings: Building[] = [
  {
    id: 2,
    name: 'Bloco I',
    address: 'Campus',
    pickupPoint: 'Recepção',
    serviceHours: '08h-17h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Biblioteca',
    address: 'Campus',
    pickupPoint: 'Balcão',
    serviceHours: '08h-20h',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

function mockCatalogs() {
  vi.spyOn(categoryService, 'list').mockResolvedValue(defaultCategories)
  vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
}

async function openEditMode(wrapper: Awaited<ReturnType<typeof mountDetail>>['wrapper']) {
  const editButton = wrapper.findAll('button').find((btn) => btn.text().includes('Editar perda'))
  expect(editButton).toBeDefined()
  await editButton!.trigger('click')
  await flushPromises()
}

describe('LostReportDetailView (Etapa 05 — Edição de perda própria)', () => {
  const genericSaveError = 'Não foi possível salvar as alterações. Tente novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(defaultEmptyCatalogPage())
  })

  it('E01 — exibe botão "Editar perda" apenas quando status é OPEN e nunca em RESOLVED ou CANCELLED', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const openMount = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    expect(openMount.wrapper.findAll('button').some((b) => b.text().includes('Editar perda'))).toBe(true)
    openMount.wrapper.unmount()

    for (const status of ['RESOLVED', 'CANCELLED'] as const) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status }))
      const mounted = await mountDetail('/minhas-perdas/12')
      await flushPromises()
      expect(mounted.wrapper.findAll('button').some((b) => b.text().includes('Editar perda'))).toBe(false)
      mounted.wrapper.unmount()
    }
  })

  it('E02 — ao entrar em modo de edição, inicializa CategorySelect, BuildingSelect, descrição e data com valores confirmados', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(
      makeReport({
        categoryId: 5,
        buildingId: 2,
        description: 'Mochila original confirmada',
        lossDate: '2026-10-23',
      }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)
    expect(wrapper.findComponent(BuildingSelect).props('modelValue')).toBe(2)
    expect(wrapper.findComponent(DatePickerField).props('modelValue')).toBe('2026-10-23')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Mochila original confirmada')
  })

  it('E03 — editar apenas a descrição envia somente { description } no PATCH', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ description: 'Nova descrição válida atualizada' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('  Nova descrição válida atualizada  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, {
      description: 'Nova descrição válida atualizada',
    })
  })

  it('E04 — editar apenas categoryId envia somente { categoryId } sem buildingId, description ou lossDate', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ categoryId: 5 }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ categoryId: 8 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 8)
    await nextTick()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, { categoryId: 8 })
  })

  it('E05 — alterar prédio envia somente { buildingId } com novo ID selecionado', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ buildingId: 2 }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ buildingId: 3 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.findComponent(BuildingSelect).vm.$emit('update:modelValue', 3)
    await nextTick()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, { buildingId: 3 })
  })

  it('E06 — limpar prédio quando era preenchido envia explicitamente { buildingId: null }', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ buildingId: 3 }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ buildingId: null }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.findComponent(BuildingSelect).vm.$emit('update:modelValue', null)
    await nextTick()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, { buildingId: null })
  })

  it('E07 — quando buildingId já é null e permanece null, não inclui buildingId no PATCH', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ buildingId: null }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ buildingId: null, description: 'Nova descrição com prédio nulo' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Nova descrição com prédio nulo')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'Nova descrição com prédio nulo' })
    expect('buildingId' in updateSpy.mock.calls[0][1]).toBe(false)
  })

  it('E08 — alterar data via DatePickerField inclusive com Date no fim do dia envia YYYY-MM-DD sem deslocamento de fuso', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ lossDate: '2026-10-23' }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ lossDate: '2026-11-05' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

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

      const localLateDate = new Date(2026, 10, 5, 23, 30, 0)
      await dateField.findComponent({ name: 'VDatePicker' }).vm.$emit('update:modelValue', localLateDate)
      await nextTick()
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(updateSpy).toHaveBeenCalledTimes(1)
      expect(updateSpy).toHaveBeenCalledWith(12, { lossDate: '2026-11-05' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('E09 — alterar múltiplos campos envia todos os modificados com tipos corretos', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const updatedReport = makeReport({
      categoryId: 8,
      buildingId: 3,
      description: 'Descrição completa modificada com sucesso',
      lossDate: '2026-11-10',
    })
    const updateSpy = vi.spyOn(lostReportService, 'update').mockResolvedValue(updatedReport)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 8)
    await wrapper.findComponent(BuildingSelect).vm.$emit('update:modelValue', 3)
    await wrapper.find('textarea').setValue('Descrição completa modificada com sucesso')
    await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', '2026-11-10')
    await nextTick()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith(12, {
      categoryId: 8,
      buildingId: 3,
      description: 'Descrição completa modificada com sucesso',
      lossDate: '2026-11-10',
    })
  })

  it('E10 — não envia PATCH nem exibe snackbar quando não há alteração após trim()', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(
      makeReport({ description: 'Mochila preta com cadernos e documentos pessoais.' }),
    )
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('   Mochila preta com cadernos e documentos pessoais.   ')
    await nextTick()

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Salvar alterações'))
    expect(saveBtn?.attributes('disabled')).toBeDefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(ui.snackbar.show).toBe(false)
  })

  it('E11 — valida limites de descrição após trim (9 inválido, 10 válido, 2000 válido, 2001 inválido, espaços inválido)', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const updateSpy = vi.spyOn(lostReportService, 'update').mockImplementation(async (_id, payload) =>
      makeReport({ description: payload.description ?? 'fallback description' }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    for (const invalidDesc of ['   ', '123456789', `  ${'a'.repeat(9)}  `, 'a'.repeat(2001)]) {
      await wrapper.find('textarea').setValue(invalidDesc)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(updateSpy).not.toHaveBeenCalled()
    }

    await wrapper.find('textarea').setValue(`  ${'x'.repeat(10)}  `)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'x'.repeat(10) })

    await openEditMode(wrapper)
    await wrapper.find('textarea').setValue('y'.repeat(2000))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'y'.repeat(2000) })
  })

  it('E12 — aceita 29/02 em ano bissexto (2024-02-29) e bloqueia datas inexistentes ou inválidas (30/02, 29/02 não bissexto)', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ lossDate: '2026-10-23' }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ lossDate: '2024-02-29' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    for (const badDate of ['2026-02-30', '2025-02-29', '29/02/2024', 'invalid', '']) {
      await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', badDate)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(updateSpy).not.toHaveBeenCalled()
    }

    await wrapper.findComponent(DatePickerField).vm.$emit('update:modelValue', '2024-02-29')
    await nextTick()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledWith(12, { lossDate: '2024-02-29' })
  })

  it('E13 — bloqueia categoria ausente, ID inseguro ou categoria inexistente nas opções carregadas', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ categoryId: 5 }))
    const updateSpy = vi.spyOn(lostReportService, 'update')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    for (const badCat of [null, 0, -1, 1.5, 9007199254740992, 9999]) {
      await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', badCat)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(updateSpy).not.toHaveBeenCalled()
    }
  })

  it('E14 — quando falha carregamento de categorias/prédios, preserva IDs originais, permite retry e permite editar descrição sem enviar campos comprometidos', async () => {
    setAuthenticatedSession()
    vi.spyOn(categoryService, 'list').mockRejectedValueOnce(new Error('Falha categorias')).mockRejectedValueOnce(new Error('Falha categorias')).mockResolvedValue(defaultCategories)
    vi.spyOn(buildingService, 'list').mockRejectedValueOnce(new Error('Falha prédios')).mockRejectedValueOnce(new Error('Falha prédios')).mockResolvedValue(defaultBuildings)
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ categoryId: 5, buildingId: 2 }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ categoryId: 5, buildingId: 2, description: 'Descrição atualizada sem seletor' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)
    expect(wrapper.findComponent(BuildingSelect).props('modelValue')).toBe(2)
    expect(wrapper.text()).toContain('Não foi possível carregar todas as opções')

    await wrapper.find('textarea').setValue('Descrição atualizada sem seletor')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'Descrição atualizada sem seletor' })
  })

  it('E15 — ao salvar com sucesso, atualiza relato confirmado, sai da edição e exibe snackbar exatamente uma vez', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    vi.spyOn(lostReportService, 'update').mockResolvedValue(
      makeReport({ description: 'Descrição salva e confirmada no servidor' }),
    )
    const ui = useUiStore()
    const snackSpy = vi.spyOn(ui, 'showSnackbar')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Descrição salva e confirmada no servidor')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Descrição salva e confirmada no servidor')
    expect(snackSpy).toHaveBeenCalledTimes(1)
    expect(snackSpy).toHaveBeenCalledWith('Perda atualizada com sucesso.', 'success')
  })

  it('E16 & E17 — durante PATCH pendente bloqueia dupla submissão em cliques rápidos, não mostra sucesso prematuro e não altera confirmado', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ description: 'Valor antes do salvamento' }))
    let resolvePatch!: (value: LostReport) => void
    const updateSpy = vi.spyOn(lostReportService, 'update').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePatch = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Nova descrição enquanto PATCH está pendente')
    await nextTick()

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Salvar alterações'))!
    await saveBtn.trigger('click')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(saveBtn.attributes('disabled')).toBeDefined()
    expect(ui.snackbar.show).toBe(false)

    resolvePatch(makeReport({ description: 'Confirmada após clique único' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Confirmada após clique único')
    expect(ui.snackbar.show).toBe(true)
  })

  it('E18 — Cancelar edição descarta rascunho local sem disparar HTTP e mantém relato original', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ description: 'Descrição original intocada' }))
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Alteração descartada pelo usuário')
    const cancelEditBtn = wrapper.findAll('button').find((b) => b.text().includes('Cancelar edição'))
    expect(cancelEditBtn).toBeDefined()
    await cancelEditBtn!.trigger('click')
    await nextTick()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Descrição original intocada')
    expect(wrapper.text()).not.toContain('Alteração descartada pelo usuário')
  })

  it('E19 — HTTP 400 preserva rascunho, exibe error.details público e permite corrigir e salvar', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockRejectedValueOnce(makeBackendError('Categoria com ID 8 não encontrada.', 400))
      .mockResolvedValueOnce(makeReport({ description: 'Descrição corrigida após erro 400' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Rascunho preservado no 400')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Categoria com ID 8 não encontrada.')
    expect(wrapper.find('form').exists()).toBe(true)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Rascunho preservado no 400')

    await wrapper.find('textarea').setValue('Descrição corrigida após erro 400')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Descrição corrigida após erro 400')
  })

  it('E20 — HTTP 409 informa conflito, recarrega o relato e desabilita edição quando status não é mais OPEN', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN', description: 'Original aberta' }))
      .mockResolvedValueOnce(makeReport({ status: 'CANCELLED', description: 'Original aberta' }))
    vi.spyOn(lostReportService, 'update').mockRejectedValueOnce(
      makeBackendError('Somente relatos com status OPEN podem ser editados.', 409),
    )
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Tentativa quando já estava cancelada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(getByIdSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Somente relatos com status OPEN podem ser editados.')
    expect(wrapper.text()).toContain('Cancelada')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Editar perda'))).toBe(false)
  })

  it('E21 — HTTP 404 no PATCH exibe estado de não encontrado sem confirmar rascunho nem vazar dono', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    vi.spyOn(lostReportService, 'update').mockRejectedValueOnce(
      makeBackendError('Relato de outro usuário não acessível', 404),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Tentativa quando relato sumiu')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Relato de perda não encontrado.')
    expect(wrapper.text()).not.toContain('Relato de outro usuário')
    expect(wrapper.text()).not.toContain('Tentativa quando relato sumiu')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('E22 & E23 — HTTP 500 e falha de rede ocultam detalhes internos, preservam rascunho e não fazem retry automático', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockRejectedValueOnce(makeBackendError('SQLITE_BUSY: database locked', 500))
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Rascunho mantido após 500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain(genericSaveError)
    expect(wrapper.text()).not.toContain('SQLITE_BUSY')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Rascunho mantido após 500')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(genericSaveError)
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('E24 — logout durante PATCH pendente descarta resposta antiga sem reabrir formulário nem exibir snackbar', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    let resolvePatch!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'update').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePatch = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Edição antes do logout')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await nextTick()

    resolvePatch(makeReport({ description: 'Resposta tardia após logout' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).not.toContain('Resposta tardia após logout')
    expect(auth.token).toBeNull()
  })

  it('E25 & E26 — troca de conta ou mesma JWT em nova sessionGeneration descarta resposta de PATCH antigo', async () => {
    const auth = setAuthenticatedSession({ id: 3, email: 'a@ufc.br' }, 'jwt-compartilhado')
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, description: 'Relato A' }))
      .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, description: 'Relato nova geração' }))

    let resolveOldPatch!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'update').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveOldPatch = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Alteração da geração 1')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await nextTick()
    setAuthenticatedSession({ id: 3, email: 'a@ufc.br' }, 'jwt-compartilhado')
    await flushPromises()

    resolveOldPatch(makeReport({ id: 12, userId: 3, description: 'Sobrescrita indevida da geração 1' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Relato nova geração')
    expect(wrapper.text()).not.toContain('Sobrescrita indevida da geração 1')
  })

  it('E27 — navegar de /minhas-perdas/12 para /minhas-perdas/13 durante PATCH de 12 descarta rascunho e resposta tardia', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, description: 'Relato 12 original' }))
      .mockResolvedValueOnce(makeReport({ id: 13, description: 'Relato 13 atual' }))

    let resolvePatch12!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'update').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePatch12 = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Rascunho de 12 em andamento')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await flushPromises()

    resolvePatch12(makeReport({ id: 12, description: 'Resposta tardia do PATCH 12' }))
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Relato 13 atual')
    expect(wrapper.text()).not.toContain('Resposta tardia do PATCH 12')
  })

  it('E28 — desmontagem durante PATCH pendente não dispara snackbar nem efeitos tardios', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport())
    let resolvePatch!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'update').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePatch = resolve
        }),
    )
    const ui = useUiStore()

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Edição antes de desmontar')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    wrapper.unmount()
    resolvePatch(makeReport({ description: 'Pós desmontagem' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
  })

  it('E29 — resposta HTTP 200 malformada (id, userId ou status inválido) não confirma edição nem exibe snackbar', async () => {
    setAuthenticatedSession({ id: 3 })
    mockCatalogs()
    const badResponses = [
      { ...makeReport(), id: 99 },
      { ...makeReport(), userId: 777 },
      { ...makeReport(), status: 'BROKEN' },
      (({ description: _d, ...rest }) => rest)(makeReport()),
    ]

    for (const badResponse of badResponses) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      mockCatalogs()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ description: 'Descrição segura original' }))
      vi.spyOn(lostReportService, 'update').mockResolvedValue(badResponse as unknown as LostReport)
      const ui = useUiStore()

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()
      await openEditMode(wrapper)

      await wrapper.find('textarea').setValue('Tentativa com resposta corrompida')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain(genericSaveError)
      expect(wrapper.find('form').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('E30 — payload enviado no PATCH nunca inclui campos administrativos ou legados', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ confirmedItemId: 25 }))
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ confirmedItemId: 25, description: 'Somente campos permitidos' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Somente campos permitidos')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const sentPayload = updateSpy.mock.calls[0][1] as Record<string, unknown>
    for (const forbidden of ['id', 'userId', 'status', 'createdAt', 'confirmedItemId', 'title', 'lostDate', 'updatedAt']) {
      expect(Object.prototype.hasOwnProperty.call(sentPayload, forbidden)).toBe(false)
    }
  })
})

function findButton(wrapper: { findAll: (sel: string) => any[] }, label: string) {
  return wrapper.findAll('button').find((btn) => btn.text().includes(label))
}

describe('LostReportDetailView (Etapa 06 — Cancelamento confirmado de perda própria)', () => {
  const genericCancelError = 'Não foi possível cancelar a perda. Verifique o estado do relato e tente novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(defaultEmptyCatalogPage())
  })

  it('K01 — botão "Cancelar perda" aparece apenas quando status é OPEN e fora do modo de edição', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const openMount = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(findButton(openMount.wrapper, 'Cancelar perda')).toBeDefined()
    await openEditMode(openMount.wrapper)
    expect(findButton(openMount.wrapper, 'Cancelar perda')).toBeUndefined()
    openMount.wrapper.unmount()

    for (const status of ['RESOLVED', 'CANCELLED'] as const) {
      vi.restoreAllMocks()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status }))
      const mounted = await mountDetail('/minhas-perdas/12')
      await flushPromises()
      expect(findButton(mounted.wrapper, 'Cancelar perda')).toBeUndefined()
      mounted.wrapper.unmount()
    }
  })

  it('K02 — clicar em "Cancelar perda" abre ConfirmDialog destrutivo sem enviar POST antecipadamente', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    const ui = useUiStore()
    const confirmSpy = vi.spyOn(ui, 'confirm')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const cancelBtn = findButton(wrapper, 'Cancelar perda')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    await nextTick()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0].danger).toBe(true)
    expect(ui.confirmDialog.show).toBe(true)
    expect(ui.confirmDialog.danger).toBe(true)
    expect(cancelSpy).not.toHaveBeenCalled()

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
      const dialogWrapper = mount(ConfirmDialog, { global: { plugins: [vuetify] } })
      await nextTick()
      expect(ui.confirmDialog.confirmText).toContain('cancelar')
      expect(ui.confirmDialog.cancelText).toContain('Manter perda')
      dialogWrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
      ui.confirmDialog.resolve(false)
    }
  })

  it('K03 — escolher "Manter perda" não envia POST, preserva status OPEN e não exibe snackbar', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(false)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Aberta')
    expect(ui.snackbar.show).toBe(false)
  })

  it('K04 — confirmar chama lostReportService.cancel(12) uma única vez, sem payload extra e sem chamar update()', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const cancelSpy = vi
      .spyOn(lostReportService, 'cancel')
      .mockResolvedValue(makeReport({ status: 'CANCELLED' }))
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith(12)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('K06 — sucesso atualiza status para Cancelada, remove botões de escrita, exibe snackbar único e não refaz GET', async () => {
    setAuthenticatedSession()
    const getSpy = vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    vi.spyOn(lostReportService, 'cancel').mockResolvedValue(makeReport({ status: 'CANCELLED' }))
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)
    const snackSpy = vi.spyOn(ui, 'showSnackbar')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    expect(getSpy).toHaveBeenCalledTimes(1)

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Cancelada')
    expect(findButton(wrapper, 'Editar perda')).toBeUndefined()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()
    expect(snackSpy).toHaveBeenCalledTimes(1)
    expect(snackSpy).toHaveBeenCalledWith('Perda cancelada com sucesso.', 'success')
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('K07 — enquanto POST estiver pendente mantém status OPEN e não exibe sucesso antecipadamente', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    let resolveCancel!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'cancel').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('Aberta')
    expect(wrapper.text()).not.toContain('Cancelada')
    expect(ui.snackbar.show).toBe(false)

    resolveCancel(makeReport({ status: 'CANCELLED' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Cancelada')
    expect(ui.snackbar.show).toBe(true)
  })

  it('K08 — dois cliques rápidos em Cancelar perda abrem apenas uma confirmação', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    let resolveConfirm!: (value: boolean) => void
    const ui = useUiStore()
    const confirmSpy = vi.spyOn(ui, 'confirm').mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const cancelBtn = findButton(wrapper, 'Cancelar perda')!
    void cancelBtn.trigger('click')
    void cancelBtn.trigger('click')
    await nextTick()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).not.toHaveBeenCalled()

    resolveConfirm(false)
    await flushPromises()
  })

  it('K09 — duplo disparo de confirmação não produz dois POSTs', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    let resolveCancel!: (value: LostReport) => void
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const cancelBtn = findButton(wrapper, 'Cancelar perda')!
    await cancelBtn.trigger('click')
    await nextTick()
    await cancelBtn.trigger('click')
    await nextTick()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    resolveCancel(makeReport({ status: 'CANCELLED' }))
    await flushPromises()
  })

  it('K10 — durante POST pendente bloqueia nova submissão, bloqueia edição e exibe indicador de progresso', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    let resolveCancel!: (value: LostReport) => void
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    const cancelBtn = findButton(wrapper, 'Cancelar perda')!
    const editBtn = findButton(wrapper, 'Editar perda')!
    expect(cancelBtn.attributes('disabled')).toBeDefined()
    expect(editBtn.attributes('disabled')).toBeDefined()
    expect(cancelBtn.find('.v-progress-circular').exists() || wrapper.find('.v-progress-circular').exists()).toBe(true)

    await editBtn.trigger('click')
    expect(wrapper.find('form').exists()).toBe(false)

    await cancelBtn.trigger('click')
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    resolveCancel(makeReport({ status: 'CANCELLED' }))
    await flushPromises()
  })

  it('K11 — HTTP 404 no POST exibe "Relato de perda não encontrado." sem vazar dono ou sucesso', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    vi.spyOn(lostReportService, 'cancel').mockRejectedValue(makeBackendError('Relato de perda não encontrado.', 404))
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Relato de perda não encontrado.')
    expect(wrapper.text()).toContain('Voltar para Minhas perdas')
    expect(ui.snackbar.show).toBe(false)
  })

  it('K12 — HTTP 409 com relato RESOLVED no servidor exibe conflito, recarrega via GET e remove botões', async () => {
    setAuthenticatedSession()
    const getSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN' }))
      .mockResolvedValueOnce(makeReport({ status: 'RESOLVED', confirmedItemId: 40 }))
    vi.spyOn(lostReportService, 'cancel').mockRejectedValue(
      makeBackendError('Somente relatos com status OPEN podem ser cancelados.', 409),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(getSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Somente relatos com status OPEN podem ser cancelados.')
    expect(wrapper.text()).toContain('Resolvida')
    expect(findButton(wrapper, 'Editar perda')).toBeUndefined()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()
    expect(ui.snackbar.show).toBe(false)
  })

  it('K13 — HTTP 409 quando GET de recuperação retorna CANCELLED não envia segundo POST nem exibe snackbar de sucesso', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN' }))
      .mockResolvedValueOnce(makeReport({ status: 'CANCELLED' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockRejectedValue(
      makeBackendError('Somente relatos com status OPEN podem ser cancelados.', 409),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Cancelada')
    expect(ui.snackbar.show).toBe(false)
  })

  it('K14 — HTTP 500 e 503 ocultam detalhes internos, preservam sessão e não fazem retry automático', async () => {
    for (const status of [500, 503]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
      const cancelSpy = vi
        .spyOn(lostReportService, 'cancel')
        .mockRejectedValue(makeBackendError('SQLITE_BUSY internal table lock', status))
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'Cancelar perda')!.trigger('click')
      await flushPromises()

      expect(cancelSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain(genericCancelError)
      expect(wrapper.text()).not.toContain('SQLITE_BUSY')
      expect(ui.snackbar.show).toBe(false)
      expect(auth.token).toBe('token-a')
      wrapper.unmount()
    }
  })

  it('K15 — falha de rede não dispara retry automático e permite recarregar via GET para conferir estado real', async () => {
    setAuthenticatedSession()
    const getSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN' }))
      .mockResolvedValueOnce(makeReport({ status: 'CANCELLED' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockRejectedValue(new Error('Network Error'))
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain(genericCancelError)
    const reloadBtn = findButton(wrapper, 'Recarregar relato')
    expect(reloadBtn).toBeDefined()

    await reloadBtn!.trigger('click')
    await flushPromises()

    expect(getSpy).toHaveBeenCalledTimes(2)
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Cancelada')
    expect(ui.snackbar.show).toBe(false)
  })

  it('K16 — resposta HTTP 200 malformada ou com status incompatível (OPEN/RESOLVED) não confirma cancelamento', async () => {
    const badResponses = [
      null,
      { id: 12, status: 'CANCELLED' },
      makeReport({ status: 'OPEN' }),
      makeReport({ status: 'RESOLVED' }),
    ]

    for (const badResponse of badResponses) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
      vi.spyOn(lostReportService, 'cancel').mockResolvedValue(badResponse as unknown as LostReport)
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'Cancelar perda')!.trigger('click')
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain(genericCancelError)
      expect(wrapper.text()).toContain('Aberta')
      wrapper.unmount()
    }
  })

  it('K17 & K18 — resposta HTTP 200 com userId ou id divergente é descartada sem confirmar', async () => {
    for (const badResponse of [
      makeReport({ id: 12, userId: 999, status: 'CANCELLED' }),
      makeReport({ id: 99, userId: 3, status: 'CANCELLED' }),
    ]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
      vi.spyOn(lostReportService, 'cancel').mockResolvedValue(badResponse)
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'Cancelar perda')!.trigger('click')
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain(genericCancelError)
      expect(wrapper.text()).toContain('Aberta')
      wrapper.unmount()
    }
  })

  it('K19 — logout enquanto confirmação está aberta invalida decisão antiga e impede POST', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    let resolveConfirm!: (value: boolean) => void
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()

    auth.logout()
    await flushPromises()

    resolveConfirm(true)
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Mochila preta')
    expect(ui.snackbar.show).toBe(false)
  })

  it('K20 — troca de conta de A para B antes da confirmação impede disparo de POST na sessão B', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
    const reportB = makeReport({ id: 12, userId: 44, description: 'Relato exclusivo conta B', status: 'OPEN' })
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, status: 'OPEN' }))
      .mockResolvedValueOnce(reportB)
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    let resolveConfirm!: (value: boolean) => void
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()

    auth.sessionGeneration += 1
    auth.token = 'token-b'
    auth.user = makeUser({ id: 44, name: 'Conta B' })
    await flushPromises()

    resolveConfirm(true)
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Relato exclusivo conta B')
    expect(wrapper.text()).toContain('Aberta')
  })

  it('K21 — logout durante POST pendente descarta resposta tardia sem snackbar nem restauração privada', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    let resolveCancel!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'cancel').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    auth.logout()
    await flushPromises()

    resolveCancel(makeReport({ status: 'CANCELLED' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).not.toContain('Mochila preta')
  })

  it('K22 — mesmo JWT e userId em nova sessionGeneration descarta resposta de POST antigo', async () => {
    const auth = setAuthenticatedSession({ id: 3 }, 'same-jwt')
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN', description: 'Geração 1' }))
      .mockResolvedValueOnce(makeReport({ status: 'OPEN', description: 'Geração 2 limpa' }))
    let resolveCancel!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'cancel').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    auth.logout()
    await nextTick()
    auth.sessionGeneration += 1
    auth.token = 'same-jwt'
    auth.user = makeUser({ id: 3 })
    await flushPromises()

    resolveCancel(makeReport({ status: 'CANCELLED', description: 'Resposta obsoleta gen 1' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Geração 2 limpa')
    expect(wrapper.text()).toContain('Aberta')
  })

  it('K23 — mudança de rota de 12 para 13 durante confirmação aberta invalida decisão antiga', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', description: 'Relato 12' }))
      .mockResolvedValueOnce(makeReport({ id: 13, status: 'OPEN', description: 'Relato 13 atual' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    let resolveConfirm!: (value: boolean) => void
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await flushPromises()

    resolveConfirm(true)
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Relato 13 atual')
    expect(wrapper.text()).toContain('Aberta')
  })

  it('K24 — mudança de rota de 12 para 13 durante POST pendente ignora resposta tardia de 12', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', description: 'Relato 12' }))
      .mockResolvedValueOnce(makeReport({ id: 13, status: 'OPEN', description: 'Relato 13 atual' }))
    let resolveCancel12!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'cancel').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel12 = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await flushPromises()

    resolveCancel12(makeReport({ id: 12, status: 'CANCELLED' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Relato 13 atual')
    expect(wrapper.text()).toContain('Aberta')
  })

  it('K25 — desmontagem durante confirmação ou POST pendente não dispara snackbar nem efeitos tardios', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN' }))
    let resolveCancel!: (value: LostReport) => void
    vi.spyOn(lostReportService, 'cancel').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()
    await nextTick()

    wrapper.unmount()
    resolveCancel(makeReport({ status: 'CANCELLED' }))
    await flushPromises()

    expect(ui.snackbar.show).toBe(false)
  })

  it('K26 — não executa cancelamento em relatos RESOLVED ou CANCELLED nem se confirmação antiga resolver após transição de estado', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN' }))
      .mockResolvedValueOnce(makeReport({ id: 13, status: 'RESOLVED' }))
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'CANCELLED' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    let resolveConfirm!: (value: boolean) => void
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await nextTick()

    await testRouter.push('/minhas-perdas/13')
    await flushPromises()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()

    await testRouter.push('/minhas-perdas/12')
    await flushPromises()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()

    resolveConfirm(true)
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
  })

  it('K27 — cancelamento altera apenas status para CANCELLED sem exclusão ou navegação para fora da tela', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN', description: 'Item preservado após cancelamento' }))
    vi.spyOn(lostReportService, 'cancel').mockResolvedValue(
      makeReport({ status: 'CANCELLED', description: 'Item preservado após cancelamento' }),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(testRouter.currentRoute.value.fullPath).toBe('/minhas-perdas/12')
    expect(wrapper.text()).toContain('Relato #12')
    expect(wrapper.text()).toContain('Item preservado após cancelamento')
    expect(wrapper.text()).toContain('Cancelada')
  })

  it('K28 — regressão de edição: Cancelar edição apenas descarta rascunho sem chamar cancel() e PATCH parcial permanece intacto', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN', description: 'Texto original' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValue(makeReport({ status: 'OPEN', description: 'Texto salvo parcialmente' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await openEditMode(wrapper)
    await wrapper.find('textarea').setValue('Alteração descartada localmente')
    await findButton(wrapper, 'Cancelar edição')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Texto original')
    expect(findButton(wrapper, 'Editar perda')).toBeDefined()
    expect(findButton(wrapper, 'Cancelar perda')).toBeDefined()

    await openEditMode(wrapper)
    await wrapper.find('textarea').setValue('Texto salvo parcialmente')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'Texto salvo parcialmente' })
  })

  it('K29 — mensagem de validação da descrição fica visível mesmo com "Salvar alterações" desabilitado e some ao corrigir', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ status: 'OPEN', description: 'Descrição válida original' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    await openEditMode(wrapper)

    await wrapper.find('textarea').setValue('Curta')
    await nextTick()

    const saveBtn = findButton(wrapper, 'Salvar alterações')!
    expect(saveBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('A descrição deve conter pelo menos 10 caracteres.')

    await wrapper.find('textarea').setValue('Descrição longa suficientemente válida')
    await nextTick()

    expect(wrapper.text()).not.toContain('A descrição deve conter pelo menos 10 caracteres.')
    expect(findButton(wrapper, 'Salvar alterações')!.attributes('disabled')).toBeUndefined()
  })

  it('K30 — Regressão 06.1: POST /cancel retorna 409 e GET de recuperação retorna 503 mantém conflito, não repete POST/PATCH e permite Recarregar relato via GET', async () => {
    setAuthenticatedSession()
    const getSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN' }))
      .mockRejectedValueOnce(makeBackendError('SQLITE_BUSY temporary lock', 503))
      .mockResolvedValueOnce(makeReport({ status: 'RESOLVED', confirmedItemId: 40 }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockRejectedValue(
      makeBackendError('Somente relatos com status OPEN podem ser cancelados.', 409),
    )
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(getSpy).toHaveBeenCalledTimes(2)
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Somente relatos com status OPEN podem ser cancelados.')
    expect(wrapper.text()).not.toContain('SQLITE_BUSY')

    const reloadBtn = findButton(wrapper, 'Recarregar relato')
    expect(reloadBtn).toBeDefined()

    await reloadBtn!.trigger('click')
    await flushPromises()

    expect(getSpy).toHaveBeenCalledTimes(3)
    expect(getSpy).toHaveBeenLastCalledWith(12)
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Resolvida')
    expect(findButton(wrapper, 'Editar perda')).toBeUndefined()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()
    expect(findButton(wrapper, 'Recarregar relato')).toBeUndefined()
  })

  it('K31 — Regressão 06.1: POST /cancel 409 com falha de rede no GET preserva conflito sem retry automático e descarta reload após troca de rota ou logout', async () => {
    const auth = setAuthenticatedSession()
    let resolveManualGet!: (report: LostReport) => void
    const getSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ status: 'OPEN' }))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolveManualGet = resolve
          }),
      )
      .mockResolvedValueOnce(makeReport({ id: 13, status: 'CANCELLED' }))
    const cancelSpy = vi.spyOn(lostReportService, 'cancel').mockRejectedValue(
      makeBackendError('Somente relatos com status OPEN podem ser cancelados.', 409),
    )
    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledTimes(2)
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).toContain('Somente relatos com status OPEN podem ser cancelados.')

    const reloadBtn = findButton(wrapper, 'Recarregar relato')
    expect(reloadBtn).toBeDefined()

    await reloadBtn!.trigger('click')
    await nextTick()
    expect(getSpy).toHaveBeenCalledTimes(3)

    await testRouter.push('/minhas-perdas/13')
    await flushPromises()

    resolveManualGet(makeReport({ id: 12, status: 'CANCELLED', description: 'Descrição obsoleta do #12' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Relato #13')
    expect(wrapper.text()).not.toContain('Descrição obsoleta do #12')

    auth.logout()
    await flushPromises()
    expect(findButton(wrapper, 'Cancelar perda')).toBeUndefined()
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })
})

const makeCatalogItem = (overrides: Partial<PublicCatalogItem> = {}): PublicCatalogItem => ({
  id: 25,
  title: 'Mochila preta',
  description: 'Mochila encontrada no bloco principal.',
  categoryId: 5,
  buildingId: 2,
  foundLocation: 'Corredor do primeiro andar',
  foundDate: '2026-11-06',
  status: 'AVAILABLE',
  category: { id: 5, name: 'Documentos' },
  building: { id: 2, name: 'Bloco I' },
  photos: [{ id: 8, url: 'https://exemplo.com/foto.jpg' }],
  ...overrides,
})

function makeCatalogPage(
  items: PublicCatalogItem[],
  pagination: Partial<Page<PublicCatalogItem>['pagination']> = {},
): Page<PublicCatalogItem> {
  const perPage = pagination.per_page ?? 12
  const total = pagination.total ?? items.length
  return {
    data: items,
    pagination: {
      total,
      page: pagination.page ?? 1,
      per_page: perPage,
      total_pages: pagination.total_pages ?? (total === 0 ? 0 : Math.ceil(total / perPage)),
    },
  }
}

describe('LostReportDetailView (Etapa 08 — Possíveis correspondências)', () => {
  const genericSuggestionsError =
    'Não foi possível carregar as possíveis correspondências. Tente novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('S01 & S27 & S28 — ao abrir /minhas-perdas/12 diretamente, valida detalhe e consulta catálogo público com categoryId, page 1 e per_page 12', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(
      makeReport({ id: 12, categoryId: 5, buildingId: 2, status: 'OPEN', confirmedItemId: null }),
    )
    const listSpy = vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(
      makeCatalogPage([makeCatalogItem({ id: 25, categoryId: 5, category: { id: 5, name: 'Documentos' } })]),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledWith(12, { page: 1, per_page: 12 })
    expect(wrapper.text()).toContain('Possíveis correspondências')
    expect(wrapper.text()).toContain('Mochila preta')
  })

  it('S02 — enquanto GET de detalhes está pendente, não consulta itemService.list nem vaza dados sem autorização', async () => {
    setAuthenticatedSession({ id: 3 })
    let resolveDetail!: (report: LostReport) => void
    vi.spyOn(lostReportService, 'getById').mockImplementation(
      () =>
        new Promise<LostReport>((resolve) => {
          resolveDetail = resolve
        }),
    )
    const listSpy = vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([]))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await nextTick()

    expect(listSpy).not.toHaveBeenCalled()

    // Se o proprietário do relato divergir, também não consulta sugestões
    resolveDetail(makeReport({ id: 12, userId: 999, categoryId: 5 }))
    await flushPromises()

    expect(listSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('S04, S05, S06, S07, S08, S10 & S11 — renderiza múltiplos cards públicos, placeholder sem foto, datas UTC e modo somente leitura sem score ou ações de escrita', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(
      makeReport({ id: 12, categoryId: 5, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(
      makeCatalogPage([
        makeCatalogItem({
          id: 25,
          title: 'Carteira de couro marrom',
          description: 'Encontrada perto da cantina.',
          foundLocation: 'Cantina central',
          foundDate: '2026-11-06',
          status: 'AVAILABLE',
          photos: [{ id: 1, url: 'https://cdn.ufc.br/carteira.jpg' }],
        }),
        makeCatalogItem({
          id: 26,
          title: 'RG encontrado',
          description: null,
          foundLocation: null,
          foundDate: '2026-11-01',
          status: 'ELIGIBLE',
          photos: [],
        }),
      ]),
    )
    const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const cards = wrapper.findAllComponents({ name: 'SuggestionCard' })
    expect(cards).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('Carteira de couro marrom')
    expect(text).toContain('Encontrada perto da cantina.')
    expect(text).toContain('Cantina central')
    expect(text).toContain('06/11/2026')
    expect(text).toContain('Disponível')

    expect(text).toContain('RG encontrado')
    expect(text).toContain('01/11/2026')
    expect(text).toContain('Elegível à destinação')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Compatibilidade')
    expect(text).toContain('É este!')
    expect(text).not.toContain('Não é meu')
    expect(confirmSpy).not.toHaveBeenCalled()

    const img = cards[0]!.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toContain('Carteira de couro marrom')
    expect(cards[1]!.find('img').exists()).toBe(false)
  })

  it('S12 — ação "Ver detalhes do item" navega via rota nomeada item-detail com ID exato', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(
      makeCatalogPage([makeCatalogItem({ id: 91, categoryId: 5, category: { id: 5, name: 'Documentos' } })]),
    )

    const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const detailLink = wrapper
      .findAll('a, button')
      .find((el) => el.text().includes('Ver detalhes do item'))
    expect(detailLink).toBeDefined()
    expect(detailLink!.attributes('href')).toBe('/itens/91')

    await detailLink!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(testRouter.currentRoute.value.name).toBe('item-detail')
    })
    expect(testRouter.currentRoute.value.params.id).toBe('91')
  })

  it('S13 — catálogo vazio apresenta estado vazio sem ErrorAlert falso', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([], { total: 0, page: 1, total_pages: 0 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Nenhuma correspondência disponível no momento.')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
  })

  it('S14 — durante GET pendente do catálogo, exibe loading de sugestões mantendo detalhes da perda visíveis', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(
      makeReport({ id: 12, categoryId: 5, description: 'Chaveiro prata visível durante carregamento' }),
    )
    let resolveCatalog!: (page: Page<PublicCatalogItem>) => void
    vi.spyOn(lostReportService, 'getSuggestions').mockImplementation(
      () =>
        new Promise<Page<PublicCatalogItem>>((resolve) => {
          resolveCatalog = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(wrapper.text()).toContain('Chaveiro prata visível durante carregamento')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
    expect(wrapper.find('.suggestions-section .v-progress-linear, .suggestions-section .loading-overlay').exists()).toBe(
      true,
    )

    resolveCatalog(makeCatalogPage([makeCatalogItem()]))
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(1)
  })

  it('S15, S16 & S17 — HTTP 500/503 e falha de rede ocultam detalhes internos, preservam sessão e Tentar novamente chama somente GET catálogo', async () => {
    for (const err of [
      makeBackendError('SQLITE_CANTOPEN internal path', 500),
      makeBackendError('Upstream timeout trace', 503),
      new AxiosError('Network Error', 'ERR_NETWORK'),
    ]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession()
      const detailSpy = vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))
      const createSpy = vi.spyOn(lostReportService, 'create')
      const updateSpy = vi.spyOn(lostReportService, 'update')
      const cancelSpy = vi.spyOn(lostReportService, 'cancel')
      const listSpy = vi
        .spyOn(lostReportService, 'getSuggestions')
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ title: 'Caderno recuperado' })]))

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain(genericSuggestionsError)
      expect(text).not.toContain('SQLITE_CANTOPEN')
      expect(text).not.toContain('Upstream timeout trace')
      expect(auth.token).toBe('token-a')

      const retryBtn = findButton(wrapper, 'Tentar novamente')
      expect(retryBtn).toBeDefined()

      await retryBtn!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(detailSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(cancelSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Caderno recuperado')
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('S09, S18 & S19 — rejeita página inteira em payloads malformados, status privados, categoria divergente ou página parcialmente inválida', async () => {
    const validItem = makeCatalogItem({ id: 10, categoryId: 5 })
    const malformedResponses: unknown[] = [
      null,
      'invalid',
      { data: 'not-an-array', pagination: { total: 0, page: 1, per_page: 12, total_pages: 0 } },
      { data: [] },
      { data: [], pagination: { total: -1, page: 1, per_page: 12, total_pages: 0 } },
      { data: [], pagination: { total: 5, page: 1, per_page: 12, total_pages: 99 } },
      makeCatalogPage([makeCatalogItem({ status: 'HANDED_OVER' })]),
      makeCatalogPage([makeCatalogItem({ status: 'DISCARDED' })]),
      makeCatalogPage([makeCatalogItem({ id: 0 })]),
      makeCatalogPage([makeCatalogItem({ categoryId: 9, category: { id: 9, name: 'Outra' } })]),
      makeCatalogPage([makeCatalogItem({ foundDate: '2026-02-30' })]),
      makeCatalogPage([makeCatalogItem({ photos: [{ id: 0, url: '' }] })]),
      makeCatalogPage([validItem, makeCatalogItem({ id: 11, status: 'SOLD', title: 'Vazado' })]),
    ]

    for (const badResponse of malformedResponses) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(badResponse as Page<PublicCatalogItem>)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      expect(wrapper.text()).not.toContain('Vazado')
      expect(wrapper.text()).toContain(genericSuggestionsError)
      wrapper.unmount()
    }
  })

  it('S20, S21 & S23 — paginação, mudança de per_page com reset para página 1 e Atualizar sugestões', async () => {
    setAuthenticatedSession()
    const detailSpy = vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))

    const page1Items = Array.from({ length: 12 }, (_, idx) =>
      makeCatalogItem({ id: idx + 1, title: `Item P1 #${idx + 1}` }),
    )
    const page2Items = Array.from({ length: 12 }, (_, idx) =>
      makeCatalogItem({ id: idx + 13, title: `Item P2 #${idx + 13}` }),
    )
    const page3Items = Array.from({ length: 3 }, (_, idx) =>
      makeCatalogItem({ id: idx + 25, title: `Item P3 #${idx + 25}` }),
    )
    const per24Items = Array.from({ length: 24 }, (_, idx) =>
      makeCatalogItem({ id: idx + 1, title: `Item L24 #${idx + 1}` }),
    )

    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(makeCatalogPage(page1Items, { total: 27, page: 1, per_page: 12, total_pages: 3 }))
      .mockResolvedValueOnce(makeCatalogPage(page2Items, { total: 27, page: 2, per_page: 12, total_pages: 3 }))
      .mockResolvedValueOnce(makeCatalogPage(page3Items, { total: 27, page: 3, per_page: 12, total_pages: 3 }))
      .mockResolvedValueOnce(makeCatalogPage(per24Items, { total: 27, page: 1, per_page: 24, total_pages: 2 }))
      .mockResolvedValueOnce(makeCatalogPage(per24Items, { total: 27, page: 1, per_page: 24, total_pages: 2 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(12)
    const footer = wrapper.findComponent({ name: 'PaginationFooter' })
    expect(footer.exists()).toBe(true)

    footer.vm.$emit('update:page', 2)
    await flushPromises()
    expect(listSpy).toHaveBeenNthCalledWith(2, 12, { page: 2, per_page: 12 })
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(12)
    expect(wrapper.text()).toContain('Item P2 #13')

    footer.vm.$emit('update:page', 3)
    await flushPromises()
    expect(listSpy).toHaveBeenNthCalledWith(3, 12, { page: 3, per_page: 12 })
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(3)
    expect(wrapper.text()).toContain('Item P3 #27')

    footer.vm.$emit('update:limit', 24)
    await flushPromises()
    expect(listSpy).toHaveBeenNthCalledWith(4, 12, { page: 1, per_page: 24 })
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(24)

    const refreshBtn = findButton(wrapper, 'Atualizar sugestões')
    expect(refreshBtn).toBeDefined()
    await refreshBtn!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenNthCalledWith(5, 12, { page: 1, per_page: 24 })
    expect(listSpy).toHaveBeenCalledTimes(5)
    expect(detailSpy).toHaveBeenCalledTimes(1)
  })

  it('S20b — página fora do intervalo após redução do catálogo permite voltar à página 1 sem loop', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))
    const page1Items = Array.from({ length: 12 }, (_, idx) => makeCatalogItem({ id: idx + 1, title: `Item #${idx + 1}` }))

    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(makeCatalogPage(page1Items, { total: 27, page: 1, per_page: 12, total_pages: 3 }))
      .mockResolvedValueOnce(makeCatalogPage([], { total: 5, page: 3, per_page: 12, total_pages: 1 }))
      .mockResolvedValueOnce(makeCatalogPage(page1Items.slice(0, 5), { total: 5, page: 1, per_page: 12, total_pages: 1 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    wrapper.findComponent({ name: 'PaginationFooter' }).vm.$emit('update:page', 3)
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Nenhuma correspondência disponível no momento.')
    const firstPageBtn = findButton(wrapper, 'Voltar para a página 1')
    expect(firstPageBtn).toBeDefined()

    await firstPageBtn!.trigger('click')
    await flushPromises()

    expect(listSpy).toHaveBeenNthCalledWith(3, 12, { page: 1, per_page: 12 })
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(5)
  })

  it('S22 — respostas fora de ordem (pág 1, 2 e 3 pendentes -> resolve 2, 1, 3) aplicam apenas a última página solicitada', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, categoryId: 5 }))

    const resolvers: Array<(page: Page<PublicCatalogItem>) => void> = []
    vi.spyOn(lostReportService, 'getSuggestions').mockImplementation(
      () =>
        new Promise<Page<PublicCatalogItem>>((resolve) => {
          resolvers.push(resolve)
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    // Dispara página 2 e 3 diretamente antes da resposta de página 1 chegar
    resolvers[0]!(makeCatalogPage([makeCatalogItem({ id: 1, title: 'Inicial p1' })], { total: 30, page: 1, total_pages: 3 }))
    await flushPromises()

    const pendingResolvers: Array<(page: Page<PublicCatalogItem>) => void> = []
    vi.mocked(lostReportService.getSuggestions).mockImplementation(
      () =>
        new Promise<Page<PublicCatalogItem>>((resolve) => {
          pendingResolvers.push(resolve)
        }),
    )

    const footer = wrapper.findComponent({ name: 'PaginationFooter' })
    footer.vm.$emit('update:page', 1)
    await nextTick()
    footer.vm.$emit('update:page', 2)
    await nextTick()
    footer.vm.$emit('update:page', 3)
    await nextTick()

    expect(pendingResolvers).toHaveLength(3)

    // Resolvem fora de ordem: 2 -> 1 -> 3
    pendingResolvers[1]!(makeCatalogPage([makeCatalogItem({ id: 20, title: 'Obsoleta P2' })], { total: 30, page: 2, total_pages: 3 }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Obsoleta P2')

    pendingResolvers[0]!(makeCatalogPage([makeCatalogItem({ id: 10, title: 'Obsoleta P1' })], { total: 30, page: 1, total_pages: 3 }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Obsoleta P1')

    pendingResolvers[2]!(makeCatalogPage([makeCatalogItem({ id: 30, title: 'Vencedora P3' })], { total: 30, page: 3, total_pages: 3 }))
    await flushPromises()

    expect(wrapper.text()).toContain('Vencedora P3')
    expect(wrapper.text()).not.toContain('Obsoleta P2')
    expect(wrapper.text()).not.toContain('Obsoleta P1')
  })

  it('S24, S25 & S26 — relatos CANCELLED, RESOLVED ou com confirmedItemId não consultam catálogo nem oferecem sugestões', async () => {
    const ineligibleReports: LostReport[] = [
      makeReport({ id: 12, status: 'CANCELLED', confirmedItemId: null }),
      makeReport({ id: 12, status: 'RESOLVED', confirmedItemId: null }),
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: 44 }),
      makeReport({ id: 12, status: 'RESOLVED', confirmedItemId: 44 }),
    ]

    for (const report of ineligibleReports) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(report)
      const listSpy = vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([makeCatalogItem()]))

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      expect(listSpy).not.toHaveBeenCalled()
      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      if (report.confirmedItemId !== null) {
        expect(wrapper.text()).toContain(`Item confirmado: #${report.confirmedItemId}`)
      }
      wrapper.unmount()
    }
  })

  it('S29, S30, S31, S32 & S34 — logout, troca de conta, mesmo JWT em nova geração, troca de rota e desmontagem descartam GET pendente de catálogo', async () => {
    // 1) Logout durante GET
    {
      const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, userId: 3, categoryId: 5 }))
      let resolveCat!: (p: Page<PublicCatalogItem>) => void
      vi.spyOn(lostReportService, 'getSuggestions').mockImplementationOnce(
        () => new Promise<Page<PublicCatalogItem>>((resolve) => (resolveCat = resolve)),
      )
      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      auth.logout()
      await nextTick()
      resolveCat(makeCatalogPage([makeCatalogItem({ title: 'Vazado após logout' })]))
      await flushPromises()

      expect(wrapper.text()).not.toContain('Vazado após logout')
      wrapper.unmount()
    }

    // 2) Troca de conta A -> B
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
      let resolveCatA!: (p: Page<PublicCatalogItem>) => void
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 9, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockImplementationOnce(() => new Promise<Page<PublicCatalogItem>>((resolve) => (resolveCatA = resolve)))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ title: 'Item da sessão B' })]))

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      auth.token = 'token-b'
      auth.user = makeUser({ id: 9, name: 'Bruno' })
      auth.sessionGeneration += 1
      await flushPromises()

      resolveCatA(makeCatalogPage([makeCatalogItem({ title: 'Item obsoleto A' })]))
      await flushPromises()

      expect(wrapper.text()).not.toContain('Item obsoleto A')
      expect(wrapper.text()).toContain('Item da sessão B')
      wrapper.unmount()
    }

    // 3) Mesmo JWT e userId em nova geração
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession({ id: 3 }, 'token-igual')
      let resolveGen1!: (p: Page<PublicCatalogItem>) => void
      vi.spyOn(lostReportService, 'getById').mockResolvedValue(makeReport({ id: 12, userId: 3, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockImplementationOnce(() => new Promise<Page<PublicCatalogItem>>((resolve) => (resolveGen1 = resolve)))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ title: 'Geração 2' })]))

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      auth.sessionGeneration += 1
      await flushPromises()

      resolveGen1(makeCatalogPage([makeCatalogItem({ title: 'Geração 1 obsoleta' })]))
      await flushPromises()

      expect(wrapper.text()).not.toContain('Geração 1 obsoleta')
      wrapper.unmount()
    }

    // 4) Troca de rota 12 -> 13 e desmontagem
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      let resolve12!: (p: Page<PublicCatalogItem>) => void
      let resolve13!: (p: Page<PublicCatalogItem>) => void
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 13, categoryId: 8 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockImplementationOnce(() => new Promise<Page<PublicCatalogItem>>((resolve) => (resolve12 = resolve)))
        .mockImplementationOnce(() => new Promise<Page<PublicCatalogItem>>((resolve) => (resolve13 = resolve)))

      const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await testRouter.push('/minhas-perdas/13')
      await flushPromises()

      resolve12(makeCatalogPage([makeCatalogItem({ id: 1, categoryId: 5, category: { id: 5, name: 'Documentos' }, title: 'Candidato de 12' })]))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Candidato de 12')

      wrapper.unmount()
      resolve13(makeCatalogPage([makeCatalogItem({ id: 2, categoryId: 8, category: { id: 8, name: 'Eletrônicos' }, title: 'Após unmount' })]))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Após unmount')
    }
  })

  it('S33 & S35 — troca de categoria após PATCH confirmado recarrega catálogo da categoria nova; cancelar edição não consulta nova categoria e cancelamento/409 seguem intactos', async () => {
    setAuthenticatedSession()
    mockCatalogs()

    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 1, categoryId: 5, category: { id: 5, name: 'Documentos' }, title: 'Item Doc Antigo' })]),
      )
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 2, categoryId: 8, category: { id: 8, name: 'Eletrônicos' }, title: 'Item Eletrônico Novo' })]),
      )

    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 8, status: 'RESOLVED', confirmedItemId: 40 }))

    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 8 }))
    const cancelSpy = vi
      .spyOn(lostReportService, 'cancel')
      .mockRejectedValueOnce(makeBackendError('Somente relatos com status OPEN podem ser cancelados.', 409))

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    expect(wrapper.text()).toContain('Item Doc Antigo')

    // Alterar categoria em rascunho e cancelar edição NÃO consulta nova categoria
    await openEditMode(wrapper)
    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 8)
    await nextTick()
    expect(listSpy).toHaveBeenCalledTimes(1)

    await findButton(wrapper, 'Cancelar edição')!.trigger('click')
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Item Doc Antigo')

    // Salvar alteração de categoria consulta categoria 8 confirmada pelo PATCH
    await openEditMode(wrapper)
    await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 8)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith(12, { categoryId: 8 })
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(listSpy).toHaveBeenNthCalledWith(2, 12, { page: 1, per_page: 12 })
    expect(wrapper.text()).toContain('Item Eletrônico Novo')
    expect(wrapper.text()).not.toContain('Item Doc Antigo')

    // Regressão de cancelamento + 409 mantém recuperação intacta e limpa sugestões ao virar RESOLVED
    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Resolvida')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
  })
})

describe('LostReportDetailView (Etapa 09 — Confirmação de item sugerido — É este!)', () => {
  const genericConfirmError =
    'Não foi possível confirmar o item. Verifique o estado da perda antes de tentar novamente.'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('F02, F03 & F04 — exibe "É este!" somente em relato OPEN com confirmedItemId null', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(
      makeCatalogPage([makeCatalogItem({ id: 25, status: 'ELIGIBLE' })]),
    )

    const openMount = await mountDetail('/minhas-perdas/12')
    await flushPromises()
    expect(findButton(openMount.wrapper, 'É este!')).toBeDefined()
    openMount.wrapper.unmount()

    for (const report of [
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: 25 }),
      makeReport({ id: 12, status: 'RESOLVED', confirmedItemId: null }),
      makeReport({ id: 12, status: 'CANCELLED', confirmedItemId: null }),
    ]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(report)
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([makeCatalogItem()]))

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      expect(findButton(wrapper, 'É este!')).toBeUndefined()
      if (report.confirmedItemId !== null) {
        expect(wrapper.text()).toContain('Item confirmado: #25')
        expect(wrapper.text()).toContain('Você confirmou um item encontrado para esta perda.')
        expect(wrapper.text()).toContain('Aguarde as próximas orientações da instituição.')
        expect(wrapper.text()).not.toContain('Resolvida')
      }
      wrapper.unmount()
    }
  })

  it('F07 & F08 — clicar em "É este!" abre diálogo identificando o item e desistir não envia POST', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([makeCatalogItem({ id: 25, title: 'Mochila preta Dell' })]),
    )
    const confirmServiceSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

    const ui = useUiStore()
    let resolveDialog!: (value: boolean) => void
    const dialogSpy = vi.spyOn(ui, 'confirm').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveDialog = resolve
        }),
    )

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await nextTick()

    expect(dialogSpy).toHaveBeenCalledTimes(1)
    expect(dialogSpy.mock.calls[0]![0]).toMatchObject({
      title: 'Confirmar item encontrado',
      confirmText: 'Sim, é meu item',
      cancelText: 'Voltar',
    })
    expect(dialogSpy.mock.calls[0]![0].message).toContain('Mochila preta Dell')
    expect(confirmServiceSpy).not.toHaveBeenCalled()

    resolveDialog(false)
    await flushPromises()

    expect(confirmServiceSpy).not.toHaveBeenCalled()
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Item confirmado:')
  })

  it('F09, F10, F11 & F12 — confirmar envia POST único, atualiza confirmedItemId, oculta candidatos, mantém OPEN e não altera item ou status', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, status: 'OPEN' }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([makeCatalogItem({ id: 25, title: 'Mochila preta Dell' })]),
    )
    const confirmServiceSpy = vi
      .spyOn(lostReportService, 'confirmSuggestion')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, status: 'OPEN', confirmedItemId: 25 }))
    const updateSpy = vi.spyOn(lostReportService, 'update')
    const cancelSpy = vi.spyOn(lostReportService, 'cancel')

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    expect(confirmServiceSpy).toHaveBeenCalledTimes(1)
    expect(confirmServiceSpy).toHaveBeenCalledWith(12, 25)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(cancelSpy).not.toHaveBeenCalled()

    expect(wrapper.text()).toContain('Item confirmado: #25')
    expect(wrapper.text()).toContain('Você confirmou um item encontrado para esta perda.')
    expect(wrapper.text()).toContain('Aguarde as próximas orientações da instituição.')
    expect(wrapper.text()).toContain('Aberta')
    expect(wrapper.text()).not.toContain('Resolvida')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
    expect(findButton(wrapper, 'É este!')).toBeUndefined()
    expect(ui.snackbar.show).toBe(true)
    expect(ui.snackbar.message).toBe('Item confirmado com sucesso.')
  })

  it('F13, F14 & F15 — POST pendente exibe progresso sem sucesso antecipado e bloqueia duplo clique ou dois itens simultâneos', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([
        makeCatalogItem({ id: 25, title: 'Item A' }),
        makeCatalogItem({ id: 26, title: 'Item B' }),
      ]),
    )

    let resolvePost!: (val: LostReport) => void
    const confirmServiceSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePost = resolve
        }),
    )

    const ui = useUiStore()
    const dialogSpy = vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const confirmButtons = wrapper.findAll('button').filter((b) => b.text().includes('É este!'))
    expect(confirmButtons).toHaveLength(2)

    await confirmButtons[0]!.trigger('click')
    await confirmButtons[0]!.trigger('click')
    await confirmButtons[1]!.trigger('click')
    await nextTick()
    await flushPromises()

    expect(dialogSpy).toHaveBeenCalledTimes(1)
    expect(confirmServiceSpy).toHaveBeenCalledTimes(1)
    expect(confirmServiceSpy).toHaveBeenCalledWith(12, 25)
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).not.toContain('Item confirmado:')

    const buttonsDuringPending = wrapper.findAll('button').filter((b) => b.text().includes('É este!'))
    expect(buttonsDuringPending.every((btn) => btn.attributes('disabled') !== undefined)).toBe(true)

    resolvePost(makeReport({ id: 12, categoryId: 5, confirmedItemId: 25, status: 'OPEN' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Item confirmado: #25')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
  })

  it('F16 — HTTP 404 com relato ainda OPEN informa indisponibilidade do item, recarrega catálogo e não exibe relato não encontrado', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: null }))
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: null }))
    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25, title: 'Item removido' })]))
      .mockResolvedValueOnce(makeCatalogPage([], { total: 0, page: 1, total_pages: 0 }))
    const confirmServiceSpy = vi
      .spyOn(lostReportService, 'confirmSuggestion')
      .mockRejectedValueOnce(makeBackendError('O item sugerido não foi encontrado.', 404))

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    expect(confirmServiceSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Relato de perda não encontrado.')
    expect(wrapper.text()).toContain('não está mais disponível')
    expect(wrapper.text()).not.toContain('Item removido')
    expect(findButton(wrapper, 'É este!')).toBeUndefined()
  })

  it('F17 — HTTP 404 no POST seguido de 404 no GET exibe relato não encontrado', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
      .mockRejectedValueOnce(makeBackendError('Relato de perda não encontrado.', 404))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
    vi.spyOn(lostReportService, 'confirmSuggestion').mockRejectedValueOnce(
      makeBackendError('Relato de perda não encontrado.', 404),
    )

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Relato de perda não encontrado.')
    expect(findButton(wrapper, 'É este!')).toBeUndefined()
  })

  it('F18, F19 & F20 — HTTP 409 atualiza para outra confirmação (#30), oculta ações em CANCELLED e permite Recarregar relato se GET falhar com 503', async () => {
    // 1) Conflito com outro item já confirmado (#30)
    {
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: 30 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Este relato de perda já possui um item confirmado.', 409))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain('Item confirmado: #30')
      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      wrapper.unmount()
    }

    // 2) Conflito com relato cancelado + falha 503 no GET de recuperação oferece Recarregar relato
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      const getByIdSpy = vi
        .spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: null }))
        .mockRejectedValueOnce(makeBackendError('SQLITE_BUSY recovery failure', 503))
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, status: 'CANCELLED', confirmedItemId: null }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Somente relatos em aberto podem ter sugestões confirmadas.', 409))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Somente relatos em aberto')
      const reloadBtn = findButton(wrapper, 'Recarregar relato')
      expect(reloadBtn).toBeDefined()

      await reloadBtn!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(getByIdSpy).toHaveBeenCalledTimes(3)
      expect(wrapper.text()).toContain('Cancelada')
      expect(findButton(wrapper, 'É este!')).toBeUndefined()
      wrapper.unmount()
    }
  })

  it('F21 & F22 — HTTP 500 e falha de rede ocultam detalhes internos, não repetem POST e oferecem Recarregar relato', async () => {
    for (const err of [
      makeBackendError('SQLITE_CONSTRAINT internal details', 500),
      new AxiosError('Network Error', 'ERR_NETWORK'),
    ]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      const getByIdSpy = vi
        .spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, confirmedItemId: 25 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockRejectedValueOnce(err)

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain(genericConfirmError)
      expect(wrapper.text()).not.toContain('SQLITE_CONSTRAINT')

      const reloadBtn = findButton(wrapper, 'Recarregar relato')
      expect(reloadBtn).toBeDefined()
      await reloadBtn!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(getByIdSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Item confirmado: #25')
      wrapper.unmount()
    }
  })

  it('F23, F24, F25 & F26 — rejeita resposta HTTP 200 malformada ou inconsistente sem falso sucesso', async () => {
    const badPayloads: unknown[] = [
      null,
      'invalid',
      makeReport({ id: 99, confirmedItemId: 25, userId: 3 }),
      makeReport({ id: 12, confirmedItemId: 25, userId: 999 }),
      makeReport({ id: 12, confirmedItemId: null, userId: 3 }),
      makeReport({ id: 12, confirmedItemId: 30, userId: 3 }),
      makeReport({ id: 12, confirmedItemId: 25, userId: 3, status: 'RESOLVED' }),
    ]

    for (const payload of badPayloads) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
        makeReport({ id: 12, categoryId: 5, userId: 3, confirmedItemId: null }),
      )
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockResolvedValueOnce(payload as LostReport)

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain(genericConfirmError)
      expect(wrapper.text()).not.toContain('Item confirmado:')
      wrapper.unmount()
    }
  })

  it('F27, F28, F29, F30, F31, F32 & F37 — logout, troca de conta, nova geração, troca de rota e desmontagem invalidam diálogo e POST pendente', async () => {
    // 1) Logout / nova geração durante diálogo
    {
      const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

      const ui = useUiStore()
      let resolveDialog!: (v: boolean) => void
      vi.spyOn(ui, 'confirm').mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveDialog = resolve
          }),
      )

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()

      auth.logout()
      await nextTick()
      resolveDialog(true)
      await flushPromises()

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(ui.confirmDialog.show).toBe(false)
      wrapper.unmount()
    }

    // 2) Troca de conta durante diálogo (e mesma JWT em nova geração)
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 9, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

      const ui = useUiStore()
      let resolveDialog!: (v: boolean) => void
      vi.spyOn(ui, 'confirm').mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveDialog = resolve
          }),
      )

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()

      auth.token = 'token-b'
      auth.user = makeUser({ id: 9, name: 'Bruno' })
      auth.sessionGeneration += 1
      await flushPromises()

      resolveDialog(true)
      await flushPromises()

      expect(confirmSpy).not.toHaveBeenCalled()
      wrapper.unmount()
    }

    // 3) Troca de rota durante diálogo e POST pendente + desmontagem
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 13, userId: 3, categoryId: 5, confirmedItemId: null }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(makeCatalogPage([makeCatalogItem({ id: 25 })]))

      let resolvePost12!: (val: LostReport) => void
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolvePost12 = resolve
          }),
      )

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()
      expect(confirmSpy).toHaveBeenCalledWith(12, 25)

      await testRouter.push('/minhas-perdas/13')
      await flushPromises()

      resolvePost12(makeReport({ id: 12, userId: 3, categoryId: 5, confirmedItemId: 25 }))
      await flushPromises()

      expect(wrapper.text()).toContain('Detalhes da perda #13')
      expect(wrapper.text()).not.toContain('Item confirmado: #25')
      expect(ui.snackbar.show).toBe(false)

      // Diálogo durante desmontagem
      let resolveUnmountDialog!: (v: boolean) => void
      vi.mocked(ui.confirm).mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveUnmountDialog = resolve
          }),
      )
      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()

      wrapper.unmount()
      resolveUnmountDialog(true)
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
    }
  })

  it('F33, F34, F35 & F36 — mudança de página invalida diálogo aberto e há exclusão mútua com edição e cancelamento', async () => {
    // 1) Mudança de página invalida item selecionado antes da decisão
    {
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockResolvedValueOnce(
          makeCatalogPage([makeCatalogItem({ id: 25, title: 'Item P1' })], { total: 20, page: 1, total_pages: 2 }),
        )
        .mockResolvedValueOnce(
          makeCatalogPage([makeCatalogItem({ id: 26, title: 'Item P2' })], { total: 20, page: 2, total_pages: 2 }),
        )
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

      const ui = useUiStore()
      let resolveDialog!: (v: boolean) => void
      vi.spyOn(ui, 'confirm').mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveDialog = resolve
          }),
      )

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()

      wrapper.findComponent({ name: 'PaginationFooter' }).vm.$emit('update:page', 2)
      await flushPromises()

      resolveDialog(true)
      await flushPromises()

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Item P2')
      wrapper.unmount()
    }

    // 2) Exclusão mútua com edição e cancelamento + mudança de categoria via PATCH (F34, F35, F36)
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      mockCatalogs()

      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25, categoryId: 5, title: 'Item Cat 5' })]))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 99, categoryId: 8, category: { id: 8, name: 'Eletrônicos' }, title: 'Item Cat 8' })]))
      vi.spyOn(lostReportService, 'update').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 8 }))

      let resolvePost!: (val: LostReport) => void
      const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
        () =>
          new Promise<LostReport>((resolve) => {
            resolvePost = resolve
          }),
      )
      const cancelSpy = vi.spyOn(lostReportService, 'cancel')

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      // Editar categoria primeiro (F34): deve recarregar itens da categoria 8
      await openEditMode(wrapper)
      await wrapper.findComponent(CategorySelect).vm.$emit('update:modelValue', 8)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('Item Cat 8')

      // Inicia confirmação pendente e tenta editar/cancelar durante POST (F35 & F36)
      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(confirmSpy).toHaveBeenCalledWith(12, 99)

      const editBtn = findButton(wrapper, 'Editar perda')
      const cancelBtn = findButton(wrapper, 'Cancelar perda')
      expect(editBtn?.attributes('disabled')).toBeDefined()
      expect(cancelBtn?.attributes('disabled')).toBeDefined()
      await cancelBtn?.trigger('click')
      expect(cancelSpy).not.toHaveBeenCalled()

      resolvePost(makeReport({ id: 12, categoryId: 8, confirmedItemId: 99, status: 'OPEN' }))
      await flushPromises()
      expect(wrapper.text()).toContain('Item confirmado: #99')
    }
  })

  it('F38 & F39 — paginação e Atualizar sugestões funcionam apenas com GET quando nenhuma confirmação está ativa', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5 }))
    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 1, title: 'Cat P1' })], { total: 24, page: 1, total_pages: 2 }),
      )
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 2, title: 'Cat P2' })], { total: 24, page: 2, total_pages: 2 }),
      )
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 2, title: 'Cat P2 Atualizado' })], { total: 24, page: 2, total_pages: 2 }),
      )
    const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    wrapper.findComponent({ name: 'PaginationFooter' }).vm.$emit('update:page', 2)
    await flushPromises()
    expect(wrapper.text()).toContain('Cat P2')

    await findButton(wrapper, 'Atualizar sugestões')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Cat P2 Atualizado')
    expect(listSpy).toHaveBeenCalledTimes(3)
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('LostReportDetailView (Etapa 09.1 — Limpeza de estado após confirmação e recuperação de conflitos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('R01 — sucesso HTTP 200 libera Editar perda e Cancelar perda após desabilitá-los durante o POST', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([makeCatalogItem({ id: 25, title: 'Mochila Preta' })]),
    )

    let resolvePost!: (value: LostReport) => void
    const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
      () =>
        new Promise<LostReport>((resolve) => {
          resolvePost = resolve
        }),
    )

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
    const snackbarSpy = vi.spyOn(ui, 'showSnackbar')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await nextTick()
    await nextTick()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeDefined()
    expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeDefined()

    resolvePost(makeReport({ id: 12, status: 'OPEN', confirmedItemId: 25 }))
    await flushPromises()

    expect(wrapper.text()).toContain('Item confirmado: #25')
    expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
    expect(wrapper.text()).toContain('Aberta')
    expect(wrapper.text()).not.toContain('Resolvida')
    expect(snackbarSpy).toHaveBeenCalledTimes(1)
    expect(snackbarSpy).toHaveBeenCalledWith('Item confirmado com sucesso.', 'success')

    expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
    expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeUndefined()
  })

  it('R02 — edição abre formulário funcional após confirmação bem-sucedida sem disparar PATCH automático', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([makeCatalogItem({ id: 25, title: 'Mochila Preta' })]),
    )
    vi.spyOn(lostReportService, 'confirmSuggestion').mockResolvedValueOnce(
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: 25 }),
    )
    const updateSpy = vi.spyOn(lostReportService, 'update')

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    await findButton(wrapper, 'Editar perda')!.trigger('click')
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(findButton(wrapper, 'Salvar alterações')).toBeDefined()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('R03 — cancelamento abre diálogo após confirmação bem-sucedida e desiste sem enviar POST extra', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
      makeCatalogPage([makeCatalogItem({ id: 25, title: 'Mochila Preta' })]),
    )
    const confirmSuggestionSpy = vi
      .spyOn(lostReportService, 'confirmSuggestion')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: 25 }))
    const cancelReportSpy = vi.spyOn(lostReportService, 'cancel')

    const ui = useUiStore()
    const uiConfirmSpy = vi
      .spyOn(ui, 'confirm')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    const cancelBtn = findButton(wrapper, 'Cancelar perda')
    expect(cancelBtn?.attributes('disabled')).toBeUndefined()

    await cancelBtn!.trigger('click')
    await flushPromises()

    expect(uiConfirmSpy).toHaveBeenCalledTimes(2)
    expect(uiConfirmSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'Cancelar perda',
        confirmText: 'Sim, cancelar perda',
        cancelText: 'Manter perda',
      }),
    )
    expect(cancelReportSpy).not.toHaveBeenCalled()
    expect(confirmSuggestionSpy).toHaveBeenCalledTimes(1)
  })

  it('R04, R05 & R06 — HTTP 409 com CANCELLED, RESOLVED ou outro item confirmado (#30) libera estado e não trava controles', async () => {
    // R04: CANCELLED
    {
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'CANCELLED', confirmedItemId: null }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Relato cancelado.', 409))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain('Cancelada')
      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      wrapper.unmount()
    }

    // R05: RESOLVED
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'RESOLVED', confirmedItemId: null }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Relato resolvido.', 409))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain('Resolvida')
      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      wrapper.unmount()
    }

    // R06: OPEN com outro item confirmado (#30) -> Editar perda e Cancelar perda seguem operacionais
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      mockCatalogs()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: 30 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Este relato de perda já possui um item confirmado.', 409))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain('Item confirmado: #30')
      expect(wrapper.findAllComponents({ name: 'SuggestionCard' })).toHaveLength(0)
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeUndefined()

      await findButton(wrapper, 'Editar perda')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('form').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('R07 — HTTP 409 seguido de GET 503 permite Recarregar relato via GET e libera controles após recuperar OPEN', async () => {
    setAuthenticatedSession()
    const getByIdSpy = vi
      .spyOn(lostReportService, 'getById')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
      .mockRejectedValueOnce(makeBackendError('SQLITE_BUSY', 503))
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: 30 }))
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
    const confirmSpy = vi
      .spyOn(lostReportService, 'confirmSuggestion')
      .mockRejectedValueOnce(makeBackendError('Conflito ao confirmar.', 409))

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await findButton(wrapper, 'É este!')!.trigger('click')
    await flushPromises()

    const reloadBtn = findButton(wrapper, 'Recarregar relato')
    expect(reloadBtn).toBeDefined()
    expect(reloadBtn?.attributes('disabled')).toBeUndefined()

    await reloadBtn!.trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(getByIdSpy).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('Item confirmado: #30')
    expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
    expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeUndefined()
  })

  it('R08 & R09 — HTTP 404 diferencia item indisponível (libera sugestões e edição) de relato inexistente', async () => {
    // R08: item indisponível
    {
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
      const listSpy = vi
        .spyOn(lostReportService, 'getSuggestions')
        .mockResolvedValueOnce(
          makeCatalogPage([
            makeCatalogItem({ id: 25, title: 'Indisponível' }),
            makeCatalogItem({ id: 26, title: 'Disponível B' }),
          ]),
        )
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 26, title: 'Disponível B' })]))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 26, title: 'Disponível B' })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Item não disponível.', 404))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('não está mais disponível')
      expect(wrapper.text()).not.toContain('Relato de perda não encontrado.')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeUndefined()

      const refreshBtn = findButton(wrapper, 'Atualizar sugestões')
      expect(refreshBtn?.attributes('disabled')).toBeUndefined()
      await refreshBtn!.trigger('click')
      await flushPromises()
      expect(listSpy).toHaveBeenCalledTimes(3)
      wrapper.unmount()
    }

    // R09: relato inexistente
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockRejectedValueOnce(makeBackendError('Relato não encontrado.', 404))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      const confirmSpy = vi
        .spyOn(lostReportService, 'confirmSuggestion')
        .mockRejectedValueOnce(makeBackendError('Não encontrado.', 404))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).toContain('Relato de perda não encontrado.')
      expect(findButton(wrapper, 'É este!')).toBeUndefined()
      wrapper.unmount()
    }
  })

  it('R10, R11 & R12 — HTTP 500, erro de rede e HTTP 200 inválido mantêm controles e recuperação manual habilitados', async () => {
    const scenarios = [
      () =>
        vi
          .spyOn(lostReportService, 'confirmSuggestion')
          .mockRejectedValueOnce(makeBackendError('SQLITE_INTERNAL_ERR', 500)),
      () =>
        vi
          .spyOn(lostReportService, 'confirmSuggestion')
          .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK')),
      () =>
        vi
          .spyOn(lostReportService, 'confirmSuggestion')
          .mockResolvedValueOnce({ id: 999, status: 'RESOLVED' } as unknown as LostReport),
    ]

    for (const setupPostMock of scenarios) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession()
      const getByIdSpy = vi
        .spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
        .mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN', confirmedItemId: null }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValue(
        makeCatalogPage([makeCatalogItem({ id: 25, title: 'Chave Prata' })]),
      )
      const confirmSpy = setupPostMock()

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).not.toContain('SQLITE_INTERNAL_ERR')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, 'Atualizar sugestões')?.attributes('disabled')).toBeUndefined()

      const reloadBtn = findButton(wrapper, 'Recarregar relato')
      expect(reloadBtn?.attributes('disabled')).toBeUndefined()
      await reloadBtn!.trigger('click')
      await flushPromises()

      expect(getByIdSpy).toHaveBeenCalledTimes(2)
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    }
  })

  it('R13, R14, R15, R16, R17 & R18 — operação antiga nunca aplica resultado nem limpa loading/seleção de operação mais recente', async () => {
    // 1) R13: Logout durante POST
    {
      const auth = setAuthenticatedSession({ id: 3 }, 'token-a')
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
        makeReport({ id: 12, userId: 3, categoryId: 5 }),
      )
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 25, title: 'Privado Logout' })]),
      )
      let resolvePost!: (val: LostReport) => void
      vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
        () => new Promise<LostReport>((r) => (resolvePost = r)),
      )
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()

      auth.logout()
      await flushPromises()

      resolvePost(makeReport({ id: 12, userId: 3, categoryId: 5, confirmedItemId: 25 }))
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).not.toContain('Item confirmado: #25')
      expect(wrapper.text()).not.toContain('Privado Logout')
      wrapper.unmount()
    }

    // 2) R14 & R15: Troca de conta A -> B e mesma credencial em nova sessionGeneration com POST ativo em B
    for (const sameJwt of [false, true]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      const auth = setAuthenticatedSession({ id: 3 }, sameJwt ? 'jwt-fixo' : 'jwt-a')
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 12, userId: sameJwt ? 3 : 9, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25, title: 'Item Sessão 1' })]))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 77, title: 'Item Sessão 2' })]))

      let resolveOld!: (val: LostReport) => void
      let resolveNew!: (val: LostReport) => void
      vi.spyOn(lostReportService, 'confirmSuggestion')
        .mockImplementationOnce(() => new Promise<LostReport>((r) => (resolveOld = r)))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => (resolveNew = r)))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()

      if (!sameJwt) {
        auth.token = 'jwt-b'
        auth.user = makeUser({ id: 9, name: 'Bruno' })
      } else {
        auth.logout()
        await flushPromises()
        auth.token = 'jwt-fixo'
        auth.user = makeUser({ id: 3 })
      }
      auth.sessionGeneration += 1
      await flushPromises()

      // Inicia nova confirmação na nova geração/sessão
      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeDefined()

      // Resolve POST obsoleto da sessão/geração antiga — NÃO pode limpar bloqueio da nova
      resolveOld(makeReport({ id: 12, userId: 3, categoryId: 5, confirmedItemId: 25 }))
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).not.toContain('Item confirmado: #25')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeDefined()
      expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeDefined()

      // Agora resolve operação vigente
      resolveNew(makeReport({ id: 12, userId: sameJwt ? 3 : 9, categoryId: 5, confirmedItemId: 77 }))
      await flushPromises()

      expect(wrapper.text()).toContain('Item confirmado: #77')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    }

    // 3) R16 & R17: Troca de rota /12 -> /13 durante POST sem que resolução de 12 limpe ou bloqueie 13
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById')
        .mockResolvedValueOnce(makeReport({ id: 12, userId: 3, categoryId: 5 }))
        .mockResolvedValueOnce(makeReport({ id: 13, userId: 3, categoryId: 5 }))
      vi.spyOn(lostReportService, 'getSuggestions')
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25, title: 'Item 12' })]))
        .mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 88, title: 'Item 13' })]))

      let resolvePost12!: (val: LostReport) => void
      let resolvePost13!: (val: LostReport) => void
      vi.spyOn(lostReportService, 'confirmSuggestion')
        .mockImplementationOnce(() => new Promise<LostReport>((r) => (resolvePost12 = r)))
        .mockImplementationOnce(() => new Promise<LostReport>((r) => (resolvePost13 = r)))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper, testRouter } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()

      await testRouter.push('/minhas-perdas/13')
      await flushPromises()

      // R16: rota 13 livre e funcional; resolver 12 fora de ordem não interfere
      expect(wrapper.text()).toContain('Detalhes da perda #13')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()

      // R17: inicia nova operação em 13 e resolve 12 enquanto 13 está pendente
      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeDefined()

      resolvePost12(makeReport({ id: 12, userId: 3, categoryId: 5, confirmedItemId: 25 }))
      await flushPromises()

      expect(wrapper.text()).toContain('Detalhes da perda #13')
      expect(wrapper.text()).not.toContain('Item confirmado: #25')
      expect(ui.snackbar.show).toBe(false)
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeDefined()
      expect(findButton(wrapper, 'Cancelar perda')?.attributes('disabled')).toBeDefined()

      resolvePost13(makeReport({ id: 13, userId: 3, categoryId: 5, confirmedItemId: 88 }))
      await flushPromises()
      expect(wrapper.text()).toContain('Item confirmado: #88')
      expect(findButton(wrapper, 'Editar perda')?.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    }

    // 4) R18: Desmontagem durante POST
    {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setAuthenticatedSession({ id: 3 })
      vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, userId: 3 }))
      vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(makeCatalogPage([makeCatalogItem({ id: 25 })]))
      let resolvePost!: (val: LostReport) => void
      vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
        () => new Promise<LostReport>((r) => (resolvePost = r)),
      )
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountDetail('/minhas-perdas/12')
      await flushPromises()

      await findButton(wrapper, 'É este!')!.trigger('click')
      await nextTick()
      await nextTick()

      wrapper.unmount()
      resolvePost(makeReport({ id: 12, userId: 3, confirmedItemId: 25 }))
      await flushPromises()

      expect(ui.snackbar.show).toBe(false)
    }
  })

  it('R19 & R20 — duplo clique não envia POST duplicado e fluxo completo com paginação, edição, cancelamento e confirmação funciona', async () => {
    setAuthenticatedSession()
    mockCatalogs()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, categoryId: 5, description: 'Descrição inicial do relato' }),
    )
    const listSpy = vi
      .spyOn(lostReportService, 'getSuggestions')
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 10, title: 'Página 1' })], { total: 24, page: 1, total_pages: 2 }),
      )
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 25, title: 'Página 2 Item' })], { total: 24, page: 2, total_pages: 2 }),
      )
      .mockResolvedValueOnce(
        makeCatalogPage([makeCatalogItem({ id: 25, title: 'Página 2 Recarregada' })], {
          total: 24,
          page: 2,
          total_pages: 2,
        }),
      )

    let resolvePost!: (val: LostReport) => void
    const confirmSpy = vi.spyOn(lostReportService, 'confirmSuggestion').mockImplementationOnce(
      () => new Promise<LostReport>((r) => (resolvePost = r)),
    )
    const updateSpy = vi
      .spyOn(lostReportService, 'update')
      .mockResolvedValueOnce(
        makeReport({
          id: 12,
          categoryId: 5,
          confirmedItemId: 25,
          description: 'Descrição editada após confirmação',
        }),
      )
    const cancelSpy = vi
      .spyOn(lostReportService, 'cancel')
      .mockResolvedValueOnce(
        makeReport({
          id: 12,
          categoryId: 5,
          confirmedItemId: 25,
          status: 'CANCELLED',
          description: 'Descrição editada após confirmação',
        }),
      )

    const ui = useUiStore()
    vi.spyOn(ui, 'confirm').mockResolvedValue(true)

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    wrapper.findComponent({ name: 'PaginationFooter' }).vm.$emit('update:page', 2)
    await flushPromises()
    expect(wrapper.text()).toContain('Página 2 Item')

    await findButton(wrapper, 'Atualizar sugestões')!.trigger('click')
    await flushPromises()
    expect(listSpy).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('Página 2 Recarregada')

    // Duplo clique em "É este!"
    const confirmBtn = findButton(wrapper, 'É este!')!
    await confirmBtn.trigger('click')
    await confirmBtn.trigger('click')
    await nextTick()
    await nextTick()
    expect(confirmSpy).toHaveBeenCalledTimes(1)

    resolvePost(makeReport({ id: 12, categoryId: 5, confirmedItemId: 25, description: 'Descrição inicial do relato' }))
    await flushPromises()

    // Edita via PATCH após confirmar
    await openEditMode(wrapper)
    await wrapper.find('textarea').setValue('Descrição editada após confirmação')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledWith(12, { description: 'Descrição editada após confirmação' })
    expect(wrapper.text()).toContain('Descrição editada após confirmação')

    // Cancela após editar
    await findButton(wrapper, 'Cancelar perda')!.trigger('click')
    await flushPromises()
    expect(cancelSpy).toHaveBeenCalledWith(12)
    expect(wrapper.text()).toContain('Cancelada')
  })

  it('BS13.3-17 — modo de edição não duplica alertas de falha de prédios, preserva valor original e recupera via Recarregar opções sem PATCH', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, categoryId: 5, buildingId: 2, status: 'OPEN' }),
    )
    vi.spyOn(categoryService, 'list').mockResolvedValue(defaultCategories)
    const listBuildingsSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(makeBackendError('Falha prédios', 503))
      .mockRejectedValueOnce(makeBackendError('Falha prédios', 503))
      .mockResolvedValueOnce(defaultBuildings)
    const updateSpy = vi.spyOn(lostReportService, 'update')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await openEditMode(wrapper)

    expect(wrapper.text()).toContain('Não foi possível carregar todas as opções. Os valores originais foram preservados.')
    expect(findButton(wrapper, 'Recarregar opções')).toBeDefined()
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(wrapper.findComponent(BuildingSelect).props('modelValue')).toBe(2)

    await findButton(wrapper, 'Recarregar opções')!.trigger('click')
    await flushPromises()

    expect(listBuildingsSpy).toHaveBeenCalledTimes(3)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual(defaultBuildings)
    expect(wrapper.findComponent(BuildingSelect).props('modelValue')).toBe(2)
    wrapper.unmount()
  })

  it('CS14-18 — edição não duplica alertas de falha de categorias, preserva valor original e bloqueia envio se categoria for excluída externamente', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(defaultEmptyCatalogPage())
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, categoryId: 5, buildingId: 2, status: 'OPEN' }),
    )
    vi.spyOn(buildingService, 'list').mockResolvedValue(defaultBuildings)
    const listCategoriesSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(makeBackendError('Falha categorias', 503))
      .mockRejectedValueOnce(makeBackendError('Falha categorias', 503))
      .mockResolvedValueOnce(defaultCategories)
    const updateSpy = vi.spyOn(lostReportService, 'update')

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    await openEditMode(wrapper)

    expect(wrapper.text()).toContain('Não foi possível carregar todas as opções. Os valores originais foram preservados.')
    expect(findButton(wrapper, 'Recarregar opções')).toBeDefined()
    expect(findButton(wrapper, 'Tentar novamente')).toBeUndefined()
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)

    await findButton(wrapper, 'Recarregar opções')!.trigger('click')
    await flushPromises()

    expect(listCategoriesSpy).toHaveBeenCalledTimes(3)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent(CategorySelect).findComponent({ name: 'VSelect' }).props('items')).toEqual(defaultCategories)
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)

    // Exclusão externa da categoria 5 não troca silenciosamente para outro ID e impede PATCH inválido
    const categoriesStore = useCategoriesStore() as ReturnType<typeof useCategoriesStore> & {
      syncCatalog: (items: Category[]) => void
    }
    categoriesStore.syncCatalog(defaultCategories.filter((c) => c.id !== 5))
    await nextTick()

    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)
    await wrapper.find('textarea').setValue('Descrição alterada enquanto categoria foi removida')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Categoria selecionada é inválida.')
    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent(CategorySelect).props('modelValue')).toBe(5)
    wrapper.unmount()
  })

  it('R17-CONF-01a — cancelar perda não substitui diálogo global externo já aberto e volta a funcionar após liberação', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce(defaultEmptyCatalogPage())
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(makeReport({ id: 12, status: 'OPEN' }))
    const cancelSpy = vi
      .spyOn(lostReportService, 'cancel')
      .mockResolvedValueOnce(makeReport({ id: 12, status: 'CANCELLED' }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const ui = useUiStore()
    const externalPromise = ui.confirm({
      title: 'Confirmação externa',
      message: 'Outro componente no controle.',
    })
    const externalResolver = ui.confirmDialog.resolve
    let settled = false
    void externalPromise.then(() => {
      settled = true
    })

    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('Cancelar perda'))!
    await cancelBtn.trigger('click')
    await flushPromises()

    expect(ui.confirmDialog.resolve).toBe(externalResolver)
    expect(ui.confirmDialog.title).toBe('Confirmação externa')
    expect(cancelSpy).not.toHaveBeenCalled()

    ui.confirmDialog.show = false
    ui.confirmDialog.open = false
    ui.confirmDialog.resolve(false)
    await flushPromises()
    expect(settled).toBe(true)

    await cancelBtn.trigger('click')
    await flushPromises()
    expect(ui.confirmDialog.title).toBe('Cancelar perda')
    ui.confirmDialog.resolve(true)
    await flushPromises()
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith(12)
    wrapper.unmount()
  })

  it('R17-CONF-01b — confirmar sugestão não substitui diálogo global externo já aberto e volta a funcionar após liberação', async () => {
    setAuthenticatedSession()
    vi.spyOn(lostReportService, 'getById').mockResolvedValueOnce(
      makeReport({ id: 12, categoryId: 5, status: 'OPEN', confirmedItemId: null }),
    )
    vi.spyOn(lostReportService, 'getSuggestions').mockResolvedValueOnce({
      data: [
        {
          id: 25,
          categoryId: 5,
          buildingId: 2,
          title: 'Mochila preta Dell',
          description: 'Encontrada no bloco 1.',
          foundLocation: 'Bloco 1',
          foundDate: '2026-11-06',
          status: 'AVAILABLE',
          category: { id: 5, name: 'Documentos' },
          building: { id: 2, name: 'Bloco I' },
          photos: [],
        },
      ],
      pagination: { total: 1, page: 1, per_page: 12, total_pages: 1 },
    })
    const confirmSpy = vi
      .spyOn(lostReportService, 'confirmSuggestion')
      .mockResolvedValueOnce(makeReport({ id: 12, categoryId: 5, status: 'OPEN', confirmedItemId: 25 }))

    const { wrapper } = await mountDetail('/minhas-perdas/12')
    await flushPromises()

    const ui = useUiStore()
    const externalPromise = ui.confirm({
      title: 'Confirmação externa',
      message: 'Outro componente no controle.',
    })
    const externalResolver = ui.confirmDialog.resolve
    let settled = false
    void externalPromise.then(() => {
      settled = true
    })

    const confirmSuggestionBtn = wrapper.findAll('button').find((b) => b.text().includes('É este!'))!
    await confirmSuggestionBtn.trigger('click')
    await flushPromises()

    expect(ui.confirmDialog.resolve).toBe(externalResolver)
    expect(ui.confirmDialog.title).toBe('Confirmação externa')
    expect(confirmSpy).not.toHaveBeenCalled()

    ui.confirmDialog.show = false
    ui.confirmDialog.open = false
    ui.confirmDialog.resolve(false)
    await flushPromises()
    expect(settled).toBe(true)

    await confirmSuggestionBtn.trigger('click')
    await flushPromises()
    expect(ui.confirmDialog.title).toBe('Confirmar item encontrado')
    ui.confirmDialog.resolve(true)
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(12, 25)
    wrapper.unmount()
  })
})
