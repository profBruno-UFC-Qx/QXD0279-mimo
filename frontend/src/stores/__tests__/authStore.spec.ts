import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../authStore'
import { authService } from '@/services/auth.service'
import { api } from '@/services/api'
import router from '@/router'
import type { User } from '@/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

interface DeferredRequest {
  config: InternalAxiosRequestConfig
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
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

function makeHttpError(status: number, config?: InternalAxiosRequestConfig, details = 'Erro') {
  const reqConfig =
    config ??
    ({
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig)

  return new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    reqConfig,
    null,
    {
      status,
      statusText: String(status),
      headers: new AxiosHeaders(),
      config: reqConfig,
      data: {
        success: false,
        data: null,
        error: { code: status, details },
      },
    },
  )
}

function makeNetworkError(config?: InternalAxiosRequestConfig) {
  const reqConfig =
    config ??
    ({
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig)

  return new AxiosError('Network Error', 'ERR_NETWORK', reqConfig)
}

function makeOkEnvelope(data: unknown, config: InternalAxiosRequestConfig) {
  return {
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
    data: {
      success: true,
      data,
    },
  }
}

describe('authStore.fetchMe (Etapa 02.2 — Recuperação de sessão e concorrência)', () => {
  const originalAdapter = api.defaults.adapter

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
  })

  it('F01 — HTTP 500 durante fetchMe preserva token, localStorage e usuário', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-valid-a'
    localStorage.setItem('achadex.token', 'jwt-valid-a')
    const initialGeneration = auth.sessionGeneration

    vi.spyOn(authService, 'me').mockRejectedValueOnce(makeHttpError(500, undefined, 'Erro interno'))

    await auth.fetchMe()

    expect(auth.token).toBe('jwt-valid-a')
    expect(localStorage.getItem('achadex.token')).toBe('jwt-valid-a')
    expect(auth.user).toBeNull()
    expect(auth.sessionGeneration).toBe(initialGeneration)
  })

  it('F02 — Erro de rede preserva token e permite nova tentativa de fetchMe()', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Ana Rede' })
    auth.token = 'jwt-net-a'
    localStorage.setItem('achadex.token', 'jwt-net-a')
    const initialGeneration = auth.sessionGeneration

    const meSpy = vi
      .spyOn(authService, 'me')
      .mockRejectedValueOnce(makeNetworkError())
      .mockResolvedValueOnce(userA)

    await auth.fetchMe()

    expect(auth.token).toBe('jwt-net-a')
    expect(localStorage.getItem('achadex.token')).toBe('jwt-net-a')
    expect(auth.user).toBeNull()
    expect(auth.sessionGeneration).toBe(initialGeneration)

    await auth.fetchMe()

    expect(meSpy).toHaveBeenCalledTimes(2)
    expect(auth.user).toEqual(userA)
    expect(auth.token).toBe('jwt-net-a')
  })

  it('F03 — HTTP 401 da sessão atual invalida sessão sem efeito duplicado quando interceptor também atua', async () => {
    const auth = useAuthStore()

    // Caso 1: 401 em rota pública (ex.: durante guard inicial antes de entrar na rota protegida)
    await router.push('/')
    await router.isReady()

    auth.token = 'jwt-expired-1'
    auth.user = makeUser({ id: 1, name: 'Ana Expirada' })
    localStorage.setItem('achadex.token', 'jwt-expired-1')
    const genBeforePublic = auth.sessionGeneration

    api.defaults.adapter = async (config) => {
      throw makeHttpError(401, config, 'Não autenticado')
    }

    await auth.fetchMe()

    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('achadex.token')).toBeNull()
    expect(auth.sessionGeneration).toBe(genBeforePublic + 1)

    // Caso 2: 401 em rota protegida — interceptor já faz logout, fetchMe não deve duplicar
    auth.token = 'jwt-expired-2'
    auth.user = makeUser({ id: 1, name: 'Ana Protegida' })
    localStorage.setItem('achadex.token', 'jwt-expired-2')
    await router.push('/perfil')
    await router.isReady()

    const pushSpy = vi.spyOn(router, 'push')
    const genBeforeProtected = auth.sessionGeneration

    await auth.fetchMe()

    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('achadex.token')).toBeNull()
    expect(auth.sessionGeneration).toBe(genBeforeProtected + 1)
    expect(pushSpy).toHaveBeenCalledTimes(1)
  })

  it('F04 — Logout durante consulta: resposta atrasada não restaura user, token nem localStorage', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-a'
    localStorage.setItem('achadex.token', 'jwt-a')

    const deferred = createDeferred<User>()
    vi.spyOn(authService, 'me').mockReturnValueOnce(deferred.promise)

    const fetchPromise = auth.fetchMe()
    auth.logout()

    deferred.resolve(makeUser({ id: 1, name: 'Ana Tardia' }))
    await fetchPromise

    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('achadex.token')).toBeNull()
  })

  it('F05 — Troca de conta durante fetchMe: resposta da conta A não sobrescreve conta B', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })

    auth.token = 'jwt-a'
    localStorage.setItem('achadex.token', 'jwt-a')

    const deferredA = createDeferred<User>()
    vi.spyOn(authService, 'me').mockReturnValueOnce(deferredA.promise)
    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      token: 'jwt-b',
      user: userB,
    })

    const fetchPromise = auth.fetchMe()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })

    deferredA.resolve(userA)
    await fetchPromise

    expect(auth.token).toBe('jwt-b')
    expect(localStorage.getItem('achadex.token')).toBe('jwt-b')
    expect(auth.user).toEqual(userB)
  })

  it('F06 — Mesmo JWT em geração diferente: resposta antiga não sobrescreve nova sessão', async () => {
    const auth = useAuthStore()
    const sameJwt = 'deterministic-same-jwt'
    const oldPayload = makeUser({ id: 1, name: 'Nome Antigo Sessão 1' })
    const freshPayload = makeUser({ id: 1, name: 'Nome Atualizado Sessão 2' })

    auth.token = sameJwt
    localStorage.setItem('achadex.token', sameJwt)

    const deferredOld = createDeferred<User>()
    vi.spyOn(authService, 'me').mockReturnValueOnce(deferredOld.promise)
    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      token: sameJwt,
      user: freshPayload,
    })

    const fetchPromise = auth.fetchMe()
    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    deferredOld.resolve(oldPayload)
    await fetchPromise

    expect(auth.token).toBe(sameJwt)
    expect(auth.user).toEqual(freshPayload)
  })

  it('F07 — HTTP 401 obsoleto da sessão A não invalida sessão autenticada B', async () => {
    const auth = useAuthStore()
    const userB = makeUser({ id: 2, name: 'Conta B Ativa', email: 'b@ufc.br' })

    auth.token = 'jwt-a'
    auth.user = makeUser({ id: 1, name: 'Temp' })
    localStorage.setItem('achadex.token', 'jwt-a')
    await router.push('/perfil')
    await router.isReady()

    const queue: DeferredRequest[] = []
    api.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        queue.push({ config, resolve, reject })
      })

    const fetchPromiseA = auth.fetchMe()
    await flushMicrotasks()
    expect(queue).toHaveLength(1)

    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      token: 'jwt-b',
      user: userB,
    })
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    const generationB = auth.sessionGeneration

    queue[0].reject(makeHttpError(401, queue[0].config, 'Token A expirado'))
    await fetchPromiseA

    expect(auth.token).toBe('jwt-b')
    expect(localStorage.getItem('achadex.token')).toBe('jwt-b')
    expect(auth.user).toEqual(userB)
    expect(auth.sessionGeneration).toBe(generationB)
  })

  it('F08 — Consulta sem token não envia requisição nem altera estado', async () => {
    const auth = useAuthStore()
    const meSpy = vi.spyOn(authService, 'me')

    await auth.fetchMe()

    expect(meSpy).not.toHaveBeenCalled()
    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('achadex.token')).toBeNull()
  })

  it('F09 — Recuperação normal atualiza usuário e preserva token', async () => {
    const auth = useAuthStore()
    const expectedUser = makeUser({ id: 1, name: 'Ana Recuperada' })
    auth.token = 'jwt-valid'
    localStorage.setItem('achadex.token', 'jwt-valid')

    api.defaults.adapter = async (config) => makeOkEnvelope(expectedUser, config)

    await auth.fetchMe()

    expect(auth.user).toEqual(expectedUser)
    expect(auth.token).toBe('jwt-valid')
    expect(localStorage.getItem('achadex.token')).toBe('jwt-valid')
  })

  it('F10 — Erro recuperável seguido de sucesso mantém sessão e recupera usuário na segunda chamada', async () => {
    const auth = useAuthStore()
    const expectedUser = makeUser({ id: 1, name: 'Ana Após Falha' })
    auth.token = 'jwt-retry'
    localStorage.setItem('achadex.token', 'jwt-retry')

    vi.spyOn(authService, 'me')
      .mockRejectedValueOnce(makeHttpError(503, undefined, 'Serviço indisponível'))
      .mockResolvedValueOnce(expectedUser)

    await auth.fetchMe()
    expect(auth.token).toBe('jwt-retry')
    expect(auth.user).toBeNull()

    await auth.fetchMe()
    expect(auth.token).toBe('jwt-retry')
    expect(auth.user).toEqual(expectedUser)
  })
})
