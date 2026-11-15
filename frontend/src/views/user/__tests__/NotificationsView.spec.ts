import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import NotificationsView from '../NotificationsView.vue'
import { vuetify } from '@/theme'
import { notificationService } from '@/services/notification.service'
import { useAuthStore } from '@/stores/authStore'
import { NOTIFICATIONS_POLL_INTERVAL_MS, useNotificationsStore } from '@/stores/notificationsStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDateTime } from '@/utils/format'
import type { Notification, User } from '@/types'

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

const makeNotification = (overrides: Record<string, unknown> = {}): Notification =>
  ({
    id: 15,
    userId: 3,
    type: 'MATCH_FOUND',
    linkUrl: '/lost-reports/12',
    readAt: null,
    createdAt: '2026-11-14T15:30:00.000Z',
    ...overrides,
  }) as unknown as Notification

function setSession(user = makeUser(), token = 'token-a') {
  const auth = useAuthStore()
  auth.token = token
  auth.user = user
  return auth
}

function makeHttpError(status: number, details = 'Internal server error') {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    data: { success: false, data: null, error: { code: status, details } },
  })
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/notificacoes', name: 'notifications', component: NotificationsView },
      { path: '/minhas-perdas/:id', name: 'lost-report-detail', component: { template: '<div>Perda</div>' } },
      { path: '/itens/:id', name: 'item-detail', component: { template: '<div>Item</div>' } },
      { path: '/admin/itens/:id', name: 'admin-item-detail', component: { template: '<div>AdminItem</div>' } },
    ],
  })
}

const mountedWrappers: Array<ReturnType<typeof mount>> = []

async function mountView() {
  const testRouter = makeRouter()
  await testRouter.push('/notificacoes')
  await testRouter.isReady()
  const wrapper = mount(NotificationsView, {
    global: {
      plugins: [vuetify, testRouter],
    },
  })
  mountedWrappers.push(wrapper)
  return { wrapper, testRouter }
}

function findButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button, a').find((b) => b.text().includes(label))
}

describe('NotificationsView (Etapa 10 — Listagem somente leitura)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('T19, T20 & T48 — substitui stub "Em construção", exibe filtros, botão Atualizar, tipos derivados e datas sem depender de campos fictícios', async () => {
    setSession()
    const items = [
      makeNotification({
        id: 15,
        type: 'MATCH_FOUND',
        linkUrl: '/lost-reports/12',
        readAt: null,
        createdAt: '2026-11-14T15:30:00.000Z',
      }),
      makeNotification({
        id: 14,
        type: 'ITEM_CLAIMED',
        linkUrl: '/admin/items/25',
        readAt: '2026-11-13T10:00:00.000Z',
        createdAt: '2026-11-13T09:00:00.000Z',
      }),
      makeNotification({
        id: 13,
        type: 'REPORT_RESOLVED',
        linkUrl: '/items/9',
        readAt: '2026-11-12T08:00:00.000Z',
        createdAt: '2026-11-12T08:00:00.000Z',
      }),
    ]
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce(items as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 1 })

    const { wrapper } = await mountView()
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('Em construção')
    expect(text).toContain('Notificações')
    expect(findButton(wrapper, 'Todas')).toBeDefined()
    expect(findButton(wrapper, 'Não lidas')).toBeDefined()
    expect(findButton(wrapper, 'Lidas')).toBeDefined()
    expect(findButton(wrapper, 'Atualizar')).toBeDefined()

    expect(text).toContain('Possível correspondência encontrada')
    expect(text).toContain('Item reconhecido por usuário')
    expect(text).toContain('Perda resolvida')
    expect(text).toContain(formatDateTime('2026-11-14T15:30:00.000Z'))
    expect(text).toContain('Não lida')
    expect(text).toContain('Lida')
  })

  it('T21 — lista vazia exibe EmptyState sem erro', async () => {
    setSession()
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([])
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 0 })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Nenhuma notificação por enquanto.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar')
  })

  it('T22, T23, T24, T25 & T26 — filtros Todas / Não lidas / Lidas filtram localmente sem novos GETs nem PATCH', async () => {
    setSession()
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValueOnce([
      makeNotification({ id: 15, type: 'MATCH_FOUND', readAt: null }),
      makeNotification({
        id: 14,
        type: 'REPORT_RESOLVED',
        readAt: '2026-11-13T10:00:00.000Z',
      }),
    ] as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 1 })
    const markReadSpy = vi.spyOn(notificationService, 'markRead')

    const { wrapper } = await mountView()
    await flushPromises()

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Possível correspondência encontrada')
    expect(wrapper.text()).toContain('Perda resolvida')

    await findButton(wrapper, 'Não lidas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Possível correspondência encontrada')
    expect(wrapper.text()).not.toContain('Perda resolvida')

    await findButton(wrapper, 'Lidas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).not.toContain('Possível correspondência encontrada')
    expect(wrapper.text()).toContain('Perda resolvida')

    await findButton(wrapper, 'Todas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Possível correspondência encontrada')
    expect(wrapper.text()).toContain('Perda resolvida')
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(markReadSpy).not.toHaveBeenCalled()
  })

  it('T25 — filtro sem resultados exibe mensagem contextual sem apagar a lista original', async () => {
    setSession()
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([
      makeNotification({ id: 15, type: 'MATCH_FOUND', readAt: null }),
    ] as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 1 })

    const { wrapper } = await mountView()
    await flushPromises()

    await findButton(wrapper, 'Lidas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Nenhuma notificação lida.')

    await findButton(wrapper, 'Todas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Possível correspondência encontrada')
  })

  it('T27 — enquanto GET estiver pendente exibe carregamento e não mostra estado vazio prematuro', async () => {
    setSession()
    let resolveList!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((r) => (resolveList = r)) as never,
    )
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 0 })

    const { wrapper } = await mountView()
    await nextTick()

    expect(wrapper.text()).not.toContain('Nenhuma notificação por enquanto.')
    resolveList([])
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhuma notificação por enquanto.')
  })

  it('T28, T29 & T30 — HTTP 500 e falha de rede exibem mensagem genérica e retry apenas com GET', async () => {
    for (const err of [makeHttpError(500, 'SQLITE_CORRUPT_DETAIL'), new AxiosError('Network', 'ERR_NETWORK')]) {
      vi.restoreAllMocks()
      localStorage.clear()
      setActivePinia(createPinia())
      setSession()

      const listSpy = vi
        .spyOn(notificationService, 'list')
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce([makeNotification({ id: 15, type: 'MATCH_FOUND', readAt: null })] as never)
      vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 1 })

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.text()).toContain('Não foi possível carregar suas notificações.')
      expect(wrapper.text()).not.toContain('SQLITE_CORRUPT_DETAIL')
      expect(wrapper.text()).not.toContain('Nenhuma notificação por enquanto.')

      const retryBtn = findButton(wrapper, 'Tentar novamente')
      expect(retryBtn).toBeDefined()
      await retryBtn!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Possível correspondência encontrada')
      wrapper.unmount()
    }
  })

  it('T14..T18 & U08 — navegação segura respeita papel, bloqueia links inseguros e clicar em Ver detalhes não dispara PATCH', async () => {
    setSession(makeUser({ id: 3, role: 'USER' }))
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([
      makeNotification({ id: 15, type: 'MATCH_FOUND', linkUrl: '/lost-reports/12', readAt: null }),
      makeNotification({ id: 16, type: 'ITEM_CLAIMED', linkUrl: '/admin/items/25', readAt: null }),
      makeNotification({ id: 17, type: 'REPORT_RESOLVED', linkUrl: 'https://site-externo.com/hack', readAt: null }),
    ] as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 3 })
    const markReadSpy = vi.spyOn(notificationService, 'markRead')
    const markAllSpy = vi.spyOn(notificationService, 'markAllRead')

    const { wrapper, testRouter } = await mountView()
    await flushPromises()

    const btnTargets = wrapper.findAllComponents({ name: 'VBtn' }).map((b) => b.props('to'))
    expect(btnTargets).toContainEqual({ name: 'lost-report-detail', params: { id: 12 } })
    expect(btnTargets).not.toContainEqual({ name: 'admin-item-detail', params: { id: 25 } })
    expect(wrapper.find('a[href*="site-externo.com"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/admin/itens/25"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Destino indisponível')

    const pushSpy = vi.spyOn(testRouter, 'push')
    const validDetailBtn = wrapper.findAll('a').find((a) => a.text().includes('Ver detalhes'))
    expect(validDetailBtn).toBeDefined()
    expect(validDetailBtn!.attributes('href')).toBe('/minhas-perdas/12')
    await validDetailBtn!.trigger('click')
    await flushPromises()

    expect(markReadSpy).not.toHaveBeenCalled()
    expect(markAllSpy).not.toHaveBeenCalled()
    void pushSpy
  })

  it('T41, T42, T43 & T47 — logout, troca de conta, nova geração e desmontagem protegem a view', async () => {
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    let resolveA!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveA = r)) as never)
      .mockResolvedValueOnce([makeNotification({ id: 90, userId: 9, type: 'REPORT_RESOLVED' })] as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 1 })
    const ui = useUiStore()

    const { wrapper } = await mountView()
    await nextTick()

    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1
    await flushPromises()

    resolveA([makeNotification({ id: 1, userId: 3, type: 'MATCH_FOUND' })])
    await flushPromises()

    expect(wrapper.text()).toContain('Perda resolvida')
    expect(wrapper.text()).not.toContain('Possível correspondência encontrada')

    wrapper.unmount()
    auth.logout()
    await flushPromises()
    expect(ui.snackbar.show).toBe(false)
  })
})

describe('NotificationsView (Etapa 11 — Marcação como lida, lote e polling)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    vi.useRealTimers()
  })

  it('U01, U02, U03, U04, U05 & U16 — marcação individual atualiza UI/filtros somente após HTTP 200 e permite marcar item sem destino seguro', async () => {
    setSession()
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([
      makeNotification({ id: 15, type: 'MATCH_FOUND', linkUrl: 'https://externo.invalido', readAt: null }),
      makeNotification({ id: 14, type: 'REPORT_RESOLVED', readAt: '2026-11-13T10:00:00.000Z' }),
    ] as never)
    vi.spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    let resolvePatch!: (v: Notification) => void
    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolvePatch = r)) as never)

    const { wrapper } = await mountView()
    await flushPromises()

    // Apenas item não lido (mesmo com destino indisponível) oferece Marcar como lida
    const markBtns = wrapper.findAll('button').filter((b) => b.text().includes('Marcar como lida'))
    expect(markBtns).toHaveLength(1)
    expect(wrapper.text()).toContain('Destino indisponível')

    await markBtns[0].trigger('click')
    await nextTick()
    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith(15)
    // Enquanto pendente não muda antecipadamente para Lida e botão Marcar todas fica bloqueado
    expect(findButton(wrapper, 'Marcar todas')?.attributes('disabled')).toBeDefined()

    resolvePatch(
      makeNotification({
        id: 15,
        type: 'MATCH_FOUND',
        linkUrl: 'https://externo.invalido',
        readAt: '2026-11-14T19:00:00.000Z',
      }),
    )
    await flushPromises()

    expect(wrapper.findAll('button').filter((b) => b.text().includes('Marcar como lida'))).toHaveLength(0)

    // U05: filtro Não lidas não exibe mais item 15; filtro Lidas passa a exibi-lo
    await findButton(wrapper, 'Não lidas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Nenhuma notificação não lida.')

    await findButton(wrapper, 'Lidas')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Possível correspondência encontrada')
  })

  it('U10, U12, U13, U14 & U19 — Marcar todas exige pendência, reconcilia após 204 sem fabricar data, trata erro pós-204 só com GET e limpa dados ao sair', async () => {
    const auth = setSession()
    const listSpy = vi
      .spyOn(notificationService, 'list')
      .mockResolvedValueOnce([
        makeNotification({ id: 15, readAt: null }),
        makeNotification({ id: 16, readAt: null }),
      ] as never)
      .mockResolvedValueOnce([
        makeNotification({ id: 15, readAt: '2026-11-14T19:05:00.000Z' }),
        makeNotification({ id: 16, readAt: '2026-11-14T19:05:00.000Z' }),
      ] as never)
    const countSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 })
    const allSpy = vi.spyOn(notificationService, 'markAllRead').mockResolvedValueOnce(undefined)
    const ui = useUiStore()

    const { wrapper } = await mountView()
    await flushPromises()

    const markAllBtn = findButton(wrapper, 'Marcar todas')
    expect(markAllBtn).toBeDefined()
    await markAllBtn!.trigger('click')
    await flushPromises()

    expect(allSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(ui.snackbar.message).toBe('Notificações marcadas como lidas.')
    // U12: após reconciliar com 0 pendências, ação redundante não é oferecida
    expect(findButton(wrapper, 'Marcar todas como lidas')).toBeUndefined()

    // U14: falha de GET após 204 mostra erro recuperável e retry só com GET
    const store = useNotificationsStore()
    store.items = [makeNotification({ id: 21, readAt: null })]
    store.unreadCount = 1
    await nextTick()

    allSpy.mockResolvedValueOnce(undefined)
    listSpy.mockRejectedValueOnce(new AxiosError('Network', 'ERR_NETWORK'))
    countSpy.mockResolvedValueOnce({ count: 0 })

    await findButton(wrapper, 'Marcar todas')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('marcadas no servidor')

    listSpy.mockResolvedValueOnce([makeNotification({ id: 21, readAt: '2026-11-14T19:06:00.000Z' })] as never)
    countSpy.mockResolvedValueOnce({ count: 0 })
    const syncBtn = findButton(wrapper, 'Atualizar visualização') ?? findButton(wrapper, 'Tentar atualizar')
    expect(syncBtn).toBeDefined()
    await syncBtn!.trigger('click')
    await flushPromises()
    expect(allSpy).toHaveBeenCalledTimes(2)

    // U19: logout apaga notificações da view
    auth.logout()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Possível correspondência encontrada')
  })

  it('P15 & P16 — atualização manual não duplica timer de polling e desmontagem interrompe polling e descarta GET tardio', async () => {
    vi.useFakeTimers()
    setSession()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValue([])
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 0 })

    const { wrapper } = await mountView()
    await flushPromises()
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    await findButton(wrapper, 'Atualizar')!.trigger('click')
    await flushPromises()
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(countSpy.mock.calls.length).toBeGreaterThanOrEqual(3)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
