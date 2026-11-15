import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import * as apiModule from '../api'
import { api } from '../api'
import { authService } from '../auth.service'
import { itemService } from '../item.service'
import { buildingService } from '../building.service'
import { categoryService } from '../category.service'
import { useAuthStore } from '@/stores/authStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { usePagination } from '@/composables/usePagination'
import router from '@/router'
import type { User } from '@/types'

interface DeferredRequest {
  config: InternalAxiosRequestConfig
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
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

function makeHttpError(status: number, config: InternalAxiosRequestConfig, details = 'Erro') {
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

function makeOkResponse(data: unknown, config: InternalAxiosRequestConfig) {
  return {
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
    data,
  }
}

describe('api interceptor (Etapa 02.1 — Isolamento de HTTP 401 por sessão)', () => {
  const originalAdapter = api.defaults.adapter

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
  })

  async function goToProtectedProfile(auth: ReturnType<typeof useAuthStore>) {
    vi.spyOn(auth, 'fetchMe').mockResolvedValue()
    await router.push('/perfil')
    await router.isReady()
  }

  async function goToPublicHome(auth: ReturnType<typeof useAuthStore>) {
    vi.spyOn(auth, 'fetchMe').mockResolvedValue()
    await router.push('/')
    await router.isReady()
  }

  function installDeferredAdapter() {
    const queue: DeferredRequest[] = []
    api.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        queue.push({ config, resolve, reject })
      })
    return queue
  }

  async function flushMicrotasks() {
    await Promise.resolve()
    await Promise.resolve()
  }

  it('A01 — HTTP 401 de requisição antiga não encerra sessão da conta B', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Conta A' })
    localStorage.setItem('achadex.token', 'token-a')

    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const reqA = api.get('/users/me')
    await flushMicrotasks()
    expect(queue).toHaveLength(1)

    auth.token = 'token-b'
    auth.user = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    localStorage.setItem('achadex.token', 'token-b')

    queue[0].reject(makeHttpError(401, queue[0].config, 'Não autenticado'))
    await expect(reqA).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('token-b')
    expect(auth.user?.id).toBe(2)
    expect(localStorage.getItem('achadex.token')).toBe('token-b')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A02 — Logout e novo login: 401 da requisição anterior não encerra a nova sessão', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: '123' })
    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const reqA = api.get('/users/me')
    await flushMicrotasks()
    expect(queue).toHaveLength(1)

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: '123' })

    queue[0].reject(makeHttpError(401, queue[0].config, 'Token inválido'))
    await expect(reqA).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('token-b')
    expect(auth.user?.id).toBe(2)
    expect(localStorage.getItem('achadex.token')).toBe('token-b')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A03 — HTTP 401 da sessão atual encerra sessão e redireciona preservando redirect', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Conta A' })
    localStorage.setItem('achadex.token', 'token-a')

    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const reqA = api.get('/users/me')
    await flushMicrotasks()
    expect(queue).toHaveLength(1)

    queue[0].reject(makeHttpError(401, queue[0].config, 'Não autenticado'))
    await expect(reqA).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('achadex.token')).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/perfil' },
    })
  })

  it('A04 — Requisição sem Authorization retorna 401 após login e não invalida a sessão nova', async () => {
    const auth = useAuthStore()
    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const anonReq = api.get('/users/me')
    await flushMicrotasks()
    expect(queue).toHaveLength(1)
    expect(queue[0].config.headers.Authorization).toBeUndefined()

    auth.token = 'token-b'
    auth.user = makeUser({ id: 2, name: 'Conta B' })
    localStorage.setItem('achadex.token', 'token-b')

    queue[0].reject(makeHttpError(401, queue[0].config, 'Não autenticado'))
    await expect(anonReq).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('token-b')
    expect(auth.user?.id).toBe(2)
    expect(localStorage.getItem('achadex.token')).toBe('token-b')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A05 — Erro HTTP 500 não executa logout nem redireciona', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser()
    localStorage.setItem('achadex.token', 'token-a')

    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const req = api.get('/users/me')
    await flushMicrotasks()
    queue[0].reject(makeHttpError(500, queue[0].config, 'Erro interno'))
    await expect(req).rejects.toMatchObject({ response: { status: 500 } })

    expect(auth.token).toBe('token-a')
    expect(auth.user?.id).toBe(1)
    expect(localStorage.getItem('achadex.token')).toBe('token-a')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A06 — HTTP 403 não encerra a sessão nem redireciona para login', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser()
    localStorage.setItem('achadex.token', 'token-a')

    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const req = api.get('/admin/items')
    await flushMicrotasks()
    queue[0].reject(makeHttpError(403, queue[0].config, 'Acesso negado'))
    await expect(req).rejects.toMatchObject({ response: { status: 403 } })

    expect(auth.token).toBe('token-a')
    expect(auth.user?.id).toBe(1)
    expect(localStorage.getItem('achadex.token')).toBe('token-a')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A07 — Resposta HTTP 200 continua desempacotando o envelope { success, data }', async () => {
    const user = makeUser({ name: 'Usuário Envelope' })
    const queue = installDeferredAdapter()

    const req = api.get<User>('/users/me')
    await flushMicrotasks()
    queue[0].resolve(makeOkResponse({ success: true, data: user }, queue[0].config))

    const res = await req
    expect(res.data).toEqual(user)
  })

  it('A08 — Resposta 401 em rota pública não dispara logout nem redirecionamento automático', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser()
    localStorage.setItem('achadex.token', 'token-a')

    await goToPublicHome(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const req = api.get('/users/me')
    await flushMicrotasks()
    queue[0].reject(makeHttpError(401, queue[0].config, 'Não autenticado'))
    await expect(req).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('token-a')
    expect(auth.user?.id).toBe(1)
    expect(localStorage.getItem('achadex.token')).toBe('token-a')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('A09 — Requisições independentes: identidade é fixada no envio e 401 de A não afeta B', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Conta A' })
    localStorage.setItem('achadex.token', 'token-a')

    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const reqA = api.get('/users/me')
    await flushMicrotasks()

    auth.token = 'token-b'
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    auth.user = userB
    localStorage.setItem('achadex.token', 'token-b')

    const reqB = api.get('/users/me')
    await flushMicrotasks()

    expect(queue).toHaveLength(2)
    expect(queue[0].config.headers.Authorization).toBe('Bearer token-a')
    expect(queue[1].config.headers.Authorization).toBe('Bearer token-b')

    queue[0].reject(makeHttpError(401, queue[0].config, 'Expirado'))
    await expect(reqA).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('token-b')
    expect(auth.user?.id).toBe(2)
    expect(pushSpy).not.toHaveBeenCalled()

    queue[1].resolve(makeOkResponse({ success: true, data: userB }, queue[1].config))
    const resB = await reqB
    expect(resB.data).toEqual(userB)
  })

  it('A10 — Troca de sessão com credencial reemitida (mesmo JWT string) não invalida a nova sessão', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'reused-jwt-token', user: userA })
      .mockResolvedValueOnce({ token: 'reused-jwt-token', user: userA })

    await auth.login({ email: 'a@ufc.br', password: '123' })
    await goToProtectedProfile(auth)
    const pushSpy = vi.spyOn(router, 'push')
    const queue = installDeferredAdapter()

    const reqOldSession = api.get('/users/me')
    await flushMicrotasks()
    expect(queue).toHaveLength(1)

    auth.logout()
    await auth.login({ email: 'a@ufc.br', password: '123' })

    queue[0].reject(makeHttpError(401, queue[0].config, 'Sessão anterior'))
    await expect(reqOldSession).rejects.toMatchObject({ response: { status: 401 } })

    expect(auth.token).toBe('reused-jwt-token')
    expect(auth.user?.id).toBe(1)
    expect(localStorage.getItem('achadex.token')).toBe('reused-jwt-token')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  describe('Configuração de baseURL e proteção de contrato HTTP (Etapa 17.1)', () => {
    const getResolver = () =>
      (apiModule as unknown as { resolveApiBaseUrl?: (val: unknown) => string }).resolveApiBaseUrl

    it('API-01 — VITE_API_URL ausente usa /api/v1 por padrão na instância e no resolvedor', () => {
      const resolveApiBaseUrl = getResolver()
      expect(resolveApiBaseUrl).toBeTypeOf('function')
      expect(resolveApiBaseUrl!(undefined)).toBe('/api/v1')
      expect(resolveApiBaseUrl!(null)).toBe('/api/v1')
      expect(api.defaults.baseURL).toBe('/api/v1')
    })

    it('API-02 — VITE_API_URL vazia ou apenas espaços usa /api/v1', () => {
      const resolveApiBaseUrl = getResolver()
      expect(resolveApiBaseUrl).toBeTypeOf('function')
      expect(resolveApiBaseUrl!('')).toBe('/api/v1')
      expect(resolveApiBaseUrl!('   ')).toBe('/api/v1')
    })

    it('API-03 — VITE_API_URL=/api/v1 é preservada sem barras finais duplicadas', () => {
      const resolveApiBaseUrl = getResolver()
      expect(resolveApiBaseUrl).toBeTypeOf('function')
      expect(resolveApiBaseUrl!('/api/v1')).toBe('/api/v1')
      expect(resolveApiBaseUrl!('/api/v1/')).toBe('/api/v1')
    })

    it('API-04 — URL explícita válida é respeitada', () => {
      const resolveApiBaseUrl = getResolver()
      expect(resolveApiBaseUrl).toBeTypeOf('function')
      expect(resolveApiBaseUrl!('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1')
      expect(resolveApiBaseUrl!('https://api.achadex.ufc.br/api/v1/')).toBe('https://api.achadex.ufc.br/api/v1')
    })

    it('API-05 — configuração inválida falha explicitamente sem redirecionar silenciosamente', () => {
      const resolveApiBaseUrl = getResolver()
      expect(resolveApiBaseUrl).toBeTypeOf('function')
      expect(() => resolveApiBaseUrl!('api/v1')).toThrow()
      expect(() => resolveApiBaseUrl!('/')).toThrow()
      expect(() => resolveApiBaseUrl!('//evil.example.com/api/v1')).toThrow()
      expect(() => resolveApiBaseUrl!('ftp://localhost:3000/api/v1')).toThrow()
      expect(() => resolveApiBaseUrl!('http://')).toThrow()
      expect(() => resolveApiBaseUrl!(123)).toThrow()
    })

    it('API-06, API-07, API-08, API-09 & API-10 — services de catálogo e auth atingem /api/v1/*', async () => {
      const queue = installDeferredAdapter()

      const pItems = itemService.list({ page: 1, per_page: 12 })
      const pBuildings = buildingService.list()
      const pCategories = categoryService.list()
      const pLogin = authService.login({ email: 'a@ufc.br', password: '123' })
      const pRegister = authService.register({
        name: 'Teste',
        email: 't@ufc.br',
        phone: '88999990000',
        password: '123',
      })

      await flushMicrotasks()
      expect(queue).toHaveLength(5)

      expect(api.getUri(queue[0].config)).toBe('/api/v1/items?page=1&per_page=12')
      expect(api.getUri(queue[1].config)).toBe('/api/v1/buildings')
      expect(api.getUri(queue[2].config)).toBe('/api/v1/categories')
      expect(api.getUri(queue[3].config)).toBe('/api/v1/auth/login')
      expect(api.getUri(queue[4].config)).toBe('/api/v1/auth/register')

      queue[0].resolve(
        makeOkResponse(
          { data: [], pagination: { total: 0, page: 1, per_page: 12, total_pages: 0 } },
          queue[0].config,
        ),
      )
      queue[1].resolve(makeOkResponse({ success: true, data: [] }, queue[1].config))
      queue[2].resolve(makeOkResponse({ success: true, data: [] }, queue[2].config))
      queue[3].resolve(
        makeOkResponse({ success: true, data: { token: 'jwt', user: makeUser() } }, queue[3].config),
      )
      queue[4].resolve(makeOkResponse({ success: true, data: makeUser() }, queue[4].config))

      await Promise.all([pItems, pBuildings, pCategories, pLogin, pRegister])
    })

    it('API-11 & API-12 — envelope {success, data} e respostas HTTP 204 continuam funcionando', async () => {
      const queue = installDeferredAdapter()

      const reqEnvelope = api.get('/buildings')
      const reqNoContent = api.delete('/buildings/1')
      await flushMicrotasks()

      queue[0].resolve(makeOkResponse({ success: true, data: [{ id: 1, name: 'Bloco 1' }] }, queue[0].config))
      queue[1].resolve({
        status: 204,
        statusText: 'No Content',
        headers: new AxiosHeaders(),
        config: queue[1].config,
        data: '',
      })

      const res1 = await reqEnvelope
      const res2 = await reqNoContent
      expect(res1.data).toEqual([{ id: 1, name: 'Bloco 1' }])
      expect(res2.status).toBe(204)
    })

    it('API-14 — resposta HTML 200 não corrompe stores de catálogo nem paginação de itens', async () => {
      const htmlBody = '<!doctype html><html><head><title>Achadex</title></head><body><div id="app"></div></body></html>'
      const queue = installDeferredAdapter()

      const buildingsStore = useBuildingsStore()
      const categoriesStore = useCategoriesStore()
      const pagination = usePagination(itemService.list)

      const pBuildings = buildingsStore.ensureLoaded(true)
      const pCategories = categoriesStore.ensureLoaded(true)
      const pItems = pagination.load()

      await flushMicrotasks()
      expect(queue).toHaveLength(3)

      queue[0].resolve(makeOkResponse(htmlBody, queue[0].config))
      queue[1].resolve(makeOkResponse(htmlBody, queue[1].config))
      queue[2].resolve(makeOkResponse(htmlBody, queue[2].config))

      await Promise.all([pBuildings, pCategories, pItems])

      expect(buildingsStore.error).toBe(true)
      expect(buildingsStore.items).toEqual([])
      expect(categoriesStore.error).toBe(true)
      expect(categoriesStore.items).toEqual([])
      expect(pagination.error.value).toBe(true)
      expect(Array.isArray(pagination.items.value)).toBe(true)
      expect(pagination.items.value).toEqual([])
    })
  })
})
