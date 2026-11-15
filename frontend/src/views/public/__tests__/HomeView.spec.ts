import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { VApp } from 'vuetify/components'
import PublicLayout from '@/components/layout/PublicLayout.vue'
import HomeView from '../HomeView.vue'
import LoginView from '../LoginView.vue'
import RegisterView from '../RegisterView.vue'
import { vuetify } from '@/theme'
import { api } from '@/services/api'
import { itemService } from '@/services/item.service'
import { buildingService } from '@/services/building.service'
import { categoryService } from '@/services/category.service'
import { authService } from '@/services/auth.service'
import { notificationService } from '@/services/notification.service'
import type { Building, Category, Page, PublicCatalogItem, User } from '@/types'

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

const sampleBuildings: Building[] = [
  {
    id: 1,
    name: 'Bloco Didático I',
    address: 'Av. José de Freitas Queiroz, 5003',
    pickupPoint: 'Secretaria Térreo',
    serviceHours: '08:00 às 17:00',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

const sampleCategories: Category[] = [
  { id: 1, name: 'Eletrônicos', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Documentos', createdAt: '2026-01-01T00:00:00.000Z' },
]

const sampleItems: PublicCatalogItem[] = [
  {
    id: 101,
    title: 'Calculadora Científica Casio',
    description: 'Encontrada na sala 3',
    status: 'AVAILABLE',
    foundAt: '2026-11-10T10:00:00.000Z',
    building: sampleBuildings[0],
    category: sampleCategories[0],
    photos: [],
  },
]

function makeItemsPage(items: PublicCatalogItem[] = sampleItems, total = items.length): Page<PublicCatalogItem> {
  return {
    data: items,
    pagination: {
      total,
      page: 1,
      per_page: 12,
      total_pages: total === 0 ? 0 : Math.ceil(total / 12),
    },
  }
}

function createPublicAppRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: PublicLayout,
        children: [
          { path: '', name: 'home', component: HomeView },
          { path: 'entrar', name: 'login', component: LoginView, meta: { guest: true } },
          { path: 'registrar', name: 'register', component: RegisterView, meta: { guest: true } },
          { path: 'itens/:id', name: 'item-detail', component: { template: '<div>Detalhe</div>' } },
          { path: 'predios', name: 'buildings', component: { template: '<div>Prédios</div>' } },
          { path: 'minhas-perdas', name: 'my-lost-reports', component: { template: '<div>Minhas Perdas</div>' } },
          { path: 'notificacoes', name: 'notifications', component: { template: '<div>Notificações</div>' } },
        ],
      },
    ],
  })
}

const AppHost = defineComponent({
  setup() {
    return () => h(VApp, null, { default: () => h(RouterView) })
  },
})

describe('HomeView e navegação de autenticação (Etapa 17.1)', () => {
  const mountedWrappers: VueWrapper[] = []
  let pinia = createPinia()

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    vi.restoreAllMocks()
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ unreadCount: 0 })
    vi.spyOn(notificationService, 'list').mockResolvedValue([])
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      const wrapper = mountedWrappers.pop()
      try {
        wrapper?.unmount()
      } catch {
        // Ignora erro de desmontagem quando o VDOM foi corrompido no modo RED
      }
    }
  })

  async function mountPublicApp(initialPath = '/') {
    const router = createPublicAppRouter()
    await router.push(initialPath)
    await router.isReady()

    const wrapper = mount(AppHost, {
      attachTo: document.body,
      global: {
        plugins: [pinia, vuetify, router],
      },
    })
    mountedWrappers.push(wrapper)
    await flushPromises()
    await nextTick()
    return { wrapper, router }
  }

  function findHeaderButton(wrapper: VueWrapper, href: string) {
    const appBar = wrapper.findComponent({ name: 'VAppBar' })
    return appBar.findAll('a').find((node) => node.attributes('href') === href)
  }

  it('HOME-01 — carrega itens, prédios e categorias válidos sem erro, sem loading preso e sem aviso de dense do Vuetify', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.spyOn(itemService, 'list').mockResolvedValue(makeItemsPage())
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Itens encontrados')
    expect(wrapper.text()).toContain('Calculadora Científica Casio')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).not.toContain('Carregando itens...')

    const allConsoleMessages = [
      ...warnSpy.mock.calls.map((args) => args.map(String).join(' ')),
      ...logSpy.mock.calls.map((args) => args.map(String).join(' ')),
    ].join('\n')

    expect(allConsoleMessages).not.toContain("'dense' is deprecated")
  })

  it('HOME-02 — catálogo vazio válido exibe EmptyState sem erro', async () => {
    vi.spyOn(itemService, 'list').mockResolvedValue(makeItemsPage([], 0))
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Nenhum item encontrado')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).not.toContain('Carregando itens...')
  })

  it('HOME-03 & HOME-12 — falha na API de itens exibe ErrorAlert, encerra loading e não mostra EmptyState', async () => {
    vi.spyOn(itemService, 'list').mockRejectedValue(new Error('Falha de rede'))
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).not.toContain('Carregando itens...')
    expect(wrapper.text()).not.toContain('Nenhum item encontrado')
  })

  it('HOME-04 & HOME-11 — resposta HTTP 200 com HTML é rejeitada sem exceção items.length e sem travar loading', async () => {
    const htmlResponse = '<!doctype html><html><head></head><body><div id="app"></div></body></html>'
    vi.spyOn(itemService, 'list').mockResolvedValue(htmlResponse as unknown as Page<PublicCatalogItem>)
    vi.spyOn(buildingService, 'list').mockResolvedValue(htmlResponse as unknown as Building[])
    vi.spyOn(categoryService, 'list').mockResolvedValue(htmlResponse as unknown as Category[])

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).toContain('Não foi possível carregar os prédios.')
    expect(wrapper.text()).toContain('Não foi possível carregar as categorias.')
    expect(wrapper.text()).not.toContain('Carregando itens...')
    expect(wrapper.text()).not.toContain('Nenhum item encontrado')
  })

  it('HOME-05 — resposta paginada malformada não quebra a renderização nem prende o spinner', async () => {
    vi.spyOn(itemService, 'list').mockResolvedValue({ data: undefined } as unknown as Page<PublicCatalogItem>)
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).not.toContain('Carregando itens...')
  })

  it('HOME-06 & HOME-15 — retry recupera listagem de itens com GET sem disparar nenhum POST', async () => {
    const listSpy = vi
      .spyOn(itemService, 'list')
      .mockRejectedValueOnce(new Error('Indisponível'))
      .mockResolvedValueOnce(makeItemsPage())
    const postSpy = vi.spyOn(api, 'post')
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')
    expect(wrapper.text()).toContain('Não foi possível carregar os dados')

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('Tentar novamente'))
    expect(retryBtn).toBeDefined()
    await retryBtn!.trigger('click')
    await flushPromises()
    await nextTick()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(postSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Calculadora Científica Casio')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
  })

  it('HOME-07 & HOME-08 — falhas isoladas de categoria e de prédio permitem recuperação independente', async () => {
    vi.spyOn(itemService, 'list').mockResolvedValue(makeItemsPage())
    const bSpy = vi
      .spyOn(buildingService, 'list')
      .mockRejectedValueOnce(new Error('Erro prédio'))
      .mockResolvedValueOnce(sampleBuildings)
    const cSpy = vi
      .spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('Erro categoria'))
      .mockResolvedValueOnce(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    expect(wrapper.text()).toContain('Calculadora Científica Casio')
    expect(wrapper.text()).toContain('Não foi possível carregar os prédios.')
    expect(wrapper.text()).toContain('Não foi possível carregar as categorias.')

    const retryButtons = wrapper.findAll('button').filter((b) => b.text().includes('Tentar novamente'))
    expect(retryButtons).toHaveLength(2)

    await retryButtons[0].trigger('click')
    await retryButtons[1].trigger('click')
    await flushPromises()
    await nextTick()

    expect(bSpy).toHaveBeenCalledTimes(2)
    expect(cSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')
  })

  it('HOME-09, HOME-10 & HOME-18 — falha simultânea nos 3 GETs não duplica ErrorAlert principal e recupera tudo no retry', async () => {
    vi.spyOn(itemService, 'list')
      .mockRejectedValueOnce(new Error('Erro itens'))
      .mockResolvedValueOnce(makeItemsPage())
    vi.spyOn(buildingService, 'list')
      .mockRejectedValueOnce(new Error('Erro prédios'))
      .mockResolvedValueOnce(sampleBuildings)
    vi.spyOn(categoryService, 'list')
      .mockRejectedValueOnce(new Error('Erro categorias'))
      .mockResolvedValueOnce(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    const mainErrorAlerts = wrapper.findAllComponents({ name: 'ErrorAlert' })
    expect(mainErrorAlerts).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Carregando itens...')

    await mainErrorAlerts[0].find('button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('Calculadora Científica Casio')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).not.toContain('Não foi possível carregar os prédios.')
    expect(wrapper.text()).not.toContain('Não foi possível carregar as categorias.')
  })

  it('HOME-16 & HOME-17 — preserva filtros no retry e ignora resposta obsoleta fora de ordem', async () => {
    let resolveSlowFilter!: (page: Page<PublicCatalogItem>) => void
    const listSpy = vi
      .spyOn(itemService, 'list')
      .mockResolvedValueOnce(makeItemsPage())
      .mockImplementationOnce(
        () =>
          new Promise<Page<PublicCatalogItem>>((resolve) => {
            resolveSlowFilter = resolve
          }),
      )
      .mockResolvedValueOnce(
        makeItemsPage([{ ...sampleItems[0], id: 202, title: 'Chaveiro Recente' }], 1),
      )

    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper } = await mountPublicApp('/')

    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('antigo')
    await wrapper.find('form').trigger('submit.prevent')

    await searchInput.setValue('recente')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('Chaveiro Recente')

    resolveSlowFilter(makeItemsPage([{ ...sampleItems[0], id: 999, title: 'Resultado Obsoleto' }], 1))
    await flushPromises()
    await nextTick()

    expect(listSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({ search: 'recente', page: 1, per_page: 12 }))
    expect(wrapper.text()).toContain('Chaveiro Recente')
    expect(wrapper.text()).not.toContain('Resultado Obsoleto')
  })

  it('AUTH-NAV-01 & AUTH-NAV-02 — botões Entrar e Criar conta navegam para /entrar e /registrar quando a API funciona', async () => {
    vi.spyOn(itemService, 'list').mockResolvedValue(makeItemsPage())
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)

    const { wrapper, router } = await mountPublicApp('/')

    const loginBtn = findHeaderButton(wrapper, '/entrar')
    expect(loginBtn).toBeDefined()
    await loginBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/entrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Entrar')
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)

    const registerBtn = findHeaderButton(wrapper, '/registrar')
    expect(registerBtn).toBeDefined()
    await registerBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/registrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Criar conta')
  })

  it('AUTH-NAV-03, AUTH-NAV-04, HOME-13 & HOME-14 — botões Entrar e Criar conta funcionam após falha de itens, prédios e categorias', async () => {
    vi.spyOn(itemService, 'list').mockRejectedValue(new Error('API offline'))
    vi.spyOn(buildingService, 'list').mockRejectedValue(new Error('API offline'))
    vi.spyOn(categoryService, 'list').mockRejectedValue(new Error('API offline'))

    const { wrapper, router } = await mountPublicApp('/')
    expect(wrapper.text()).toContain('Não foi possível carregar os dados')

    const loginBtn = findHeaderButton(wrapper, '/entrar')
    await loginBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/entrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Entrar')

    await router.push('/')
    await flushPromises()
    await nextTick()

    const registerBtn = findHeaderButton(wrapper, '/registrar')
    await registerBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/registrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Criar conta')
  })

  it('AUTH-NAV-05 — quando catálogo retorna HTML 200, a aplicação não quebra e navega para /entrar e /registrar', async () => {
    const html = '<!doctype html><html><body></body></html>'
    vi.spyOn(itemService, 'list').mockResolvedValue(html as unknown as Page<PublicCatalogItem>)
    vi.spyOn(buildingService, 'list').mockResolvedValue(html as unknown as Building[])
    vi.spyOn(categoryService, 'list').mockResolvedValue(html as unknown as Category[])

    const { wrapper, router } = await mountPublicApp('/')

    const loginBtn = findHeaderButton(wrapper, '/entrar')
    await loginBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/entrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Entrar')

    const registerBtn = findHeaderButton(wrapper, '/registrar')
    await registerBtn!.trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/registrar')
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('h1').text()).toBe('Criar conta')
  })

  it('AUTH-NAV-06, AUTH-NAV-07, AUTH-NAV-08 & AUTH-NAV-09 — acesso direto a /entrar e /registrar e submissão pelos endpoints corretos', async () => {
    const user: User = {
      id: 9,
      name: 'Maria Clara',
      email: 'maria@ufc.br',
      phone: '(88) 98888-7777',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.spyOn(itemService, 'list').mockResolvedValue(makeItemsPage())
    vi.spyOn(buildingService, 'list').mockResolvedValue(sampleBuildings)
    vi.spyOn(categoryService, 'list').mockResolvedValue(sampleCategories)
    const loginSpy = vi.spyOn(authService, 'login').mockResolvedValue({ token: 'jwt-maria', user })
    const registerSpy = vi.spyOn(authService, 'register').mockResolvedValue(user)

    const { wrapper, router } = await mountPublicApp('/entrar')
    expect(wrapper.find('h1').text()).toBe('Entrar')

    const loginInputs = wrapper.findAll('input')
    await loginInputs[0].setValue('maria@ufc.br')
    await loginInputs[1].setValue('SenhaForte123')
    await flushPromises()
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledWith({ email: 'maria@ufc.br', password: 'SenhaForte123' })

    const { wrapper: regWrapper } = await mountPublicApp('/registrar')
    expect(regWrapper.find('h1').text()).toBe('Criar conta')

    const regInputs = regWrapper.findAll('input')
    await regInputs[0].setValue('Maria Clara')
    await regInputs[1].setValue('maria@ufc.br')
    await regInputs[2].setValue('(88) 98888-7777')
    await regInputs[3].setValue('SenhaForte123')
    await regInputs[4].setValue('SenhaForte123')
    await flushPromises()
    await regWrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(registerSpy).toHaveBeenCalledWith({
      name: 'Maria Clara',
      email: 'maria@ufc.br',
      phone: '(88) 98888-7777',
      password: 'SenhaForte123',
    })
  })
})
