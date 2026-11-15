import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../api'
import { adminService, type CreateAdminPayload } from '../admin.service'
import type { User } from '@/types'

const makeAdmin = (overrides: Partial<User> = {}): User => ({
  id: 2,
  name: 'Ana Silva',
  email: 'ana@ufc.br',
  phone: null,
  role: 'ADMIN',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
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

describe('adminService (Etapa 15)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('S15-01 — list() chama GET /admins e retorna administradores', async () => {
    const admins = [makeAdmin({ id: 2, name: 'Ana' }), makeAdmin({ id: 3, name: 'Bruno', email: 'bruno@ufc.br' })]
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: admins } as never)

    const result = await adminService.list()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/admins')
    expect(result).toEqual(admins)
  })

  it('S15-02 — getById() chama GET /admins/:id e retorna administrador', async () => {
    const admin = makeAdmin({ id: 7, name: 'Carlos', email: 'carlos@ufc.br' })
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: admin } as never)

    const result = await adminService.getById(7)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/admins/7')
    expect(result).toEqual(admin)
  })

  it('S15-03 — create() envia POST /admins com { name, email, initialPassword } e preserva espaços na senha', async () => {
    const payload: CreateAdminPayload = {
      name: 'Ana Silva',
      email: 'ana@ufc.br',
      initialPassword: '  SenhaInicial 123  ',
    }
    const created = makeAdmin({ id: 10 })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: created } as never)

    const result = await adminService.create(payload)

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/admins', {
      name: 'Ana Silva',
      email: 'ana@ufc.br',
      initialPassword: '  SenhaInicial 123  ',
    })
    expect(Object.keys(postSpy.mock.calls[0][1] as object)).toEqual([
      'name',
      'email',
      'initialPassword',
    ])
    expect(result).toEqual(created)
  })

  it('S15-04 — create() descarta campos proibidos ou extras em runtime (role, phone, password)', async () => {
    const dirtyPayload = {
      name: 'Ana Silva',
      email: 'ana@ufc.br',
      initialPassword: 'Segredo123!',
      role: 'SUPERADMIN',
      phone: '(88) 99999-0000',
      password: 'outra',
      id: 999,
    } as unknown as CreateAdminPayload
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: makeAdmin() } as never)

    await adminService.create(dirtyPayload)

    const sentBody = postSpy.mock.calls[0][1] as Record<string, unknown>
    expect(sentBody).toEqual({
      name: 'Ana Silva',
      email: 'ana@ufc.br',
      initialPassword: 'Segredo123!',
    })
    expect('role' in sentBody).toBe(false)
    expect('phone' in sentBody).toBe(false)
    expect('password' in sentBody).toBe(false)
    expect('id' in sentBody).toBe(false)
  })

  it('S15-05 — remove() envia DELETE /admins/:id e trata HTTP 204 sem corpo JSON', async () => {
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValueOnce({ status: 204, data: undefined } as never)

    const result = await adminService.remove(5)

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith('/admins/5')
    expect(result).toBeUndefined()
  })

  it('S15-06 — propaga erros HTTP (400, 401, 403, 404, 409, 500) sem mascarar ou repetir chamadas', async () => {
    const postSpy = vi.spyOn(api, 'post')
    for (const status of [400, 401, 403, 404, 409, 500]) {
      postSpy.mockRejectedValueOnce(makeHttpError(status))
      await expect(
        adminService.create({ name: 'Ana', email: 'ana@ufc.br', initialPassword: '123' }),
      ).rejects.toMatchObject({ response: { status } })
    }
    expect(postSpy).toHaveBeenCalledTimes(6)

    const deleteSpy = vi.spyOn(api, 'delete').mockRejectedValueOnce(makeHttpError(409))
    await expect(adminService.remove(4)).rejects.toMatchObject({ response: { status: 409 } })
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })

  it('S15-07 — propaga falha de rede sem tentar novamente', async () => {
    const networkErr = new Error('Network Error')
    const getSpy = vi.spyOn(api, 'get').mockRejectedValueOnce(networkErr)

    await expect(adminService.list()).rejects.toThrow('Network Error')
    expect(getSpy).toHaveBeenCalledTimes(1)
  })
})
