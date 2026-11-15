import { describe, it, expect } from 'vitest'
import { isValidAdminLostReportPage } from '../adminLostReports'
import type { LostReport, Page } from '@/types'

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 1,
  userId: 5,
  categoryId: 3,
  buildingId: 2,
  confirmedItemId: null,
  description: 'Mochila preta perdida no campus.',
  lossDate: '2026-11-10',
  status: 'OPEN',
  createdAt: '2026-11-11T10:30:00.000Z',
  ...overrides,
})

const makePage = (
  items: LostReport[] = [makeReport()],
  paginationOverrides: Partial<Page<LostReport>['pagination']> = {},
): Page<LostReport> => {
  const perPage = paginationOverrides.per_page ?? 12
  const total = paginationOverrides.total ?? items.length
  return {
    data: items,
    pagination: {
      total,
      page: 1,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      ...paginationOverrides,
    },
  }
}

describe('isValidAdminLostReportPage (Etapa 12.1 — Validação de per_page)', () => {
  it('P12.1-01 — rejeita resposta com per_page diferente do solicitado (12 esperado, 24 recebido)', () => {
    const response = makePage([], { total: 0, page: 1, per_page: 24, total_pages: 0 })

    expect(
      isValidAdminLostReportPage(response, {
        page: 1,
        perPage: 12,
      }),
    ).toBe(false)
  })

  it('P12.1-02 — aceita resposta válida com per_page 12 quando 12 foi solicitado', () => {
    const response = makePage([makeReport({ id: 1 })], { total: 1, page: 1, per_page: 12, total_pages: 1 })

    expect(
      isValidAdminLostReportPage(response, {
        page: 1,
        perPage: 12,
      }),
    ).toBe(true)
  })

  it('P12.1-03 — aceita alteração legítima para per_page 24 quando 24 foi solicitado', () => {
    const response = makePage([makeReport({ id: 1 })], { total: 1, page: 1, per_page: 24, total_pages: 1 })

    expect(
      isValidAdminLostReportPage(response, {
        page: 1,
        perPage: 24,
      }),
    ).toBe(true)
  })

  it('P12.1-04 — aceita alteração legítima para per_page 48 quando 48 foi solicitado', () => {
    const response = makePage([makeReport({ id: 1 })], { total: 1, page: 1, per_page: 48, total_pages: 1 })

    expect(
      isValidAdminLostReportPage(response, {
        page: 1,
        perPage: 48,
      }),
    ).toBe(true)
  })

  it('P12.1-05 — preserva validação geral sem expected.perPage para tamanhos válidos até 100', () => {
    const response = makePage([makeReport({ id: 1 })], { total: 1, page: 1, per_page: 20, total_pages: 1 })

    expect(isValidAdminLostReportPage(response, { page: 1 })).toBe(true)
    expect(isValidAdminLostReportPage(response)).toBe(true)
  })

  it('P12.1-06 — rejeita per_page estruturalmente inválido (0, -1, 1.5, string, null, 101, NaN)', () => {
    const invalidPerPages: unknown[] = [0, -1, 1.5, '12', null, 101, Number.NaN]

    for (const badPerPage of invalidPerPages) {
      const candidate = {
        data: [],
        pagination: {
          total: 0,
          page: 1,
          per_page: badPerPage,
          total_pages: 0,
        },
      }
      expect(isValidAdminLostReportPage(candidate)).toBe(false)
    }
  })

  it('P12.1-07 — preserva verificação de total e total_pages === Math.ceil(total / per_page)', () => {
    const coherent = makePage([makeReport({ id: 1 })], { total: 25, page: 1, per_page: 12, total_pages: 3 })
    const incoherent = makePage([makeReport({ id: 1 })], { total: 25, page: 1, per_page: 12, total_pages: 2 })

    expect(isValidAdminLostReportPage(coherent, { page: 1, perPage: 12 })).toBe(true)
    expect(isValidAdminLostReportPage(incoherent, { page: 1, perPage: 12 })).toBe(false)
  })
})
