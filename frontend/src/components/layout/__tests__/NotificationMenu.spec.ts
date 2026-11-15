import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError } from 'axios'
import NotificationMenu from '../NotificationMenu.vue'
import NotificationsView from '@/views/user/NotificationsView.vue'
import { vuetify } from '@/theme'
import { notificationService } from '@/services/notification.service'
import { useAuthStore } from '@/stores/authStore'
import { NOTIFICATIONS_POLL_INTERVAL_MS, useNotificationsStore } from '@/stores/notificationsStore'
import type { Notification, User } from '@/types'

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
      width: 1024,
      height: 768,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener() {},
      removeEventListener() {},
    },
    configurable: true,
  })
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

const makeNotification = (id: number, overrides: Record<string, unknown> = {}): Notification =>
  ({
    id,
    userId: 3,
    type: 'MATCH_FOUND',
    linkUrl: `/lost-reports/${id}`,
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

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/notificacoes', name: 'notifications', component: { template: '<div>Notifs</div>' } },
      { path: '/minhas-perdas/:id', name: 'lost-report-detail', component: { template: '<div>Perda</div>' } },
      { path: '/itens/:id', name: 'item-detail', component: { template: '<div>Item</div>' } },
      { path: '/admin/itens/:id', name: 'admin-item-detail', component: { template: '<div>AdminItem</div>' } },
    ],
  })
}

const mountedWrappers: Array<ReturnType<typeof mount>> = []

async function mountMenu() {
  const testRouter = makeRouter()
  await testRouter.push('/')
  await testRouter.isReady()
  const wrapper = mount(NotificationMenu, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, testRouter],
    },
  })
  mountedWrappers.push(wrapper)
  return { wrapper, testRouter }
}

async function openMenu(wrapper: ReturnType<typeof mount>) {
  const btn = wrapper.find('button[aria-label="Notificações"]')
  await btn.trigger('click')
  await flushPromises()
  await nextTick()
}

describe('NotificationMenu (Etapa 10 — Somente leitura e sem polling)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('T32 & T33 — exibe o sino somente para usuário autenticado e inicia polling apenas autenticado', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 3 })

    // Deslogado: sem sino e sem polling
    const { wrapper: unauthWrapper } = await mountMenu()
    await flushPromises()
    expect(unauthWrapper.find('button[aria-label="Notificações"]').exists()).toBe(false)
    expect(intervalSpy).not.toHaveBeenCalled()
    unauthWrapper.unmount()

    // Autenticado: exibe sino com exatamente um timer de polling
    setSession()
    const { wrapper } = await mountMenu()
    await flushPromises()
    expect(wrapper.find('button[aria-label="Notificações"]').exists()).toBe(true)
    expect(intervalSpy).toHaveBeenCalledTimes(1)
  })

  it('T34, T35, T38, T39 & T48 — prévia exibe no máximo 5 notificações com título derivado, link Ver todas e clicar no item não dispara PATCH', async () => {
    setSession()
    const all7 = [
      makeNotification(17, { type: 'MATCH_FOUND' }),
      makeNotification(16, { type: 'ITEM_CLAIMED', linkUrl: '/items/25' }),
      makeNotification(15, { type: 'REPORT_RESOLVED', readAt: '2026-11-13T10:00:00.000Z' }),
      makeNotification(14),
      makeNotification(13),
      makeNotification(12),
      makeNotification(11),
    ]
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValueOnce(all7 as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 6 })
    const markReadSpy = vi.spyOn(notificationService, 'markRead')
    const markAllSpy = vi.spyOn(notificationService, 'markAllRead')
    const markAsReadLegacy = vi.spyOn(notificationService, 'markAsRead')
    const markAllLegacy = vi.spyOn(notificationService, 'markAllAsRead')

    const { wrapper } = await mountMenu()
    await flushPromises()

    await openMenu(wrapper)

    expect(listSpy).toHaveBeenCalledTimes(1)
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('Ver todas as notificações')
    expect(bodyText).toContain('Possível correspondência encontrada')
    expect(bodyText).toContain('Item reconhecido por usuário')
    expect(bodyText).toContain('Perda resolvida')

    const renderedItems = document.body.querySelectorAll('.v-list-item')
    expect(renderedItems.length).toBeLessThanOrEqual(5)
    expect(renderedItems.length).toBe(5)

    // Store continua mantendo os 7 itens completos
    const store = useNotificationsStore()
    expect(store.items).toHaveLength(7)

    // Clicar em item não envia PATCH
    if (renderedItems[0]) {
      ;(renderedItems[0] as HTMLElement).click()
      await flushPromises()
    }
    expect(markReadSpy).not.toHaveBeenCalled()
    expect(markAllSpy).not.toHaveBeenCalled()
    expect(markAsReadLegacy).not.toHaveBeenCalled()
    expect(markAllLegacy).not.toHaveBeenCalled()
  })

  it('T36 & T37 — badge exibe contagem positiva, oculta em 0 e não exibe 0 confirmado quando há falha de contagem', async () => {
    setSession()
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 4 })
    const { wrapper } = await mountMenu()
    await flushPromises()

    const badge = wrapper.findComponent({ name: 'VBadge' })
    expect(badge.props('modelValue')).toBe(true)
    expect(badge.props('content')).toBe(4)

    wrapper.unmount()

    // Erro na contagem não mostra 0 confirmado
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
    setSession()
    vi.spyOn(notificationService, 'unreadCount').mockRejectedValueOnce(new AxiosError('Network', 'ERR_NETWORK'))
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([])

    const { wrapper: errWrapper } = await mountMenu()
    await flushPromises()
    await openMenu(errWrapper)

    const errBadge = errWrapper.findComponent({ name: 'VBadge' })
    expect(errBadge.props('modelValue')).toBe(false)
    expect(document.body.textContent).not.toContain('0 não lidas')
    expect(document.body.textContent).toContain('Contagem indisponível')
  })

  it('T41 & T42 — logout remove dados privados e troca de conta isola notificações do menu', async () => {
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    vi.spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })
    vi.spyOn(notificationService, 'list')
      .mockResolvedValueOnce([makeNotification(1, { userId: 3, type: 'MATCH_FOUND' })] as never)
      .mockResolvedValueOnce([makeNotification(2, { userId: 9, type: 'REPORT_RESOLVED' })] as never)

    const { wrapper } = await mountMenu()
    await flushPromises()
    await openMenu(wrapper)
    expect(document.body.textContent).toContain('Possível correspondência encontrada')

    auth.logout()
    await flushPromises()
    expect(wrapper.find('button[aria-label="Notificações"]').exists()).toBe(false)

    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1
    await flushPromises()

    await openMenu(wrapper)
    expect(document.body.textContent).not.toContain('Possível correspondência encontrada')
    expect(document.body.textContent).toContain('Perda resolvida')
  })

  it('Regressão 10.1 — sino usa cor primary sobre fundo surface para USER e ADMIN e fica oculto quando deslogado', async () => {
    // Deslogado: menu permanece oculto
    const { wrapper: unauthWrapper } = await mountMenu()
    await flushPromises()
    expect(unauthWrapper.find('button[aria-label="Notificações"]').exists()).toBe(false)
    unauthWrapper.unmount()

    for (const role of ['USER', 'ADMIN'] as const) {
      localStorage.clear()
      setActivePinia(createPinia())
      setSession(makeUser({ id: role === 'ADMIN' ? 2 : 3, role }), `token-${role}`)
      vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 2 })

      const { wrapper } = await mountMenu()
      await flushPromises()

      const bellBtn = wrapper.find('button[aria-label="Notificações"]')
      expect(bellBtn.exists()).toBe(true)

      const vBtn = wrapper.findComponent({ name: 'VBtn' })
      expect(vBtn.props('color')).toBe('primary')
      expect(vBtn.props('color')).not.toBe('on-primary')
      expect(bellBtn.classes()).not.toContain('text-on-primary')

      const bellIcon = vBtn.findComponent({ name: 'VIcon' })
      expect(bellIcon.props('icon')).toBe('mdi-bell-outline')
      expect(bellIcon.props('color')).toBe('primary')
      expect(bellIcon.props('color')).not.toBe('on-primary')
      expect(bellIcon.classes()).not.toContain('text-on-primary')

      const badge = wrapper.findComponent({ name: 'VBadge' })
      expect(badge.props('modelValue')).toBe(true)
      expect(badge.props('content')).toBe(2)

      wrapper.unmount()
      vi.restoreAllMocks()
    }
  })
})

describe('NotificationMenu (Etapa 11 — Leitura, sincronização com página e polling)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('U07, U09, U11, U12 & U15 — marcação individual no menu não navega ao destino, atualiza badge e oculta Marcar todas quando zerar', async () => {
    setSession()
    const n15 = makeNotification(15, { type: 'MATCH_FOUND', linkUrl: '/lost-reports/12', readAt: null })
    const n14 = makeNotification(14, { type: 'REPORT_RESOLVED', linkUrl: 'https://malicious.test', readAt: null })
    vi.spyOn(notificationService, 'list')
      .mockResolvedValueOnce([n15, n14] as never)
      .mockResolvedValueOnce([
        makeNotification(15, { readAt: '2026-11-14T20:00:00.000Z' }),
        makeNotification(14, { linkUrl: 'https://malicious.test', readAt: '2026-11-14T20:01:00.000Z' }),
      ] as never)
    vi.spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockResolvedValueOnce(makeNotification(15, { readAt: '2026-11-14T20:00:00.000Z' }) as never)
    const allSpy = vi.spyOn(notificationService, 'markAllRead').mockResolvedValueOnce(undefined)

    const { wrapper, testRouter } = await mountMenu()
    await flushPromises()
    const pushSpy = vi.spyOn(testRouter, 'push')

    await openMenu(wrapper)

    // U07 & U09: botão de marcação dentro do item clicável não navega nem dispara PATCH duas vezes
    const markItemBtn = document.body.querySelector(
      'button[aria-label="Marcar notificação 15 como lida"]',
    ) as HTMLElement | null
    expect(markItemBtn).not.toBeNull()
    markItemBtn!.click()
    await flushPromises()

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith(15)
    expect(pushSpy).not.toHaveBeenCalled()
    expect(testRouter.currentRoute.value.path).toBe('/')
    expect(wrapper.findComponent({ name: 'VBadge' }).props('content')).toBe(1)

    // U11 & U12: Marcar todas disponível para pendência restante e oculta quando zerado
    const markAllBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Marcar todas'),
    )
    expect(markAllBtn).toBeDefined()
    markAllBtn!.click()
    await flushPromises()

    expect(allSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'VBadge' }).props('modelValue')).toBe(false)
    const markAllAfter = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Marcar todas'),
    )
    expect(markAllAfter).toBeUndefined()
  })

  it('U06, U18 & P03..P05 — menu e página compartilham estado e mantêm somente um timer de polling ativo', async () => {
    vi.useFakeTimers()
    setSession()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    vi.spyOn(notificationService, 'list').mockResolvedValue([
      makeNotification(15, { type: 'MATCH_FOUND', readAt: null }),
    ] as never)
    const countSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 })

    const testRouter = makeRouter()
    await testRouter.push('/notificacoes')
    await testRouter.isReady()

    const menuWrapper = mount(NotificationMenu, {
      attachTo: document.body,
      global: { plugins: [vuetify, testRouter] },
    })
    const viewWrapper = mount(NotificationsView, {
      attachTo: document.body,
      global: { plugins: [vuetify, testRouter] },
    })
    mountedWrappers.push(menuWrapper, viewWrapper)
    await flushPromises()

    // Apenas 1 timer compartilhado por menu + página
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    // Marca na página -> badge e store do menu atualizam sem novo carregamento
    vi.spyOn(notificationService, 'markRead').mockResolvedValueOnce(
      makeNotification(15, { readAt: '2026-11-14T20:10:00.000Z' }) as never,
    )
    const pageMarkBtn = viewWrapper.findAll('button').find((b) => b.text().includes('Marcar como lida'))
    expect(pageMarkBtn).toBeDefined()
    await pageMarkBtn!.trigger('click')
    await flushPromises()

    expect(menuWrapper.findComponent({ name: 'VBadge' }).props('modelValue')).toBe(false)

    // Desmontar menu mantém timer da página; desmontar página remove último timer
    menuWrapper.unmount()
    expect(clearSpy).not.toHaveBeenCalled()
    const callsAfterMenuUnmount = countSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy.mock.calls.length).toBeGreaterThan(callsAfterMenuUnmount)

    const callsBeforeViewUnmount = countSpy.mock.calls.length
    viewWrapper.unmount()
    expect(clearSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS * 2)
    expect(countSpy).toHaveBeenCalledTimes(callsBeforeViewUnmount)
  })

  it('P13 & P14 — menu fechado faz polling só de contagem e abrir menu atualiza lista sem criar segundo timer', async () => {
    vi.useFakeTimers()
    setSession()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 2 })
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValue([makeNotification(15)] as never)

    const { wrapper } = await mountMenu()
    await flushPromises()
    expect(intervalSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(listSpy).not.toHaveBeenCalled()

    await openMenu(wrapper)
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    const callsBeforeUnmount = countSpy.mock.calls.length
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS * 2)
    expect(countSpy).toHaveBeenCalledTimes(callsBeforeUnmount)
  })
})
