import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router, RouterView } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { VApp, VAppBar } from 'vuetify/components'
import PublicLayout from '../PublicLayout.vue'
import AdminShell from '../AdminShell.vue'
import UserMenu from '../UserMenu.vue'
import { vuetify } from '@/theme'
import { useAuthStore } from '@/stores/authStore'
import { notificationService } from '@/services/notification.service'
import type { User } from '@/types'

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
      addEventListener() {},
      removeEventListener() {},
    },
    configurable: true,
  })
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

function setViewportWidth(width: number) {
  const happyDomWindow = window as unknown as {
    happyDOM?: { setViewport: (viewport: { width: number; height: number }) => void }
  }
  if (happyDomWindow.happyDOM?.setViewport) {
    happyDomWindow.happyDOM.setViewport({ width, height: 800 })
  }
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: PublicLayout,
        children: [
          { path: '', name: 'home', component: { template: '<div>Home</div>' } },
          { path: 'predios', name: 'buildings', component: { template: '<div>Prédios</div>' } },
          { path: 'minhas-perdas', name: 'my-lost-reports', component: { template: '<div>Perdas</div>' } },
          { path: 'entrar', name: 'login', component: { template: '<div>Entrar</div>' } },
          { path: 'registrar', name: 'register', component: { template: '<div>Registrar</div>' } },
          { path: 'perfil', name: 'profile', component: { template: '<div>Perfil</div>' } },
          { path: 'historico', name: 'my-handovers', component: { template: '<div>Histórico</div>' } },
          { path: 'notificacoes', name: 'notifications', component: { template: '<div>Notificações</div>' } },
        ],
      },
      {
        path: '/admin',
        component: AdminShell,
        children: [
          { path: '', redirect: '/admin/itens' },
          { path: 'itens', name: 'admin-items', component: { template: '<div>Admin Itens</div>' } },
          { path: 'perdas', name: 'admin-lost-reports', component: { template: '<div>Admin Perdas</div>' } },
          { path: 'predios', name: 'admin-buildings', component: { template: '<div>Admin Prédios</div>' } },
          { path: 'categorias', name: 'admin-categories', component: { template: '<div>Admin Categorias</div>' } },
          { path: 'entregas', name: 'admin-handovers', component: { template: '<div>Admin Entregas</div>' } },
          { path: 'regras-destinacao', name: 'admin-disposition-rules', component: { template: '<div>Admin Regras</div>' } },
          { path: 'destinacoes', name: 'admin-dispositions', component: { template: '<div>Admin Destinações</div>' } },
          { path: 'admins', name: 'admin-admins', component: { template: '<div>Admin Admins</div>' } },
        ],
      },
    ],
  })
}

const AppHost = defineComponent({
  setup() {
    return () => h(VApp, null, () => h(RouterView))
  },
})

const mountedWrappers: Array<ReturnType<typeof mount>> = []

describe('LayoutNavigation (Etapa 13.2 — Responsividade e navegação por papel)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ unreadCount: 0 })
    vi.spyOn(notificationService, 'list').mockResolvedValue([])
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    setViewportWidth(1280)
  })

  it('U13.2-01 — PublicLayout oferece menu mobile acessível em viewport estreito e navega para Prédios e Minhas perdas', async () => {
    setViewportWidth(390)
    const auth = useAuthStore()
    auth.token = 'token-user'
    auth.user = makeUser({ role: 'USER' })

    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mount(AppHost, {
      attachTo: document.body,
      global: { plugins: [vuetify, router] },
    })
    mountedWrappers.push(wrapper)
    await flushPromises()
    await nextTick()

    const toggleBtn = wrapper.find('button[aria-label="Abrir menu de navegação"]')
    expect(toggleBtn.exists()).toBe(true)

    await toggleBtn.trigger('click')
    await flushPromises()
    await nextTick()

    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('Itens')
    expect(drawer.text()).toContain('Prédios')
    expect(drawer.text()).toContain('Minhas perdas')

    const buildingsLink = drawer.findAll('a').find((a) => a.attributes('href') === '/predios')
    expect(buildingsLink).toBeDefined()
    await buildingsLink!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/predios')
    })
  })

  it('U13.2-02 — UserMenu exibe acesso ao Painel Administrativo apenas para ADMIN e SUPERADMIN', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const auth = useAuthStore()
    auth.token = 'token-user'
    auth.user = makeUser({ role: 'USER' })

    const MenuHost = defineComponent({
      setup() {
        return () => h(VApp, null, () => h(VAppBar, null, () => h(UserMenu)))
      },
    })

    const wrapper = mount(MenuHost, {
      attachTo: document.body,
      global: { plugins: [vuetify, router] },
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    await wrapper.find('button[aria-label="Menu do usuário"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).not.toContain('Painel Administrativo')

    auth.user = makeUser({ role: 'ADMIN' })
    await flushPromises()
    expect(document.body.textContent).toContain('Painel Administrativo')
  })

  it('U13.2-03 — AdminShell adapta drawer para temporary no mobile com botão de menu e preserva restrição de Administradores ao SUPERADMIN', async () => {
    setViewportWidth(390)
    const auth = useAuthStore()
    auth.token = 'token-admin'
    auth.user = makeUser({ role: 'ADMIN' })

    const router = createTestRouter()
    await router.push('/admin/predios')
    await router.isReady()

    const wrapper = mount(AppHost, {
      attachTo: document.body,
      global: { plugins: [vuetify, router] },
    })
    mountedWrappers.push(wrapper)
    await flushPromises()
    await nextTick()

    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('permanent')).toBe(false)
    expect(drawer.props('temporary')).toBe(true)

    const toggleBtn = wrapper.find('button[aria-label="Abrir menu administrativo"]')
    expect(toggleBtn.exists()).toBe(true)
    await toggleBtn.trigger('click')
    await flushPromises()

    expect(drawer.text()).toContain('Perdas')
    expect(drawer.text()).toContain('Prédios')
    expect(drawer.text()).not.toContain('Administradores')
    expect(drawer.text()).toContain('Voltar ao catálogo')
  })
})
