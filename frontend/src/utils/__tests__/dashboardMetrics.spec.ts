import { describe, it, expect } from 'vitest'
import {
  extractDispositionEligibilityUpdatedCount,
  extractPaginationTotal,
} from '../dashboardMetrics'

describe('dashboardMetrics utils (Etapa 16)', () => {
  it('M16-01 — aceita total igual a zero como valor válido', () => {
    expect(
      extractPaginationTotal({
        data: [],
        pagination: { total: 0, page: 1, per_page: 1, total_pages: 0 },
      }),
    ).toBe(0)
  })

  it('M16-02 — aceita total inteiro positivo mesmo quando data.length é menor', () => {
    expect(
      extractPaginationTotal({
        data: [{ id: 1 }],
        pagination: { total: 120, page: 1, per_page: 1, total_pages: 120 },
      }),
    ).toBe(120)
  })

  it('M16-03 — rejeita total negativo', () => {
    expect(() =>
      extractPaginationTotal({
        data: [],
        pagination: { total: -1, page: 1, per_page: 1, total_pages: 0 },
      }),
    ).toThrow()
  })

  it('M16-04 — rejeita total decimal', () => {
    expect(() =>
      extractPaginationTotal({
        data: [],
        pagination: { total: 12.5, page: 1, per_page: 1, total_pages: 1 },
      }),
    ).toThrow()
  })

  it('M16-05 — rejeita total não seguro ou não finito (NaN, Infinity, > MAX_SAFE_INTEGER)', () => {
    for (const total of [Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        extractPaginationTotal({
          data: [],
          pagination: { total, page: 1, per_page: 1, total_pages: 1 },
        }),
      ).toThrow()
    }
  })

  it('M16-06 — rejeita total ausente', () => {
    expect(() =>
      extractPaginationTotal({
        data: [],
        pagination: { page: 1, per_page: 1, total_pages: 0 },
      }),
    ).toThrow()
  })

  it('M16-07 — rejeita total como string numérica', () => {
    expect(() =>
      extractPaginationTotal({
        data: [],
        pagination: { total: '15', page: 1, per_page: 1, total_pages: 15 },
      }),
    ).toThrow()
  })

  it('M16-08 — rejeita paginação ausente ou não-objeto', () => {
    expect(() => extractPaginationTotal({ data: [] })).toThrow()
    expect(() => extractPaginationTotal({ data: [], pagination: null })).toThrow()
    expect(() => extractPaginationTotal({ data: [], pagination: [] })).toThrow()
  })

  it('M16-09 — rejeita resposta nula, indefinida ou primitiva', () => {
    expect(() => extractPaginationTotal(null)).toThrow()
    expect(() => extractPaginationTotal(undefined)).toThrow()
    expect(() => extractPaginationTotal('texto')).toThrow()
    expect(() => extractPaginationTotal([])).toThrow()
  })

  it('M16-10 — nunca utiliza data.length como substituto quando pagination está ausente', () => {
    expect(() =>
      extractPaginationTotal({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      }),
    ).toThrow()
  })

  it('M16-11 — valida updatedCount igual a zero', () => {
    expect(extractDispositionEligibilityUpdatedCount({ updatedCount: 0 })).toBe(0)
  })

  it('M16-12 — valida updatedCount inteiro positivo', () => {
    expect(extractDispositionEligibilityUpdatedCount({ updatedCount: 7 })).toBe(7)
  })

  it('M16-13 — rejeita updatedCount ausente, negativo, decimal, string, NaN ou Infinity', () => {
    for (const payload of [
      null,
      undefined,
      [],
      {},
      { updatedCount: -1 },
      { updatedCount: 2.3 },
      { updatedCount: '4' },
      { updatedCount: Number.NaN },
      { updatedCount: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => extractDispositionEligibilityUpdatedCount(payload)).toThrow()
    }
  })
})
