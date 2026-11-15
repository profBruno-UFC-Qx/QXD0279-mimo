import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { jobService } from '../job.service'

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

describe('jobService (Etapa 16)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S16-01 & S16-02 — runDispositionEligibility() envia POST /jobs/disposition-eligibility sem payload inventado', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { updatedCount: 3 } } as never)

    await jobService.runDispositionEligibility()

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/jobs/disposition-eligibility')
    expect(postSpy.mock.calls[0]).toHaveLength(1)
  })

  it('S16-03 — aceita resposta válida com updatedCount > 0', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { updatedCount: 5 } } as never)

    const result = await jobService.runDispositionEligibility()

    expect(result).toEqual({ updatedCount: 5 })
  })

  it('S16-04 — aceita resposta válida com updatedCount = 0', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { updatedCount: 0 } } as never)

    const result = await jobService.runDispositionEligibility()

    expect(result).toEqual({ updatedCount: 0 })
  })

  it('S16-05, S16-06 & S16-07 — propaga erros HTTP 401, 403 e 500 sem retry automático', async () => {
    const postSpy = vi.spyOn(api, 'post')
    for (const status of [401, 403, 500]) {
      postSpy.mockRejectedValueOnce(makeHttpError(status))
      await expect(jobService.runDispositionEligibility()).rejects.toMatchObject({
        response: { status },
      })
    }
    expect(postSpy).toHaveBeenCalledTimes(3)
  })

  it('S16-08 & S16-10 — propaga falha de rede sem tentar novamente', async () => {
    const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Network Error'))

    await expect(jobService.runDispositionEligibility()).rejects.toThrow('Network Error')
    expect(postSpy).toHaveBeenCalledTimes(1)
  })

  it('S16-09 — rejeita DTO inválido retornado em HTTP 200', async () => {
    const invalidPayloads: unknown[] = [
      null,
      undefined,
      {},
      { updatedCount: -1 },
      { updatedCount: 1.5 },
      { updatedCount: '5' },
      { updatedCount: Number.NaN },
      { updatedCount: Number.POSITIVE_INFINITY },
    ]

    for (const bad of invalidPayloads) {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: bad } as never)
      await expect(jobService.runDispositionEligibility()).rejects.toThrow()
    }
  })
})
