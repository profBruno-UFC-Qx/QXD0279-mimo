import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { buildingService } from '../building.service'
import type { Building, BuildingPayload } from '@/types'

const makeBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 2,
  name: 'Bloco de Engenharia',
  address: 'Rua Exemplo, 123',
  pickupPoint: 'Recepção principal',
  serviceHours: 'Segunda a sexta, das 8h às 17h',
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

describe('buildingService (Etapa 13)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S01 — list() chama GET /buildings sem exigir parâmetros inventados', async () => {
    const items = [makeBuilding({ id: 1, name: 'Biblioteca Central' }), makeBuilding({ id: 2 })]
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: items } as never)

    const result = await buildingService.list()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/buildings')
    expect(result).toEqual(items)
  })

  it('S02 — getById() chama GET /buildings/:id', async () => {
    const building = makeBuilding({ id: 7 })
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: building } as never)

    const result = await buildingService.getById(7)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/buildings/7')
    expect(result).toEqual(building)
  })

  it('S03 & S06 — create() envia POST /buildings com os quatro campos e propaga DTO', async () => {
    const payload: BuildingPayload = {
      name: 'Bloco de Engenharia',
      address: 'Rua Exemplo, 123',
      pickupPoint: 'Recepção principal',
      serviceHours: 'Segunda a sexta, das 8h às 17h',
    }
    const created = makeBuilding({ id: 10, ...payload })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: created } as never)

    const result = await buildingService.create(payload)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/buildings', payload)
    expect(result).toEqual(created)
  })

  it('S04 & S07 — update() envia PATCH /buildings/:id apenas com campos modificados e propaga DTO', async () => {
    const partial = { pickupPoint: 'Secretaria do bloco' }
    const updated = makeBuilding({ id: 4, pickupPoint: 'Secretaria do bloco' })
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: updated } as never)

    const result = await buildingService.update(4, partial)

    expect(patchSpy).toHaveBeenCalledTimes(1)
    expect(patchSpy).toHaveBeenCalledWith('/buildings/4', partial)
    expect(result).toEqual(updated)
  })

  it('S05 — remove() envia DELETE /buildings/:id sem esperar corpo JSON', async () => {
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValueOnce({ status: 204, data: undefined } as never)

    const result = await buildingService.remove(5)

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith('/buildings/5')
    expect(result).toBeUndefined()
  })

  it('S08 & S09 — propaga erros 400, 401, 403, 404, 409, 500 e falha de rede sem retry automático', async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(makeHttpError(status))
      await expect(
        buildingService.create({
          name: 'Bloco Norte',
          address: 'Av. Central, 100',
          pickupPoint: 'Portaria',
          serviceHours: '08h às 18h',
        }),
      ).rejects.toMatchObject({ response: { status } })
      expect(postSpy).toHaveBeenCalledTimes(1)
      vi.restoreAllMocks()
    }

    const deleteSpy = vi.spyOn(api, 'delete').mockRejectedValueOnce(new Error('Network Error'))
    await expect(buildingService.remove(3)).rejects.toThrow('Network Error')
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })

  it('S10 — nunca envia requisições para /admin/buildings, /building ou endpoints fictícios', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: [] } as never)
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: makeBuilding() } as never)
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: makeBuilding() } as never)
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined } as never)

    await buildingService.list()
    await buildingService.getById(2)
    await buildingService.create({
      name: 'Bloco Novo',
      address: 'Rua A, 50',
      pickupPoint: 'Sala 1',
      serviceHours: '08h às 17h',
    })
    await buildingService.update(2, { name: 'Bloco Editado' })
    await buildingService.remove(2)

    const calledUrls = [
      ...getSpy.mock.calls.map((c) => c[0]),
      ...postSpy.mock.calls.map((c) => c[0]),
      ...patchSpy.mock.calls.map((c) => c[0]),
      ...deleteSpy.mock.calls.map((c) => c[0]),
    ]
    for (const url of calledUrls) {
      expect(url).toMatch(/^\/buildings(\/\d+)?$/)
      expect(url).not.toContain('/admin/buildings')
      expect(url).not.toMatch(/^\/building(\/|$)/)
    }
  })
})
