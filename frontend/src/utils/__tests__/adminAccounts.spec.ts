import { describe, it, expect } from 'vitest'
import {
  ADMIN_ACCOUNT_LIMITS,
  buildCreateAdminPayload,
  filterAdminAccounts,
  getUtf8ByteLength,
  isValidAdminAccount,
  isValidAdminAccountList,
  normalizeAdminEmail,
  normalizeAdminName,
  sortAdminAccounts,
  validateAdminEmail,
  validateAdminInitialPassword,
  validateAdminName,
} from '../adminAccounts'
import type { User } from '@/types'

const makeAdmin = (overrides: Partial<User> = {}): User => ({
  id: 2,
  name: 'Ana Silva',
  email: 'ana@ufc.br',
  phone: null,
  role: 'ADMIN',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  ...overrides,
})

describe('adminAccounts utils (Etapa 15)', () => {
  it('U15-01 — define limites alinhados ao backend real', () => {
    expect(ADMIN_ACCOUNT_LIMITS.name).toEqual({ min: 3, max: 150 })
    expect(ADMIN_ACCOUNT_LIMITS.email).toEqual({ max: 180 })
    expect(ADMIN_ACCOUNT_LIMITS.initialPassword).toEqual({ minBytes: 1, maxBytes: 1024 })
  })

  it('U15-02 — normalizeAdminName remove apenas espaços das extremidades', () => {
    expect(normalizeAdminName('  Ana   Maria  ')).toBe('Ana   Maria')
  })

  it('U15-03 — normalizeAdminEmail aplica trim e lowercase', () => {
    expect(normalizeAdminEmail('  Ana.Silva@UFC.BR  ')).toBe('ana.silva@ufc.br')
  })

  it('U15-04 — getUtf8ByteLength mede bytes UTF-8 reais inclusive multibyte', () => {
    expect(getUtf8ByteLength('abc')).toBe(3)
    expect(getUtf8ByteLength('á')).toBe(2)
    expect(getUtf8ByteLength('🔑')).toBe(4)
  })

  it('U15-05 — validateAdminName rejeita tipos inválidos, vazio, <3 e >150 caracteres após trim', () => {
    expect(validateAdminName(null).valid).toBe(false)
    expect(validateAdminName(123).valid).toBe(false)
    expect(validateAdminName('').valid).toBe(false)
    expect(validateAdminName('   ').valid).toBe(false)
    expect(validateAdminName('  An  ').valid).toBe(false)
    expect(validateAdminName('a'.repeat(151)).valid).toBe(false)
  })

  it('U15-06 — validateAdminName aceita fronteiras 3 e 150 caracteres após trim', () => {
    expect(validateAdminName('  Ana  ')).toEqual({ valid: true, normalizedName: 'Ana' })
    expect(validateAdminName('a'.repeat(150))).toEqual({
      valid: true,
      normalizedName: 'a'.repeat(150),
    })
  })

  it('U15-07 — validateAdminEmail rejeita formatos inválidos, vazio e >180 caracteres', () => {
    expect(validateAdminEmail(undefined).valid).toBe(false)
    expect(validateAdminEmail('').valid).toBe(false)
    expect(validateAdminEmail('   ').valid).toBe(false)
    expect(validateAdminEmail('email-sem-arroba').valid).toBe(false)
    expect(validateAdminEmail('ana@').valid).toBe(false)
    expect(validateAdminEmail('@ufc.br').valid).toBe(false)
    expect(validateAdminEmail('ana silva@ufc.br').valid).toBe(false)
    const tooLong = `a@${'b'.repeat(175)}.com`
    expect(tooLong.length).toBeGreaterThan(180)
    expect(validateAdminEmail(tooLong).valid).toBe(false)
  })

  it('U15-08 — validateAdminEmail normaliza e aceita até 180 caracteres', () => {
    expect(validateAdminEmail('  Ana.Admin@UFC.BR  ')).toEqual({
      valid: true,
      normalizedEmail: 'ana.admin@ufc.br',
    })
    const exactMax = `${'a'.repeat(170)}@ufc.br`
    expect(exactMax.length).toBe(177)
    expect(validateAdminEmail(exactMax)).toEqual({
      valid: true,
      normalizedEmail: exactMax,
    })
  })

  it('U15-09 — validateAdminInitialPassword rejeita não-string, vazia e >1024 bytes UTF-8', () => {
    expect(validateAdminInitialPassword(undefined).valid).toBe(false)
    expect(validateAdminInitialPassword(null).valid).toBe(false)
    expect(validateAdminInitialPassword(123).valid).toBe(false)
    expect(validateAdminInitialPassword('').valid).toBe(false)
    expect(validateAdminInitialPassword('a'.repeat(1025)).valid).toBe(false)
    expect(validateAdminInitialPassword('á'.repeat(513)).valid).toBe(false)
  })

  it('U15-10 — validateAdminInitialPassword preserva espaços exatos e aceita até 1024 bytes UTF-8', () => {
    expect(validateAdminInitialPassword('  Senha 123  ')).toEqual({
      valid: true,
      initialPassword: '  Senha 123  ',
    })
    expect(validateAdminInitialPassword(' ')).toEqual({
      valid: true,
      initialPassword: ' ',
    })
    expect(validateAdminInitialPassword('á'.repeat(512))).toEqual({
      valid: true,
      initialPassword: 'á'.repeat(512),
    })
  })

  it('U15-11 — buildCreateAdminPayload retorna somente { name, email, initialPassword } e preserva senha', () => {
    const payload = buildCreateAdminPayload({
      name: '  Ana Silva  ',
      email: '  ANA@UFC.BR  ',
      initialPassword: '  Segredo123!  ',
    })

    expect(payload).toEqual({
      name: 'Ana Silva',
      email: 'ana@ufc.br',
      initialPassword: '  Segredo123!  ',
    })
    expect(Object.keys(payload!)).toEqual(['name', 'email', 'initialPassword'])
  })

  it('U15-12 — buildCreateAdminPayload retorna null se qualquer campo for inválido', () => {
    expect(
      buildCreateAdminPayload({ name: 'An', email: 'ana@ufc.br', initialPassword: '123' }),
    ).toBeNull()
    expect(
      buildCreateAdminPayload({ name: 'Ana', email: 'invalido', initialPassword: '123' }),
    ).toBeNull()
    expect(
      buildCreateAdminPayload({ name: 'Ana', email: 'ana@ufc.br', initialPassword: '' }),
    ).toBeNull()
  })

  it('U15-13 — isValidAdminAccount aceita DTO ADMIN completo válido', () => {
    const admin = makeAdmin({ phone: '(88) 99999-0000' })
    expect(isValidAdminAccount(admin)).toBe(true)
    expect(isValidAdminAccount(admin, 2)).toBe(true)
  })

  it('U15-14 — isValidAdminAccount rejeita papéis USER e SUPERADMIN', () => {
    expect(isValidAdminAccount(makeAdmin({ role: 'USER' }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ role: 'SUPERADMIN' }))).toBe(false)
  })

  it('U15-15 — isValidAdminAccount rejeita ID inválido ou divergente de expectedId', () => {
    expect(isValidAdminAccount(makeAdmin({ id: 0 }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ id: -5 }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ id: 1.5 }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ id: 3 }), 2)).toBe(false)
  })

  it('U15-16 — isValidAdminAccount rejeita DTO com campos sensíveis expostos', () => {
    expect(isValidAdminAccount({ ...makeAdmin(), password: '123' })).toBe(false)
    expect(isValidAdminAccount({ ...makeAdmin(), passwordHash: 'scrypt:abc' })).toBe(false)
    expect(isValidAdminAccount({ ...makeAdmin(), password_hash: 'scrypt:abc' })).toBe(false)
    expect(isValidAdminAccount({ ...makeAdmin(), initialPassword: '123' })).toBe(false)
  })

  it('U15-17 — isValidAdminAccount rejeita timestamps ou atributos inválidos', () => {
    expect(isValidAdminAccount(null)).toBe(false)
    expect(isValidAdminAccount([])).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ name: 'Ab' }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ email: 'invalido' }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ phone: 123 as never }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ createdAt: 'data-invalida' }))).toBe(false)
    expect(isValidAdminAccount(makeAdmin({ updatedAt: '' }))).toBe(false)
  })

  it('U15-18 — isValidAdminAccountList aceita array vazio e lista válida de ADMINs', () => {
    expect(isValidAdminAccountList([])).toBe(true)
    expect(isValidAdminAccountList([makeAdmin({ id: 2 }), makeAdmin({ id: 3, email: 'b@ufc.br' })])).toBe(true)
  })

  it('U15-19 — isValidAdminAccountList rejeita não-array, item inválido e IDs duplicados', () => {
    expect(isValidAdminAccountList(null)).toBe(false)
    expect(isValidAdminAccountList({ items: [] })).toBe(false)
    expect(
      isValidAdminAccountList([makeAdmin({ id: 2 }), makeAdmin({ id: 2, email: 'outro@ufc.br' })]),
    ).toBe(false)
    expect(
      isValidAdminAccountList([makeAdmin({ id: 2 }), makeAdmin({ id: 3, role: 'SUPERADMIN' })]),
    ).toBe(false)
  })

  it('U15-20 — sortAdminAccounts ordena deterministicamente por nome com desempate por id sem mutar entrada', () => {
    const input = [
      makeAdmin({ id: 9, name: 'Carlos', email: 'c@ufc.br' }),
      makeAdmin({ id: 5, name: 'Ana', email: 'a5@ufc.br' }),
      makeAdmin({ id: 2, name: 'Ana', email: 'a2@ufc.br' }),
    ]
    const snapshot = [...input]

    const sorted = sortAdminAccounts(input)

    expect(sorted.map((a) => `${a.name}#${a.id}`)).toEqual(['Ana#2', 'Ana#5', 'Carlos#9'])
    expect(input).toEqual(snapshot)
  })

  it('U15-21 — filterAdminAccounts filtra por nome e por e-mail ignorando maiúsculas e espaços laterais', () => {
    const admins = [
      makeAdmin({ id: 2, name: 'Ana Beatriz', email: 'ana@ufc.br' }),
      makeAdmin({ id: 3, name: 'Bruno Lima', email: 'contato.coord@ufc.br' }),
    ]

    expect(filterAdminAccounts(admins, '   ').length).toBe(2)
    expect(filterAdminAccounts(admins, '  BEAT  ').map((a) => a.id)).toEqual([2])
    expect(filterAdminAccounts(admins, 'COORD@UFC').map((a) => a.id)).toEqual([3])
    expect(filterAdminAccounts(admins, 'inexistente')).toEqual([])
  })
})
