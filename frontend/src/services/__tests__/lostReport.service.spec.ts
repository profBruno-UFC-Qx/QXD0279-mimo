import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../api'
import { lostReportService } from '../lostReport.service'
import type { CreateLostReportResult, LostReport, PublicSuggestedItem } from '@/types'

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 10,
  userId: 1,
  categoryId: 3,
  buildingId: 5,
  confirmedItemId: null,
  description: 'Mochila azul com cadernos',
  lossDate: '2026-10-23',
  status: 'OPEN',
  createdAt: '2026-10-24T12:00:00.000Z',
  ...overrides,
})

describe('lostReportService.mine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('L02 — chama GET /lost-reports/mine e retorna diretamente um array de PublicLostReportDto sem paginação', async () => {
    const reports = [makeReport({ id: 1 }), makeReport({ id: 2, buildingId: null })]
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: reports } as never)

    const result = await lostReportService.mine()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/lost-reports/mine', { params: undefined })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(reports)
  })

  it('repassa filtro opcional { status } diretamente para GET /lost-reports/mine sem PageQuery', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: [] } as never)

    const result = await lostReportService.mine({ status: 'OPEN' })

    expect(getSpy).toHaveBeenCalledWith('/lost-reports/mine', { params: { status: 'OPEN' } })
    expect(result).toEqual([])
  })

  it('rejeita resposta malformada quando o backend não retorna um array', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [], total: 0 } } as never)

    await expect(lostReportService.mine()).rejects.toThrow()
  })
})

describe('lostReportService.getById', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('D02 — chama GET /lost-reports/:id e retorna diretamente o DTO desempacotado sem exigir data.data', async () => {
    const report = makeReport({ id: 12, buildingId: null })
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: report } as never)

    const result = await lostReportService.getById(12)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/lost-reports/12')
    expect(result).toEqual(report)
  })
})

describe('lostReportService.update', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('envia PATCH parcial em /lost-reports/:id e retorna o DTO atualizado', async () => {
    const updated = makeReport({ id: 12, description: 'Descrição atualizada no serviço' })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: updated } as never)

    const result = await lostReportService.update(12, {
      description: 'Descrição atualizada no serviço',
    })

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith('/lost-reports/12', {
      description: 'Descrição atualizada no serviço',
    })
    expect(result).toEqual(updated)
  })
})

describe('lostReportService.cancel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('K05 — envia POST /lost-reports/:id/cancel sem payload e retorna o DTO desempacotado', async () => {
    const cancelled = makeReport({ id: 12, status: 'CANCELLED' })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: cancelled } as never)

    const result = await lostReportService.cancel(12)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/lost-reports/12/cancel')
    expect(result).toEqual(cancelled)
  })
})

describe('lostReportService.create', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('N13 & N15 — envia POST /lost-reports e retorna diretamente { lostReport, suggestions } com DTO público de sugestão', async () => {
    const suggestion: PublicSuggestedItem = {
      id: 99,
      title: 'Mochila preta Dell',
      description: 'Encontrada no bloco I',
      categoryId: 3,
      buildingId: 2,
      foundLocation: 'Sala 102',
      foundDate: '2026-11-04',
      status: 'AVAILABLE',
      category: { id: 3, name: 'Mochilas' },
      building: { id: 2, name: 'Bloco I' },
      photos: [{ id: 1, url: 'https://example.com/foto.jpg' }],
    }
    const createdResponse: CreateLostReportResult = {
      lostReport: makeReport({ id: 42, userId: 7, categoryId: 3, buildingId: null }),
      suggestions: [suggestion],
    }
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: createdResponse } as never)

    const result = await lostReportService.create({
      categoryId: 3,
      buildingId: null,
      description: 'Mochila preta com cadernos e carregador.',
      lossDate: '2026-11-05',
    })

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/lost-reports', {
      categoryId: 3,
      buildingId: null,
      description: 'Mochila preta com cadernos e carregador.',
      lossDate: '2026-11-05',
    })
    expect(result).toEqual(createdResponse)
    expect(result.lostReport.id).toBe(42)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].id).toBe(99)
  })
})

describe('lostReportService.confirmSuggestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('F01 — envia POST /lost-reports/:id/suggestions/:itemId/confirm sem payload e retorna LostReport', async () => {
    const confirmed = makeReport({ id: 12, confirmedItemId: 25, status: 'OPEN' })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: confirmed } as never)

    const result = await lostReportService.confirmSuggestion(12, 25)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/lost-reports/12/suggestions/25/confirm')
    expect(result).toEqual(confirmed)
  })
})
