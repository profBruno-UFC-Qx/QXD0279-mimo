import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { authService } from '../auth.service'
import { useAuthStore } from '@/stores/authStore'
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
})
