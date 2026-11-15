import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { NOTIFICATIONS_POLL_INTERVAL_MS, useNotificationsStore } from '../notificationsStore'
import { useAuthStore } from '../authStore'
import { notificationService } from '@/services/notification.service'
import type { Notification, User } from '@/types'

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

function makeHttpError(status: number, details = 'Internal error') {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    data: { success: false, data: null, error: { code: status, details } },
  })
}

describe('useNotificationsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('T01, T05, T12 & T13 — fetchAll e fetchUnreadCount carregam array direto e { count } preservando ordem do backend', async () => {
    setSession()
    const list = [
      makeNotification({ id: 20, readAt: null, createdAt: '2026-11-14T16:00:00.000Z' }),
      makeNotification({
        id: 14,
        type: 'REPORT_RESOLVED',
        readAt: '2026-11-13T10:00:00.000Z',
        createdAt: '2026-11-13T09:00:00.000Z',
      }),
    ]
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce(list as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 4 })

    const store = useNotificationsStore()
    await Promise.all([store.fetchAll(), store.fetchUnreadCount()])

    expect(store.items).toEqual(list)
    expect(store.unreadCount).toBe(4)
    expect(store.error).toBeNull()
    expect(store.countError).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('T06, T08, T09, T10 & T11 — rejeita lista corrompida, IDs duplicados, userId terceiro e count inválido sem mascarar erro como zero', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()

    for (const badList of [
      { data: [] },
      [makeNotification({ id: 15, userId: 3 }), { id: 16 }],
      [makeNotification({ id: 15, userId: 3 }), makeNotification({ id: 15, userId: 3 })],
      [makeNotification({ id: 15, userId: 3 }), makeNotification({ id: 16, userId: 99 })],
    ]) {
      vi.spyOn(notificationService, 'list').mockResolvedValueOnce(badList as never)
      await store.fetchAll()
      expect(store.items).toEqual([])
      expect(store.error).toBe('Não foi possível carregar suas notificações.')
    }

    for (const badCount of [{ count: -1 }, { count: 1.5 }, { count: '4' }, { unreadCount: 4 }, {}]) {
      vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce(badCount as never)
      await store.fetchUnreadCount()
      expect(store.unreadCount).not.toBe(0)
      expect(store.countError).toBeTruthy()
    }
  })

  it('T28, T29, T31 & T37 — erro HTTP/rede preserva mensagem genérica sem vazar internals e sem logout duplicado em 401', async () => {
    const auth = setSession()
    const logoutSpy = vi.spyOn(auth, 'logout')
    const store = useNotificationsStore()

    vi.spyOn(notificationService, 'list').mockRejectedValueOnce(makeHttpError(500, 'SQLITE_BUSY leak'))
    await store.fetchAll()
    expect(store.error).toBe('Não foi possível carregar suas notificações.')
    expect(store.error).not.toContain('SQLITE_BUSY')

    vi.spyOn(notificationService, 'unreadCount').mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    await store.fetchUnreadCount()
    expect(store.unreadCount).not.toBe(0)
    expect(store.countError).toBeTruthy()

    vi.spyOn(notificationService, 'list').mockRejectedValueOnce(makeHttpError(401, 'Unauthorized'))
    await store.fetchAll()
    expect(logoutSpy).not.toHaveBeenCalled()
  })

  it('T40 — instanciar a store sem consumidor não inicia setInterval ou polling automático', () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    setSession()
    useNotificationsStore()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('T41, T42, T43, T44, T45 & T46 — isolamento total entre logout, troca de conta, nova sessionGeneration e GETs fora de ordem', async () => {
    // 1) Logout durante GET apaga dados e descarta resposta tardia
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    const store = useNotificationsStore()
    let resolveA!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((r) => (resolveA = r)) as never,
    )

    const pA = store.fetchAll()
    auth.logout()
    expect(store.items).toEqual([])
    expect(store.unreadCount).toBeNull()

    resolveA([makeNotification({ id: 1, userId: 3 })])
    await pA
    expect(store.items).toEqual([])

    // 2) Logout + login rápido para conta B (T46 & T42)
    auth.token = 'token-a'
    auth.user = makeUser({ id: 3 })
    auth.sessionGeneration += 1

    let resolveLateA!: (v: Notification[]) => void
    let resolveB!: (v: Notification[]) => void
    let resolveCountA!: (v: { count: number }) => void
    let resolveCountB!: (v: { count: number }) => void

    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveLateA = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveB = r)) as never)
    vi.spyOn(notificationService, 'unreadCount')
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveCountA = r)))
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveCountB = r)))

    const reqListA = store.fetchAll()
    const reqCountA = store.fetchUnreadCount()

    auth.logout()
    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1

    const reqListB = store.fetchAll()
    const reqCountB = store.fetchUnreadCount()

    resolveLateA([makeNotification({ id: 50, userId: 3 })])
    resolveCountA({ count: 9 })
    await Promise.all([reqListA, reqCountA])

    expect(store.items).toEqual([])
    expect(store.loading).toBe(true)

    const itemB = makeNotification({ id: 77, userId: 9 })
    resolveB([itemB])
    resolveCountB({ count: 2 })
    await Promise.all([reqListB, reqCountB])

    expect(store.items).toEqual([itemB])
    expect(store.unreadCount).toBe(2)
    expect(store.loading).toBe(false)

    // 3) Mesmo JWT e userId em nova sessionGeneration descarta resposta antiga (T43)
    const tokenFixo = 'jwt-identico'
    auth.token = tokenFixo
    auth.user = makeUser({ id: 9 })
    auth.sessionGeneration += 1
    let resolveOldGen!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((r) => (resolveOldGen = r)) as never,
    )
    const reqOldGen = store.fetchAll()
    auth.sessionGeneration += 1
    resolveOldGen([makeNotification({ id: 88, userId: 9 })])
    await reqOldGen
    expect(store.items).toEqual([])

    // 4) GET 1 e GET 2 na mesma sessão fora de ordem (T44 & T45)
    let resolve1!: (v: Notification[]) => void
    let resolve2!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolve1 = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolve2 = r)) as never)

    const p1 = store.fetchAll()
    const p2 = store.fetchAll()

    const newestItem = makeNotification({ id: 102, userId: 9 })
    const olderItem = makeNotification({ id: 101, userId: 9 })

    resolve2([newestItem])
    await p2
    expect(store.items).toEqual([newestItem])
    expect(store.loading).toBe(false)

    resolve1([olderItem])
    await p1
    expect(store.items).toEqual([newestItem])
    expect(store.loading).toBe(false)
  })
})

describe('useNotificationsStore (Etapa 11 — Marcação como lida e concorrência)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('M06, M07 & M19 — markRead valida DTO HTTP 200, atualiza apenas o item alvo e reconcilia contagem sem alterar outros itens', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = [
      makeNotification({ id: 15, userId: 3, readAt: null }),
      makeNotification({ id: 16, userId: 3, readAt: null }),
    ]
    store.unreadCount = 2

    const updated15 = makeNotification({
      id: 15,
      userId: 3,
      readAt: '2026-11-14T18:30:00.000Z',
    })
    const patchSpy = vi.spyOn(notificationService, 'markRead').mockResolvedValueOnce(updated15 as never)
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 1 })

    const ok = await store.markRead(15)

    expect(ok).toBe(true)
    expect(patchSpy).toHaveBeenCalledWith(15)
    expect(countSpy).toHaveBeenCalledTimes(1)
    expect(store.items.find((n) => n.id === 15)?.readAt).toBe('2026-11-14T18:30:00.000Z')
    expect(store.items.find((n) => n.id === 16)?.readAt).toBeNull()
    expect(store.unreadCount).toBe(1)
    expect(store.items.filter((n) => n.readAt === null).map((n) => n.id)).toEqual([16])
    expect(store.items.filter((n) => n.readAt !== null).map((n) => n.id)).toEqual([15])
  })

  it('M08 — rejeita DTO 200 inconsistente (null, id diferente, userId terceiro, readAt null ou timestamp inválido) e ID inválido sem PATCH', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const original15 = makeNotification({ id: 15, userId: 3, readAt: null })
    store.items = [original15]
    store.unreadCount = 1

    const invalidPatchSpy = vi.spyOn(notificationService, 'markRead')
    for (const badId of [0, -1, 1.5, Number.NaN]) {
      const res = await store.markRead(badId)
      expect(res).toBe(false)
    }
    expect(invalidPatchSpy).not.toHaveBeenCalled()

    for (const badDto of [
      null,
      makeNotification({ id: 99, userId: 3, readAt: '2026-11-14T18:30:00.000Z' }),
      makeNotification({ id: 15, userId: 9, readAt: '2026-11-14T18:30:00.000Z' }),
      makeNotification({ id: 15, userId: 3, readAt: null }),
      makeNotification({ id: 15, userId: 3, readAt: 'invalido' }),
    ]) {
      vi.spyOn(notificationService, 'markRead').mockResolvedValueOnce(badDto as never)
      const ok = await store.markRead(15)
      expect(ok).toBe(false)
      expect(store.items[0].readAt).toBeNull()
      expect(store.writeError).toBeTruthy()
    }
  })

  it('M09 & M10 — bloqueia duplo PATCH no mesmo ID e preserva operações simultâneas em IDs diferentes', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = [
      makeNotification({ id: 15, userId: 3, readAt: null }),
      makeNotification({ id: 16, userId: 3, readAt: null }),
    ]
    store.unreadCount = 2

    let resolve15!: (v: Notification) => void
    let resolve16!: (v: Notification) => void
    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolve15 = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolve16 = r)) as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 0 })

    const p15First = store.markRead(15)
    const p15Dup = store.markRead(15)
    expect(store.pendingReadIds.has(15)).toBe(true)

    const p16 = store.markRead(16)
    expect(store.pendingReadIds.has(16)).toBe(true)
    expect(patchSpy).toHaveBeenCalledTimes(2)
    expect(await p15Dup).toBe(false)

    resolve15(makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T18:00:00.000Z' }))
    resolve16(makeNotification({ id: 16, userId: 3, readAt: '2026-11-14T18:00:05.000Z' }))
    const [ok15, ok16] = await Promise.all([p15First, p16])

    expect(ok15).toBe(true)
    expect(ok16).toBe(true)
    expect(store.items.every((n) => n.readAt !== null)).toBe(true)
    expect(store.pendingReadIds.size).toBe(0)
  })

  it('M11, M12, M18 & M23 — markAllRead reconcilia via GET após 204, evita PATCH com 0 não lidas, preserva nova notificação e recupera falha pós-204 só com GET', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = []
    store.unreadCount = 0

    // M12: 0 não lidas confirmadas -> não envia PATCH redundante
    const allSpy = vi.spyOn(notificationService, 'markAllRead')
    expect(await store.markAllRead()).toBe(false)
    expect(allSpy).not.toHaveBeenCalled()

    // M11 & M18: PATCH 204 reconcilia e respeita notificação recém-chegada (> 0)
    store.items = [makeNotification({ id: 15, userId: 3, readAt: null })]
    store.unreadCount = 1
    allSpy.mockResolvedValueOnce(undefined)
    const freshArrived = makeNotification({ id: 22, userId: 3, readAt: null })
    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T18:10:00.000Z' })
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValueOnce([freshArrived, read15] as never)
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 1 })

    const ok = await store.markAllRead()
    expect(ok).toBe(true)
    expect(allSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(countSpy).toHaveBeenCalledTimes(1)
    expect(store.unreadCount).toBe(1)
    expect(store.items).toEqual([freshArrived, read15])

    // M23: PATCH 204 OK + falha no GET -> erro de sincronização e retry apenas com GET
    allSpy.mockResolvedValueOnce(undefined)
    listSpy.mockRejectedValueOnce(new AxiosError('Network', 'ERR_NETWORK'))
    countSpy.mockResolvedValueOnce({ count: 0 })

    const syncOk = await store.markAllRead()
    expect(syncOk).toBe(false)
    expect(store.reconcilePendingAfterMarkAll).toBe(true)
    expect(store.writeError).toContain('marcadas no servidor')
    expect(allSpy).toHaveBeenCalledTimes(2)

    listSpy.mockResolvedValueOnce([read15] as never)
    countSpy.mockResolvedValueOnce({ count: 0 })
    const retryOk = await store.retryReconcile()
    expect(retryOk).toBe(true)
    expect(allSpy).toHaveBeenCalledTimes(2)
    expect(store.reconcilePendingAfterMarkAll).toBe(false)
    expect(store.writeError).toBeNull()
  })

  it('M13 & M14 — exclusão mútua entre marcação em lote e marcação individual', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = [
      makeNotification({ id: 15, userId: 3, readAt: null }),
      makeNotification({ id: 16, userId: 3, readAt: null }),
    ]
    store.unreadCount = 2

    // M13: markAllRead bloqueado enquanto markRead(15) está pendente
    let resolveSingle!: (v: Notification) => void
    vi.spyOn(notificationService, 'markRead').mockImplementationOnce(
      () => new Promise<Notification>((r) => (resolveSingle = r)) as never,
    )
    const allSpy = vi.spyOn(notificationService, 'markAllRead').mockResolvedValue(undefined)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 1 })

    const pSingle = store.markRead(15)
    expect(await store.markAllRead()).toBe(false)
    expect(allSpy).not.toHaveBeenCalled()

    resolveSingle(makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T18:20:00.000Z' }))
    await pSingle

    // M14: markRead(16) bloqueado enquanto markAllRead está pendente
    let resolveBatch!: () => void
    allSpy.mockImplementationOnce(() => new Promise<void>((r) => (resolveBatch = r)))
    vi.spyOn(notificationService, 'list').mockResolvedValueOnce([])
    const patchSpy = vi.spyOn(notificationService, 'markRead')
    patchSpy.mockClear()

    const pBatch = store.markAllRead()
    expect(store.markingAll).toBe(true)
    expect(await store.markRead(16)).toBe(false)
    expect(patchSpy).not.toHaveBeenCalled()

    resolveBatch()
    await pBatch
    expect(store.markingAll).toBe(false)
  })

  it('M15, M16 & M17 — GET antigo de lista/contagem iniciado antes do PATCH não ressuscita estado não lido nem apaga escrita', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    store.items = [unread15]
    store.unreadCount = 1

    let resolveOldList!: (v: Notification[]) => void
    let resolveOldCount!: (v: { count: number }) => void
    let resolveNewCount!: (v: { count: number }) => void

    const listSpy = vi
      .spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveOldList = r)) as never)
    const countSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveOldCount = r)))
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveNewCount = r)))

    const pOldList = store.fetchAll()
    const pOldCount = store.fetchUnreadCount()

    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T18:25:00.000Z' })
    vi.spyOn(notificationService, 'markRead').mockResolvedValueOnce(read15 as never)
    const pPatch = store.markRead(15)
    await flushMicrotasks()
    resolveNewCount({ count: 0 })
    await pPatch

    // Agora resolve o GET antigo por último: não pode voltar a readAt null nem unreadCount 1!
    resolveOldList([unread15])
    resolveOldCount({ count: 5 })
    await Promise.all([pOldList, pOldCount])

    expect(store.items[0].readAt).toBe('2026-11-14T18:25:00.000Z')
    expect(store.unreadCount).toBe(0)

    // M17: GET antigo após markAllRead não sobrescreve reconciliação posterior
    store.items = [makeNotification({ id: 18, userId: 3, readAt: null })]
    store.unreadCount = 1
    let resolvePreBatchList!: (v: Notification[]) => void
    listSpy
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolvePreBatchList = r)) as never)
      .mockResolvedValueOnce([makeNotification({ id: 18, userId: 3, readAt: '2026-11-14T18:30:00.000Z' })] as never)
    countSpy.mockResolvedValueOnce({ count: 0 })
    vi.spyOn(notificationService, 'markAllRead').mockResolvedValueOnce(undefined)

    const pPreBatch = store.fetchAll()
    await store.markAllRead()

    resolvePreBatchList([makeNotification({ id: 18, userId: 3, readAt: null })])
    await pPreBatch
    expect(store.items[0].readAt).toBe('2026-11-14T18:30:00.000Z')
    expect(store.unreadCount).toBe(0)
  })

  it('M20, M21 & M22 — HTTP 404, 500 e falha de rede exibem mensagens seguras sem retry automático de PATCH', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = [makeNotification({ id: 15, userId: 3, readAt: null })]
    store.unreadCount = 1

    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockRejectedValueOnce(makeHttpError(404, 'owned by user 99'))
      .mockRejectedValueOnce(makeHttpError(500, 'SQLITE_BUSY leak'))
      .mockRejectedValueOnce(new AxiosError('Network', 'ERR_NETWORK'))

    expect(await store.markRead(15)).toBe(false)
    expect(store.writeError).toBe('Notificação não encontrada.')
    expect(store.writeError).not.toContain('user 99')

    expect(await store.markRead(15)).toBe(false)
    expect(store.writeError).toBe('Não foi possível atualizar a notificação. Verifique o estado e tente novamente.')
    expect(store.writeError).not.toContain('SQLITE_BUSY')

    expect(await store.markRead(15)).toBe(false)
    expect(store.items[0].readAt).toBeNull()
    expect(store.writeError).toContain('Verifique o estado')
    expect(patchSpy).toHaveBeenCalledTimes(3)
  })

  it('M24, M25, M26 & M27 — logout, troca de conta e nova sessionGeneration invalidam PATCH em voo e protegem estado da nova sessão', async () => {
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    const store = useNotificationsStore()
    store.items = [makeNotification({ id: 15, userId: 3, readAt: null })]
    store.unreadCount = 1

    // M24 & M27: logout + nova sessão iniciando PATCH no mesmo ID 15
    let resolvePatchA!: (v: Notification) => void
    let resolvePatchB!: (v: Notification) => void
    vi.spyOn(notificationService, 'markRead')
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolvePatchA = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolvePatchB = r)) as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 0 })

    const pA = store.markRead(15)
    auth.logout()
    expect(store.items).toEqual([])
    expect(store.pendingReadIds.size).toBe(0)

    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1
    store.items = [makeNotification({ id: 15, userId: 9, readAt: null })]
    store.unreadCount = 1

    const pB = store.markRead(15)
    expect(store.pendingReadIds.has(15)).toBe(true)

    // Patch A resolve após sessão B iniciar no mesmo ID 15: não pode limpar pendingReadIds de B!
    resolvePatchA(makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T18:40:00.000Z' }))
    await pA
    expect(store.pendingReadIds.has(15)).toBe(true)
    expect(store.items[0].userId).toBe(9)
    expect(store.items[0].readAt).toBeNull()

    resolvePatchB(makeNotification({ id: 15, userId: 9, readAt: '2026-11-14T18:41:00.000Z' }))
    await pB
    expect(store.pendingReadIds.size).toBe(0)
    expect(store.items[0].readAt).toBe('2026-11-14T18:41:00.000Z')

    // M24/M26: markAllRead 204 tardio com mesmo JWT mas nova sessionGeneration não dispara GET de reconciliação
    let resolveBatchOld!: () => void
    vi.spyOn(notificationService, 'markAllRead').mockImplementationOnce(
      () => new Promise<void>((r) => (resolveBatchOld = r)),
    )
    const listAfterLogoutSpy = vi.spyOn(notificationService, 'list')
    store.items = [makeNotification({ id: 19, userId: 9, readAt: null })]
    store.unreadCount = 1
    const pBatchOld = store.markAllRead()
    auth.sessionGeneration += 1

    resolveBatchOld()
    await pBatchOld
    expect(listAfterLogoutSpy).not.toHaveBeenCalled()
  })
})

describe('useNotificationsStore (Etapa 11 — Polling centralizado e ciclo de vida)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('P01, P02, P03, P04, P05 & P18 — único timer para múltiplos consumidores, sobrevive ao 1º desmonte e limpa ao último desmonte', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const store = useNotificationsStore()

    // P02: sem autenticação ou token sem usuário não cria timer
    const stopGuest = store.startPolling({ includeList: true })
    expect(intervalSpy).not.toHaveBeenCalled()
    stopGuest()

    const auth = useAuthStore()
    auth.token = 'only-token-no-user'
    const stopPartial = store.startPolling({ includeList: true })
    expect(intervalSpy).not.toHaveBeenCalled()
    stopPartial()

    // P01 & P03: sessão válida + 2 consumidores => exatamente 1 setInterval
    setSession(makeUser({ id: 3 }), 'token-a')
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 2 })
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValue([])

    const stopConsumer1 = store.startPolling({ includeList: false })
    const stopConsumer2 = store.startPolling({ includeList: true })
    expect(intervalSpy).toHaveBeenCalledTimes(1)
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), NOTIFICATIONS_POLL_INTERVAL_MS)

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledTimes(1)

    // P04: desmonta consumidor 1 -> timer continua ativo para consumidor 2
    stopConsumer1()
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(clearSpy).not.toHaveBeenCalled()

    // P05: desmonta último consumidor -> timer removido
    stopConsumer2()
    expect(clearSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS * 2)
    expect(countSpy).toHaveBeenCalledTimes(2)

    // P18: repetição de montagem não deixa timers órfãos
    for (let i = 0; i < 4; i++) {
      const s1 = store.startPolling({ includeList: false })
      const s2 = store.startPolling({ includeList: true })
      s1()
      s2()
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('P06, P07 & P08 — logout, troca de conta e nova sessionGeneration destroem timer antigo imediatamente', async () => {
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    const store = useNotificationsStore()
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 1 })
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')

    const stop = store.startPolling({ includeList: false })
    expect(vi.getTimerCount()).toBe(1)

    auth.logout()
    expect(clearSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS * 2)
    expect(countSpy).not.toHaveBeenCalled()

    // Nova conta B -> novo timer isolado; mesma token com nova geração invalida anterior
    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)

    const prevGen = auth.sessionGeneration
    auth.sessionGeneration = prevGen + 1
    await Promise.resolve()
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(2)

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('P09, P10, P11, P12, P13 & P17 — evita sobreposição, respeita PATCH pendente, reduz chamadas com menu fechado e resolve corridas', async () => {
    setSession(makeUser({ id: 3 }), 'token-a')
    const store = useNotificationsStore()

    // P13: consumidor apenas com includeList = false (menu fechado) consulta somente unreadCount
    const listSpy = vi.spyOn(notificationService, 'list').mockResolvedValue([])
    const countSpy = vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 3 })
    let menuOpenFlag = false
    const stopMenu = store.startPolling({ includeList: () => menuOpenFlag })

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).not.toHaveBeenCalled()

    menuOpenFlag = true
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(listSpy).toHaveBeenCalledTimes(1)

    // P09: GET pendente impede novo GET sobreposto em ticks seguintes
    let resolveSlowCount!: (v: { count: number }) => void
    countSpy.mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveSlowCount = r)))
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(3)
    resolveSlowCount({ count: 3 })
    await flushMicrotasks()

    // P10 & P11: PATCH pendente pula tick sem bloquear ticks após conclusão
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    store.items = [unread15]
    let resolvePatch!: (v: Notification) => void
    vi.spyOn(notificationService, 'markRead').mockImplementationOnce(
      () => new Promise<Notification>((r) => (resolvePatch = r)) as never,
    )
    const pPatch = store.markRead(15)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(3)

    resolvePatch(makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T19:00:00.000Z' }))
    countSpy.mockResolvedValue({ count: 0 })
    await pPatch
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy.mock.calls.length).toBeGreaterThanOrEqual(5)

    // P12: erro de rede no polling não cria retry loop nem desloga
    const callsBeforeErr = countSpy.mock.calls.length
    countSpy.mockRejectedValueOnce(new AxiosError('Network', 'ERR_NETWORK'))
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    expect(countSpy).toHaveBeenCalledTimes(callsBeforeErr + 1)
    expect(useAuthStore().isAuthenticated).toBe(true)

    // P17: corrida Polling GET -> PATCH começa/termina -> Polling GET antigo termina
    const unread20 = makeNotification({ id: 20, userId: 3, readAt: null })
    const read20 = makeNotification({ id: 20, userId: 3, readAt: '2026-11-14T19:10:00.000Z' })
    store.items = [unread20]
    let resolveStalePollList!: (v: Notification[]) => void
    listSpy.mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveStalePollList = r)) as never)

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    vi.spyOn(notificationService, 'markRead').mockResolvedValueOnce(read20 as never)
    await store.markRead(20)
    resolveStalePollList([unread20])
    await flushMicrotasks()
    expect(store.items.find((n) => n.id === 20)?.readAt).toBe('2026-11-14T19:10:00.000Z')

    stopMenu()
  })
})

describe('useNotificationsStore (Etapa 11.1 — Propriedade de loading e corridas GET x PATCH)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('R01 & R02 — GET iniciado durante PATCH libera loading ao encerrar e não reverte readAt confirmado', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T20:00:00.000Z' })
    store.items = [unread15]
    store.unreadCount = 1

    let resolvePatch!: (v: Notification) => void
    let resolveStaleGet!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'markRead').mockImplementationOnce(
      () => new Promise<Notification>((r) => (resolvePatch = r)) as never,
    )
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((r) => (resolveStaleGet = r)) as never,
    )
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 0 })

    // 1. Inicia PATCH
    const pPatch = store.markRead(15)
    // 2. Inicia GET durante o PATCH
    const pGet = store.fetchAll()
    expect(store.loading).toBe(true)

    // 3 e 4. PATCH confirma e reconciliação de contagem conclui antes do GET antigo
    resolvePatch(read15)
    await pPatch
    expect(store.items[0].readAt).toBe('2026-11-14T20:00:00.000Z')
    expect(store.unreadCount).toBe(0)

    // 5, 6 e 7. GET antigo retorna estado obsoleto (readAt null), é descartado, mas deve liberar loading
    resolveStaleGet([unread15])
    const getApplied = await pGet

    expect(getApplied).toBe(false)
    expect(store.items[0].readAt).toBe('2026-11-14T20:00:00.000Z')
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('R03 — GET obsoleto rejeitado (503) durante PATCH libera loading sem aplicar erro obsoleto nem repetir PATCH', async () => {
    const auth = setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T20:00:00.000Z' })
    store.items = [unread15]
    store.unreadCount = 1

    let resolvePatch!: (v: Notification) => void
    let rejectStaleGet!: (err: unknown) => void
    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolvePatch = r)) as never)
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((_, rej) => (rejectStaleGet = rej)) as never,
    )
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 0 })

    const pPatch = store.markRead(15)
    const pGet = store.fetchAll()
    expect(store.loading).toBe(true)

    resolvePatch(read15)
    await pPatch

    rejectStaleGet(makeHttpError(503, 'Service unavailable'))
    const ok = await pGet

    expect(ok).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.items[0].readAt).toBe('2026-11-14T20:00:00.000Z')
    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('R04 — novo GET após invalidação atualiza dados e controla loading normalmente', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T20:00:00.000Z' })
    const newest18 = makeNotification({ id: 18, userId: 3, readAt: null })
    store.items = [unread15]
    store.unreadCount = 1

    let resolvePatch!: (v: Notification) => void
    let resolveStaleGet!: (v: Notification[]) => void
    let resolveFreshGet!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'markRead').mockImplementationOnce(
      () => new Promise<Notification>((r) => (resolvePatch = r)) as never,
    )
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveStaleGet = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveFreshGet = r)) as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue({ count: 1 })

    const pPatch = store.markRead(15)
    const pStale = store.fetchAll()
    resolvePatch(read15)
    await pPatch
    resolveStaleGet([unread15])
    await pStale
    expect(store.loading).toBe(false)

    const pFresh = store.fetchAll()
    expect(store.loading).toBe(true)
    resolveFreshGet([newest18, read15])
    const ok = await pFresh

    expect(ok).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([newest18, read15])
  })

  it('R05 & R06 — duas consultas fora de ordem preservam propriedade de loading e estado final', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()

    // R05: A resolve primeiro, não limpa loading de B; depois B resolve e limpa loading
    let resolveA!: (v: Notification[]) => void
    let resolveB!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveA = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveB = r)) as never)

    const itemA = makeNotification({ id: 1, userId: 3 })
    const itemB = makeNotification({ id: 2, userId: 3 })

    const pA = store.fetchAll()
    const pB = store.fetchAll()
    expect(store.loading).toBe(true)

    resolveA([itemA])
    await pA
    expect(store.loading).toBe(true)
    expect(store.items).toEqual([])

    resolveB([itemB])
    await pB
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([itemB])

    // R06: ordem inversa — B resolve primeiro, depois A não sobrescreve nem bagunça estado final
    let resolveA2!: (v: Notification[]) => void
    let resolveB2!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveA2 = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveB2 = r)) as never)

    const newerItem = makeNotification({ id: 20, userId: 3 })
    const olderItem = makeNotification({ id: 19, userId: 3 })
    const pA2 = store.fetchAll()
    const pB2 = store.fetchAll()

    resolveB2([newerItem])
    await pB2
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([newerItem])

    resolveA2([olderItem])
    const resA2 = await pA2
    expect(resA2).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([newerItem])
  })

  it('R07 & R08 — countLoading respeita propriedade entre escrita, falha e nova consulta de contagem', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    store.items = [makeNotification({ id: 15, userId: 3, readAt: null })]
    store.unreadCount = 1

    let resolvePatch!: (v: Notification) => void
    let resolveOldCount!: (v: { count: number }) => void
    let resolveNewCount!: (v: { count: number }) => void

    vi.spyOn(notificationService, 'markRead').mockImplementationOnce(
      () => new Promise<Notification>((r) => (resolvePatch = r)) as never,
    )
    const countSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveOldCount = r)))
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveNewCount = r)))

    const pPatch = store.markRead(15)
    const pOldCount = store.fetchUnreadCount()
    expect(store.countLoading).toBe(true)

    // PATCH conclui e inicia reconciliação (transfere propriedade de countLoading para a nova consulta)
    resolvePatch(makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T20:00:00.000Z' }))
    await flushMicrotasks()
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(store.countLoading).toBe(true)

    // Resposta antiga resolve enquanto nova reconciliação está em voo: não aplica 99 nem apaga loading
    resolveOldCount({ count: 99 })
    expect(await pOldCount).toBe(false)
    expect(store.countLoading).toBe(true)
    expect(store.unreadCount).toBe(1)

    resolveNewCount({ count: 0 })
    await pPatch
    expect(store.countLoading).toBe(false)
    expect(store.unreadCount).toBe(0)

    // R08: rejeição de consulta antiga de contagem seguida de nova consulta válida
    let rejectStaleCount!: (err: unknown) => void
    let resolveValidCount!: (v: { count: number }) => void
    countSpy
      .mockImplementationOnce(() => new Promise<{ count: number }>((_, rej) => (rejectStaleCount = rej)))
      .mockImplementationOnce(() => new Promise<{ count: number }>((r) => (resolveValidCount = r)))

    const pStaleCount = store.fetchUnreadCount()
    const pValidCount = store.fetchUnreadCount()

    rejectStaleCount(makeHttpError(503))
    expect(await pStaleCount).toBe(false)
    expect(store.countLoading).toBe(true)
    expect(store.countError).toBeNull()

    resolveValidCount({ count: 2 })
    expect(await pValidCount).toBe(true)
    expect(store.countLoading).toBe(false)
    expect(store.unreadCount).toBe(2)
  })

  it('R09 — GET antigo iniciado antes de markAllRead não sobrescreve reconciliação nem prende loading', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const unread = makeNotification({ id: 31, userId: 3, readAt: null })
    const read = makeNotification({ id: 31, userId: 3, readAt: '2026-11-14T20:10:00.000Z' })
    store.items = [unread]
    store.unreadCount = 1

    let resolveOldGet!: (v: Notification[]) => void
    const allSpy = vi.spyOn(notificationService, 'markAllRead').mockResolvedValueOnce(undefined)
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveOldGet = r)) as never)
      .mockResolvedValueOnce([read] as never)
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValueOnce({ count: 0 })

    const pOldGet = store.fetchAll()
    await store.markAllRead()

    resolveOldGet([unread])
    expect(await pOldGet).toBe(false)

    expect(store.loading).toBe(false)
    expect(store.countLoading).toBe(false)
    expect(store.items).toEqual([read])
    expect(store.unreadCount).toBe(0)
    expect(allSpy).toHaveBeenCalledTimes(1)
  })

  it('R10, R11 & R12 — logout, troca de conta e nova sessionGeneration mantêm isolamento e consistência de loading', async () => {
    // R10: Logout durante GET limpa dados e loading
    const auth = setSession(makeUser({ id: 3 }), 'token-a')
    const store = useNotificationsStore()
    let resolveListLogout!: (v: Notification[]) => void
    let resolveCountLogout!: (v: { count: number }) => void
    vi.spyOn(notificationService, 'list').mockImplementationOnce(
      () => new Promise<Notification[]>((r) => (resolveListLogout = r)) as never,
    )
    vi.spyOn(notificationService, 'unreadCount').mockImplementationOnce(
      () => new Promise<{ count: number }>((r) => (resolveCountLogout = r)),
    )

    const pL = store.fetchAll()
    const pC = store.fetchUnreadCount()
    auth.logout()
    resolveListLogout([makeNotification({ id: 1, userId: 3 })])
    resolveCountLogout({ count: 4 })
    await Promise.all([pL, pC])

    expect(store.items).toEqual([])
    expect(store.unreadCount).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.countLoading).toBe(false)

    // R11: Troca de conta com GET A pendente e GET B em voo
    auth.token = 'token-a'
    auth.user = makeUser({ id: 3 })
    auth.sessionGeneration += 1
    let resolveA!: (v: Notification[]) => void
    let resolveB!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveA = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveB = r)) as never)

    const pAccountA = store.fetchAll()
    auth.token = 'token-b'
    auth.user = makeUser({ id: 9, name: 'Bruno' })
    auth.sessionGeneration += 1
    const pAccountB = store.fetchAll()

    resolveA([makeNotification({ id: 5, userId: 3 })])
    await pAccountA
    expect(store.loading).toBe(true)
    expect(store.items).toEqual([])

    const itemB = makeNotification({ id: 9, userId: 9 })
    resolveB([itemB])
    await pAccountB
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([itemB])

    // R12: Mesmo JWT com nova sessionGeneration
    let resolveGen1!: (v: Notification[]) => void
    let resolveGen2!: (v: Notification[]) => void
    vi.spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveGen1 = r)) as never)
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveGen2 = r)) as never)

    const pGen1 = store.fetchAll()
    auth.sessionGeneration += 1
    const pGen2 = store.fetchAll()

    resolveGen1([makeNotification({ id: 99, userId: 9 })])
    await pGen1
    expect(store.loading).toBe(true)
    expect(store.items).toEqual([])

    const gen2Item = makeNotification({ id: 100, userId: 9 })
    resolveGen2([gen2Item])
    await pGen2
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([gen2Item])
  })

  it('R13 — polling continua ativo com único timer e executa nova consulta após corrida de R01', async () => {
    vi.useFakeTimers()
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const unread15 = makeNotification({ id: 15, userId: 3, readAt: null })
    const read15 = makeNotification({ id: 15, userId: 3, readAt: '2026-11-14T20:00:00.000Z' })
    const polled19 = makeNotification({ id: 19, userId: 3, readAt: null })
    store.items = [unread15]
    store.unreadCount = 1

    let resolvePatch!: (v: Notification) => void
    let resolveStaleGet!: (v: Notification[]) => void
    const patchSpy = vi
      .spyOn(notificationService, 'markRead')
      .mockImplementationOnce(() => new Promise<Notification>((r) => (resolvePatch = r)) as never)
    const listSpy = vi
      .spyOn(notificationService, 'list')
      .mockImplementationOnce(() => new Promise<Notification[]>((r) => (resolveStaleGet = r)) as never)
      .mockResolvedValueOnce([polled19, read15] as never)
    const countSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })

    const stopPolling = store.startPolling({ includeList: true })
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    const pPatch = store.markRead(15)
    const pStaleGet = store.fetchAll()
    resolvePatch(read15)
    await pPatch
    resolveStaleGet([unread15])
    await pStaleGet
    expect(store.loading).toBe(false)

    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS)
    await flushMicrotasks()

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(countSpy).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual([polled19, read15])
    expect(store.unreadCount).toBe(1)
    expect(store.loading).toBe(false)
    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(intervalSpy).toHaveBeenCalledTimes(1)

    stopPolling()
  })

  it('R14 — falha de rede em GET válido encerra loading, exibe erro e permite retry manual sem loop', async () => {
    setSession(makeUser({ id: 3 }))
    const store = useNotificationsStore()
    const listSpy = vi
      .spyOn(notificationService, 'list')
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
      .mockResolvedValueOnce([makeNotification({ id: 50, userId: 3 })] as never)

    expect(await store.fetchAll()).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBe('Não foi possível carregar suas notificações.')
    expect(listSpy).toHaveBeenCalledTimes(1)

    expect(await store.fetchAll()).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.items).toHaveLength(1)
    expect(listSpy).toHaveBeenCalledTimes(2)
  })
})

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve())
}
