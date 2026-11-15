import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../api'
import { notificationService } from '../notification.service'

const makeNotificationDto = (overrides: Record<string, unknown> = {}) => ({
  id: 15,
  userId: 3,
  type: 'MATCH_FOUND' as const,
  linkUrl: '/lost-reports/12',
  readAt: null,
  createdAt: '2026-11-14T15:30:00.000Z',
  ...overrides,
})

describe('notificationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('T01 & T02 — list() chama GET /notifications sem parâmetros de paginação e retorna array simples', async () => {
    const payload = [
      makeNotificationDto({ id: 15 }),
      makeNotificationDto({ id: 14, type: 'REPORT_RESOLVED', readAt: '2026-11-13T10:00:00.000Z' }),
    ]
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: payload } as never)

    const result = await notificationService.list()

    expect(getSpy).toHaveBeenCalledTimes(1)
    const [url, config] = getSpy.mock.calls[0]
    expect(url).toBe('/notifications')
    const params = (config as { params?: Record<string, unknown> } | undefined)?.params ?? {}
    expect(params).not.toHaveProperty('page')
    expect(params).not.toHaveProperty('per_page')
    expect(params).not.toHaveProperty('limit')
    expect(params).not.toHaveProperty('sortBy')
    expect(params).not.toHaveProperty('sortDir')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(payload)
  })

  it('T03 — list({ read: true }) envia read=true para o backend', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] } as never)

    const result = await notificationService.list({ read: true })

    expect(getSpy).toHaveBeenCalledWith('/notifications', { params: { read: true } })
    expect(result).toEqual([])
  })

  it('T04 — list({ read: false }) envia read=false para o backend', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] } as never)

    const result = await notificationService.list({ read: false })

    expect(getSpy).toHaveBeenCalledWith('/notifications', { params: { read: false } })
    expect(result).toEqual([])
  })

  it('rejeita resposta de list() que não seja array', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: [], total: 0 } } as never)

    await expect(notificationService.list()).rejects.toThrow()
  })

  it('T05 — unreadCount() chama GET /notifications/unread-count e retorna { count: 4 }', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { count: 4 } } as never)

    const result = await notificationService.unreadCount()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/notifications/unread-count')
    expect(result).toEqual({ count: 4 })
  })

  it('T06 — unreadCount() rejeita formatos inválidos sem converter silenciosamente', async () => {
    for (const invalid of [
      { count: -1 },
      { count: 1.5 },
      { count: Number.NaN },
      { count: '4' },
      { unreadCount: 4 },
      null,
      {},
    ]) {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: invalid } as never)
      await expect(notificationService.unreadCount()).rejects.toThrow()
    }
  })

  it('M01 & M02 — markRead(15) chama PATCH /notifications/15/read sem body e retorna DTO atualizado', async () => {
    const updatedDto = makeNotificationDto({
      id: 15,
      readAt: '2026-11-14T18:30:00.000Z',
    })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: updatedDto } as never)

    const result = await notificationService.markRead(15)

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith('/notifications/15/read')
    expect(result).toEqual(updatedDto)
  })

  it('M03 & M04 — markAllRead() chama PATCH /notifications/read-all sem body e aceita HTTP 204 vazio', async () => {
    const patchSpy = vi
      .spyOn(api, 'patch')
      .mockResolvedValueOnce({ status: 204, data: '' } as never)

    const result = await notificationService.markAllRead()

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith('/notifications/read-all')
    expect(result).toBeUndefined()
  })

  it('M05 — propaga erros 400, 401, 404, 500 e rede sem retry automático', async () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    for (const status of [400, 401, 404, 500]) {
      const httpErr = new AxiosError('Fail', 'ERR_BAD_RESPONSE', config, null, {
        status,
        statusText: String(status),
        headers: new AxiosHeaders(),
        config,
        data: { success: false, data: null, error: { code: status, details: 'err' } },
      })
      const patchSpy = vi.spyOn(api, 'patch').mockRejectedValueOnce(httpErr)
      await expect(notificationService.markRead(15)).rejects.toBe(httpErr)
      expect(patchSpy).toHaveBeenCalledTimes(1)
      patchSpy.mockRestore()
    }

    const netErr = new AxiosError('Network Error', 'ERR_NETWORK')
    const allSpy = vi.spyOn(api, 'patch').mockRejectedValueOnce(netErr)
    await expect(notificationService.markAllRead()).rejects.toBe(netErr)
    expect(allSpy).toHaveBeenCalledTimes(1)
  })
})
