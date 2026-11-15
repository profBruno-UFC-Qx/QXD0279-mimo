import { describe, it, expect, vi } from 'vitest'
import { usePagination } from '../usePagination'
import type { Page, PageQuery } from '@/types'

interface SampleItem {
  id: number
  title: string
}

interface SampleQuery extends PageQuery {
  search?: string
}

function makeValidPage(items: SampleItem[], total = items.length, page = 1, per_page = 12): Page<SampleItem> {
  return {
    data: items,
    pagination: {
      total,
      page,
      per_page,
      total_pages: total === 0 ? 0 : Math.ceil(total / per_page),
    },
  }
}

describe('usePagination (Etapa 17.1 — Validação runtime, invariantes e proteção contra corridas)', () => {
  it('PAG-01 — carrega resposta paginada válida e atualiza items e total', async () => {
    const sample = [
      { id: 1, title: 'Mochila Azul' },
      { id: 2, title: 'Garrafa Térmica' },
    ]
    const fetcher = vi.fn().mockResolvedValue(makeValidPage(sample, 15, 1, 12))

    const { items, total, page, limit, loading, error, load } = usePagination<SampleItem, SampleQuery>(fetcher)
    await load()

    expect(fetcher).toHaveBeenCalledWith({ page: 1, per_page: 12 })
    expect(items.value).toEqual(sample)
    expect(total.value).toBe(15)
    expect(page.value).toBe(1)
    expect(limit.value).toBe(12)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(false)
  })

  it('PAG-02 — aceita lista vazia válida sem sinalizar erro', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeValidPage([], 0, 1, 12))

    const { items, total, loading, error, load } = usePagination<SampleItem>(fetcher)
    await load()

    expect(items.value).toEqual([])
    expect(total.value).toBe(0)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(false)
  })

  it.each([
    ['PAG-03 — resposta undefined', undefined],
    ['PAG-04 — resposta null', null],
    ['PAG-05 — resposta HTML 200', '<!doctype html><html><head></head><body><div id="app"></div></body></html>'],
    ['PAG-06 — campo data ausente', { pagination: { total: 2, page: 1, per_page: 12, total_pages: 1 } }],
    ['PAG-07 — campo data string', { data: 'html', pagination: { total: 2, page: 1, per_page: 12, total_pages: 1 } }],
    ['PAG-08 — campo pagination ausente', { data: [] }],
    ['PAG-09 — pagination.total string', { data: [], pagination: { total: '10', page: 1, per_page: 12, total_pages: 1 } }],
    ['PAG-10 — pagination.total negativo', { data: [], pagination: { total: -1, page: 1, per_page: 12, total_pages: 0 } }],
    ['PAG-11 — pagination.total decimal', { data: [], pagination: { total: 1.5, page: 1, per_page: 12, total_pages: 1 } }],
    [
      'PAG-12 — pagination.total maior que inteiro seguro',
      { data: [], pagination: { total: Number.MAX_SAFE_INTEGER + 1, page: 1, per_page: 12, total_pages: 1 } },
    ],
  ])('%s: rejeita payload inválido, preserva items como array e sinaliza error=true', async (_label, invalidPayload) => {
    const fetcher = vi.fn().mockResolvedValue(invalidPayload as unknown as Page<SampleItem>)

    const { items, total, loading, error, load } = usePagination<SampleItem>(fetcher)
    await load()

    expect(Array.isArray(items.value)).toBe(true)
    expect(items.value).toEqual([])
    expect(Number.isSafeInteger(total.value)).toBe(true)
    expect(total.value).toBeGreaterThanOrEqual(0)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(true)
  })

  it('PAG-13 & PAG-17 — falha de rede sinaliza erro, encerra loading e mantém invariantes', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network Error'))

    const { items, total, loading, error, load } = usePagination<SampleItem>(fetcher)
    await load()

    expect(Array.isArray(items.value)).toBe(true)
    expect(items.value).toEqual([])
    expect(total.value).toBe(0)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(true)
  })

  it('PAG-14 — retry após resposta HTML ou falha de rede recupera o estado com sucesso', async () => {
    const sample = [{ id: 10, title: 'Caderno Universitário' }]
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('<!doctype html><html></html>' as unknown as Page<SampleItem>)
      .mockResolvedValueOnce(makeValidPage(sample, 1))

    const { items, total, loading, error, load } = usePagination<SampleItem>(fetcher)

    await load()
    expect(error.value).toBe(true)
    expect(items.value).toEqual([])
    expect(loading.value).toBe(false)

    await load()
    expect(error.value).toBe(false)
    expect(items.value).toEqual(sample)
    expect(total.value).toBe(1)
    expect(loading.value).toBe(false)
  })

  it('PAG-15 — resposta de GET antigo que chega depois de GET mais recente é descartada', async () => {
    let resolveFirst!: (val: Page<SampleItem>) => void
    let resolveSecond!: (val: Page<SampleItem>) => void

    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Page<SampleItem>>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Page<SampleItem>>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { items, total, loading, error, load } = usePagination<SampleItem, SampleQuery>(fetcher)

    const req1 = load({ search: 'antigo' })
    const req2 = load({ search: 'novo' })

    resolveSecond(makeValidPage([{ id: 2, title: 'Item Novo' }], 1))
    await req2

    expect(items.value).toEqual([{ id: 2, title: 'Item Novo' }])
    expect(total.value).toBe(1)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(false)

    resolveFirst(makeValidPage([{ id: 1, title: 'Item Antigo' }], 99))
    await req1

    expect(items.value).toEqual([{ id: 2, title: 'Item Novo' }])
    expect(total.value).toBe(1)
    expect(error.value).toBe(false)
  })

  it('PAG-16 — erro de GET antigo após sucesso de GET mais recente não contamina o estado', async () => {
    let rejectFirst!: (err: unknown) => void
    let resolveSecond!: (val: Page<SampleItem>) => void

    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Page<SampleItem>>((_resolve, reject) => {
            rejectFirst = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Page<SampleItem>>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { items, total, loading, error, load } = usePagination<SampleItem>(fetcher)

    const req1 = load()
    const req2 = load()

    resolveSecond(makeValidPage([{ id: 7, title: 'Chaveiro' }], 1))
    await req2

    rejectFirst(new Error('Timeout tardio'))
    await req1

    expect(error.value).toBe(false)
    expect(loading.value).toBe(false)
    expect(items.value).toEqual([{ id: 7, title: 'Chaveiro' }])
    expect(total.value).toBe(1)
  })

  it('PAG-18 — filtros, page e limit são enviados corretamente na consulta', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeValidPage([], 0, 3, 24))

    const { page, limit, load } = usePagination<SampleItem, SampleQuery>(fetcher)
    page.value = 3
    limit.value = 24

    await load({ search: 'calculadora' })

    expect(fetcher).toHaveBeenCalledWith({
      page: 3,
      per_page: 24,
      search: 'calculadora',
    })
  })

  it('PAG-19 & PAG-20 — após sucesso anterior, uma falha limpa dados desatualizados sem deixar items undefined', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeValidPage([{ id: 1, title: 'Item Inicial' }], 5))
      .mockResolvedValueOnce({ data: undefined } as unknown as Page<SampleItem>)

    const { items, total, error, loading, load } = usePagination<SampleItem>(fetcher)

    await load()
    expect(items.value).toHaveLength(1)
    expect(total.value).toBe(5)

    await load()
    expect(error.value).toBe(true)
    expect(loading.value).toBe(false)
    expect(Array.isArray(items.value)).toBe(true)
    expect(items.value).toEqual([])
    expect(total.value).toBe(0)
  })
})
