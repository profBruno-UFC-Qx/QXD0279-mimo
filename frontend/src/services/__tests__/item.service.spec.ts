import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../api'
import { itemService } from '../item.service'
import type { Page, PublicCatalogItem } from '@/types'

const makePublicCatalogItem = (overrides: Partial<PublicCatalogItem> = {}): PublicCatalogItem => ({
  id: 25,
  title: 'Mochila preta',
  description: 'Mochila encontrada no bloco principal.',
  categoryId: 3,
  buildingId: 2,
  foundLocation: 'Corredor do primeiro andar',
  foundDate: '2026-11-06',
  status: 'AVAILABLE',
  category: { id: 3, name: 'Bolsas e mochilas' },
  building: { id: 2, name: 'Bloco principal' },
  photos: [{ id: 8, url: 'https://exemplo.com/foto.jpg' }],
  ...overrides,
})

describe('itemService.list', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S03 — chama GET /items com categoryId, page e per_page e preserva retorno paginado { data, pagination }', async () => {
    const payload: Page<PublicCatalogItem> = {
      data: [makePublicCatalogItem()],
      pagination: { total: 1, page: 1, per_page: 12, total_pages: 1 },
    }
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: payload } as never)

    const result = await itemService.list({ categoryId: 3, page: 1, per_page: 12 })

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/items', {
      params: { categoryId: 3, page: 1, per_page: 12 },
    })
    expect(Array.isArray(result)).toBe(false)
    expect(result).toEqual(payload)
    expect(result.data).toHaveLength(1)
    expect(result.pagination).toEqual({ total: 1, page: 1, per_page: 12, total_pages: 1 })
  })
})
