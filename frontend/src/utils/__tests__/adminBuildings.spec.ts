import { describe, it, expect } from 'vitest'
import {
  BUILDING_LIMITS,
  isValidBuilding,
  isValidBuildingList,
  validateBuildingForm,
  buildBuildingCreatePayload,
  buildBuildingPatchPayload,
} from '../adminBuildings'
import type { Building } from '@/types'

const makeBuilding = (overrides: Record<string, unknown> = {}): Building =>
  ({
    id: 1,
    name: 'Bloco de Engenharia',
    address: 'Rua Exemplo, 123',
    pickupPoint: 'Recepção principal',
    serviceHours: 'Segunda a sexta, das 8h às 17h',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Building

describe('adminBuildings utils (Etapa 13)', () => {
  it('V01 & V13 — aceita DTO de prédio válido e valida expectedId quando informado', () => {
    const valid = makeBuilding({ id: 12 })
    expect(isValidBuilding(valid)).toBe(true)
    expect(isValidBuilding(valid, 12)).toBe(true)
    expect(isValidBuilding(valid, 99)).toBe(false)
  })

  it('V02 — rejeita ID zero, negativo, fracionário, string ou inseguro', () => {
    for (const badId of [0, -1, 1.5, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      expect(isValidBuilding(makeBuilding({ id: badId }))).toBe(false)
    }
  })

  it('V03 & V04 — rejeita campos obrigatórios ausentes ou com tipo incorreto', () => {
    expect(isValidBuilding(null)).toBe(false)
    expect(isValidBuilding([])).toBe(false)
    for (const field of ['name', 'address', 'pickupPoint', 'serviceHours', 'createdAt'] as const) {
      expect(isValidBuilding(makeBuilding({ [field]: undefined }))).toBe(false)
      expect(isValidBuilding(makeBuilding({ [field]: '' }))).toBe(false)
      expect(isValidBuilding(makeBuilding({ [field]: '   ' }))).toBe(false)
      expect(isValidBuilding(makeBuilding({ [field]: 123 }))).toBe(false)
    }
  })

  it('V05 — respeita exatamente os limites mínimos e máximos do backend', () => {
    expect(BUILDING_LIMITS).toEqual({
      name: { min: 3, max: 150 },
      address: { min: 5, max: 255 },
      pickupPoint: { min: 3, max: 200 },
      serviceHours: { min: 3, max: 200 },
    })

    // Mínimos exatos aceitos
    const minResult = validateBuildingForm({
      name: 'ABC',
      address: 'Rua 1',
      pickupPoint: 'SAC',
      serviceHours: '24h',
    })
    expect(minResult.valid).toBe(true)

    // Abaixo do mínimo e apenas espaços rejeitados
    const tooShort = validateBuildingForm({
      name: 'AB',
      address: 'Rua ',
      pickupPoint: 'SA',
      serviceHours: '24',
    })
    expect(tooShort.valid).toBe(false)
    expect(tooShort.payload).toBeNull()
    expect(tooShort.errors.name).toBeTruthy()
    expect(tooShort.errors.address).toBeTruthy()
    expect(tooShort.errors.pickupPoint).toBeTruthy()
    expect(tooShort.errors.serviceHours).toBeTruthy()

    // Máximos exatos aceitos
    const maxOk = validateBuildingForm({
      name: 'A'.repeat(150),
      address: 'B'.repeat(255),
      pickupPoint: 'C'.repeat(200),
      serviceHours: 'D'.repeat(200),
    })
    expect(maxOk.valid).toBe(true)

    // Acima do máximo rejeitados sem truncar silenciosamente
    const tooLong = validateBuildingForm({
      name: 'A'.repeat(151),
      address: 'B'.repeat(256),
      pickupPoint: 'C'.repeat(201),
      serviceHours: 'D'.repeat(201),
    })
    expect(tooLong.valid).toBe(false)
    expect(tooLong.errors.name).toBeTruthy()
    expect(tooLong.errors.address).toBeTruthy()
    expect(tooLong.errors.pickupPoint).toBeTruthy()
    expect(tooLong.errors.serviceHours).toBeTruthy()
  })

  it('V06 — rejeita createdAt inválido', () => {
    for (const badDate of ['data-invalida', '', '   ', null, undefined, 1700000000]) {
      expect(isValidBuilding(makeBuilding({ createdAt: badDate }))).toBe(false)
    }
  })

  it('V07, V08 & V09 — aceita lista vazia [], rejeita lista com item inválido ou IDs duplicados', () => {
    expect(isValidBuildingList([])).toBe(true)
    expect(isValidBuildingList([makeBuilding({ id: 1 }), makeBuilding({ id: 2, name: 'Biblioteca' })])).toBe(true)
    expect(isValidBuildingList({ data: [] })).toBe(false)
    expect(isValidBuildingList([makeBuilding({ id: 1 }), { id: 2 }])).toBe(false)
    expect(
      isValidBuildingList([
        makeBuilding({ id: 5, name: 'Prédio A' }),
        makeBuilding({ id: 5, name: 'Prédio B' }),
      ]),
    ).toBe(false)
  })

  it('V10 — buildBuildingCreatePayload contém apenas os quatro campos autorizados normalizando extremidades sem alterar caracteres internos', () => {
    const payload = buildBuildingCreatePayload({
      name: '  Bloco   Central  ',
      address: '  Rua Exemplo, 123  ',
      pickupPoint: '  Recepção  ',
      serviceHours: '  Segunda a sexta, 8h às 17h  ',
    })

    expect(payload).toEqual({
      name: 'Bloco   Central',
      address: 'Rua Exemplo, 123',
      pickupPoint: 'Recepção',
      serviceHours: 'Segunda a sexta, 8h às 17h',
    })
    expect(Object.keys(payload!)).toEqual(['name', 'address', 'pickupPoint', 'serviceHours'])
  })

  it('V11 & V12 — buildBuildingPatchPayload retorna somente alterações reais e objeto vazio quando nada mudou', () => {
    const original = makeBuilding()

    const unchanged = buildBuildingPatchPayload(original, {
      name: '  Bloco de Engenharia ',
      address: original.address,
      pickupPoint: original.pickupPoint,
      serviceHours: original.serviceHours,
    })
    expect(unchanged).toEqual({})

    const partial = buildBuildingPatchPayload(original, {
      name: original.name,
      address: original.address,
      pickupPoint: '  Secretaria do bloco  ',
      serviceHours: original.serviceHours,
    })
    expect(partial).toEqual({ pickupPoint: 'Secretaria do bloco' })

    const invalid = buildBuildingPatchPayload(original, {
      name: 'AB',
      address: original.address,
      pickupPoint: original.pickupPoint,
      serviceHours: original.serviceHours,
    })
    expect(invalid).toBeNull()
  })
})
