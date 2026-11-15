import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { categoryService } from '../category.service'
import type { Category, CategoryPayload } from '@/types'

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 3,
  name: 'Eletrônicos',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
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

describe('categoryService (Etapa 14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S14-01 — list() chama GET /categories e retorna categorias', async () => {
    const items = [makeCategory({ id: 1, name: 'Acessórios' }), makeCategory({ id: 2, name: 'Documentos' })]
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: items } as never)

    const result = await categoryService.list()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/categories')
    expect(result).toEqual(items)
  })

  it('S14-02 & S14-07 — create() envia POST /categories somente com { name }', async () => {
    const payload: CategoryPayload = { name: 'Eletrônicos' }
    const created = makeCategory({ id: 10, name: 'Eletrônicos' })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: created } as never)

    const result = await categoryService.create(payload)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/categories', { name: 'Eletrônicos' })
    expect(Object.keys(postSpy.mock.calls[0][1] as object)).toEqual(['name'])
    expect(result).toEqual(created)
  })

  it('S14-03 & S14-07 — update() envia PATCH /categories/:id somente com { name }', async () => {
    const payload: CategoryPayload = { name: 'Documentos Pessoais' }
    const updated = makeCategory({ id: 4, name: 'Documentos Pessoais' })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: updated } as never)

    const result = await categoryService.update(4, payload)

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith('/categories/4', { name: 'Documentos Pessoais' })
    expect(Object.keys(patchSpy.mock.calls[0][1] as object)).toEqual(['name'])
    expect(result).toEqual(updated)
  })

  it('S14-04 & S14-05 — remove() envia DELETE /categories/:id e trata HTTP 204 sem corpo JSON', async () => {
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValueOnce({ status: 204, data: undefined } as never)

    const result = await categoryService.remove(5)

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith('/categories/5')
    expect(result).toBeUndefined()
  })

  it('S14-06 — propaga erros HTTP (400, 401, 403, 404, 409, 500) sem mascarar falhas', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      vi.spyOn(api, 'post').mockRejectedValueOnce(makeHttpError(status))
      await expect(categoryService.create({ name: 'Teste' })).rejects.toMatchObject({
        response: { status },
      })
    }

    vi.spyOn(api, 'patch').mockRejectedValueOnce(makeHttpError(409))
    await expect(categoryService.update(1, { name: 'Duplicada' })).rejects.toMatchObject({
      response: { status: 409 },
    })

    vi.spyOn(api, 'delete').mockRejectedValueOnce(makeHttpError(409))
    await expect(categoryService.remove(1)).rejects.toMatchObject({
      response: { status: 409 },
    })
  })
})
