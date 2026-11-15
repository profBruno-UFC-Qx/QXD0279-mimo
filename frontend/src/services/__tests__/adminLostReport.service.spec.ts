import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { adminLostReportService } from '../adminLostReport.service'
import type { LostReport, Page } from '@/types'

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 12,
  userId: 5,
  categoryId: 3,
  buildingId: 2,
  confirmedItemId: null,
  description: 'Mochila preta perdida no bloco B.',
  lossDate: '2026-11-10',
  status: 'OPEN',
  createdAt: '2026-11-11T10:30:00.000Z',
  ...overrides,
})

const makePage = (items: LostReport[] = [makeReport()]): Page<LostReport> => ({
  data: items,
  pagination: {
    total: items.length,
    page: 1,
    per_page: 12,
    total_pages: items.length > 0 ? 1 : 0,
  },
})

function makeHttpError(status: number, details = 'Erro'): AxiosError {
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

describe('adminLostReportService (Etapa 12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S01 — list() sem filtros chama GET /admin/lost-reports e retorna Page<LostReport>', async () => {
    const page = makePage()
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: page } as never)

    const result = await adminLostReportService.list()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/admin/lost-reports', { params: undefined })
    expect(result).toEqual(page)
  })

  it('S02 — list() envia filtros válidos status, categoryId, buildingId, page e per_page', async () => {
    const page = makePage()
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: page } as never)

    const query = {
      status: 'OPEN' as const,
      categoryId: 3,
      buildingId: 2,
      page: 2,
      per_page: 24,
    }
    const result = await adminLostReportService.list(query)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/admin/lost-reports', { params: query })
    expect(result).toEqual(page)
  })

  it('S03 — list() não envia search, sortBy, sortDir, limit ou q mesmo se recebidos em runtime', async () => {
    const page = makePage()
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: page } as never)

    await adminLostReportService.list({
      status: 'OPEN',
      page: 1,
      per_page: 12,
      search: 'mochila',
      sortBy: 'createdAt',
      sortDir: 'desc',
      limit: 50,
      q: 'teste',
    } as never)

    expect(getSpy).toHaveBeenCalledTimes(1)
    const calledParams = getSpy.mock.calls[0]?.[1]?.params as Record<string, unknown>
    expect(calledParams).toEqual({
      status: 'OPEN',
      page: 1,
      per_page: 12,
    })
    for (const forbidden of ['search', 'sortBy', 'sortDir', 'limit', 'q']) {
      expect(Object.prototype.hasOwnProperty.call(calledParams, forbidden)).toBe(false)
    }
  })

  it('S04 — getById(12) chama GET /admin/lost-reports/12 e retorna o relato', async () => {
    const report = makeReport({ id: 12 })
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: report } as never)

    const result = await adminLostReportService.getById(12)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/admin/lost-reports/12')
    expect(result).toEqual(report)
  })

  it('S05 & S06 — resolve(12) envia POST /admin/lost-reports/12/resolve sem body e retorna DTO atualizado', async () => {
    const resolved = makeReport({ id: 12, status: 'RESOLVED' })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: resolved } as never)

    const result = await adminLostReportService.resolve(12)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/admin/lost-reports/12/resolve')
    expect(postSpy.mock.calls[0].length).toBe(1)
    expect(result).toEqual(resolved)
    expect(result.status).toBe('RESOLVED')
  })

  it('S07 — propaga erros HTTP 400/401/403/404/409/500 e falha de rede sem retry automático', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      vi.restoreAllMocks()
      const err = makeHttpError(status)
      const getSpy = vi.spyOn(api, 'get').mockRejectedValue(err)
      const postSpy = vi.spyOn(api, 'post').mockRejectedValue(err)

      await expect(adminLostReportService.list()).rejects.toBe(err)
      await expect(adminLostReportService.getById(12)).rejects.toBe(err)
      await expect(adminLostReportService.resolve(12)).rejects.toBe(err)

      expect(getSpy).toHaveBeenCalledTimes(2)
      expect(postSpy).toHaveBeenCalledTimes(1)
    }

    vi.restoreAllMocks()
    const networkErr = new Error('Network Error')
    const netPostSpy = vi.spyOn(api, 'post').mockRejectedValue(networkErr)
    await expect(adminLostReportService.resolve(12)).rejects.toBe(networkErr)
    expect(netPostSpy).toHaveBeenCalledTimes(1)
  })
})
