import { describe, it, expect } from 'vitest'
import {
  CATEGORY_LIMITS,
  buildCategoryPayload,
  hasCategoryNameChanged,
  isValidCategory,
  isValidCategoryList,
  normalizeCategoryName,
  sortCategoriesByName,
  validateCategoryName,
} from '../adminCategories'
import type { Category } from '@/types'

const makeCategory = (overrides: Record<string, unknown> = {}): Category =>
  ({
    id: 1,
    name: 'Eletrônicos',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Category

describe('adminCategories utils (Etapa 14)', () => {
  it('U14-01, U14-02 & U14-03 — aceita nome válido respeitando limites exatos de 2 a 100 caracteres', () => {
    expect(CATEGORY_LIMITS).toEqual({ name: { min: 2, max: 100 } })

    const normal = validateCategoryName('Eletrônicos e Acessórios')
    expect(normal).toEqual({
      valid: true,
      normalizedName: 'Eletrônicos e Acessórios',
    })

    const minExact = validateCategoryName('TI')
    expect(minExact).toEqual({ valid: true, normalizedName: 'TI' })

    const maxExact = validateCategoryName('A'.repeat(100))
    expect(maxExact).toEqual({ valid: true, normalizedName: 'A'.repeat(100) })
  })

  it('U14-04 & U14-05 — rejeita nome vazio, somente espaços, abaixo de 2 ou acima de 100 caracteres', () => {
    for (const invalid of ['', '   ', '\t\n', 'A', ' A ', 'B'.repeat(101)]) {
      const result = validateCategoryName(invalid)
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.normalizedName).toBeNull()
    }
  })

  it('U14-06 & U14-07 — normaliza apenas extremidades sem alterar acentos ou espaços internos e gera payload exclusivo com name', () => {
    expect(normalizeCategoryName('  Documentos   Pessoais  ')).toBe('Documentos   Pessoais')
    expect(normalizeCategoryName('  Óculos & Relógios  ')).toBe('Óculos & Relógios')

    const payload = buildCategoryPayload('  Eletrônicos  ')
    expect(payload).toEqual({ name: 'Eletrônicos' })
    expect(Object.keys(payload!)).toEqual(['name'])
    expect(buildCategoryPayload('A')).toBeNull()
  })

  it('U14-08, U14-09 & U14-10 — valida Category em runtime rejeitando IDs e timestamps inválidos', () => {
    const valid = makeCategory({ id: 7, name: 'Documentos' })
    expect(isValidCategory(valid)).toBe(true)
    expect(isValidCategory(valid, 7)).toBe(true)
    expect(isValidCategory(valid, 8)).toBe(false)

    expect(isValidCategory(null)).toBe(false)
    expect(isValidCategory([])).toBe(false)

    for (const badId of [0, -2, 1.5, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      expect(isValidCategory(makeCategory({ id: badId }))).toBe(false)
    }

    for (const badName of ['', '   ', 'X', 'X'.repeat(101), 42, null, undefined]) {
      expect(isValidCategory(makeCategory({ name: badName }))).toBe(false)
    }

    for (const badDate of ['data-invalida', '', '   ', null, undefined, 1700000000]) {
      expect(isValidCategory(makeCategory({ createdAt: badDate }))).toBe(false)
    }
  })

  it('U14-11, U14-12 & U14-13 — aceita lista vazia [] e rejeita lista com ID duplicado ou DTO corrompido', () => {
    expect(isValidCategoryList([])).toBe(true)
    expect(
      isValidCategoryList([
        makeCategory({ id: 1, name: 'Acessórios' }),
        makeCategory({ id: 2, name: 'Documentos' }),
      ]),
    ).toBe(true)

    expect(isValidCategoryList({ data: [] })).toBe(false)
    expect(isValidCategoryList([makeCategory({ id: 1 }), { id: 2, name: 'Incompleta' }])).toBe(false)
    expect(
      isValidCategoryList([
        makeCategory({ id: 5, name: 'Categoria A' }),
        makeCategory({ id: 5, name: 'Categoria B' }),
      ]),
    ).toBe(false)
  })

  it('U14-14 — ordena categorias deterministicamente por nome com desempate por id sem mutar entrada', () => {
    const input = [
      makeCategory({ id: 3, name: 'Vestuário' }),
      makeCategory({ id: 2, name: 'Acessórios' }),
      makeCategory({ id: 4, name: 'Acessórios' }),
      makeCategory({ id: 1, name: 'Documentos' }),
    ]
    const snapshot = [...input]

    const sorted = sortCategoriesByName(input)

    expect(input).toEqual(snapshot)
    expect(sorted.map((c) => c.id)).toEqual([2, 4, 1, 3])
  })

  it('U14-15 — detecta quando o nome após normalização permanece inalterado para não enviar PATCH', () => {
    const original = makeCategory({ id: 3, name: 'Documentos' })
    expect(hasCategoryNameChanged(original, 'Documentos')).toBe(false)
    expect(hasCategoryNameChanged(original, '  Documentos  ')).toBe(false)
    expect(hasCategoryNameChanged(original, 'Documentos Oficiais')).toBe(true)
  })
})
