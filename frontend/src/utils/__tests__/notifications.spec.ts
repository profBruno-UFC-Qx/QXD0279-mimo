import { describe, it, expect } from 'vitest'
import {
  getNotificationPresentation,
  isNotificationRead,
  isValidNotification,
  isValidNotificationList,
  isValidUnreadCount,
  resolveNotificationRoute,
} from '../notifications'
import type { Notification } from '@/types'

const makeNotification = (overrides: Record<string, unknown> = {}): Notification =>
  ({
    id: 15,
    userId: 3,
    type: 'MATCH_FOUND',
    linkUrl: '/lost-reports/12',
    readAt: null,
    createdAt: '2026-11-14T15:30:00.000Z',
    ...overrides,
  }) as unknown as Notification

describe('utils/notifications — validação, apresentação e navegação segura', () => {
  it('T06 — isValidUnreadCount aceita inteiros seguros não negativos e rejeita valores inválidos ou legado unreadCount', () => {
    expect(isValidUnreadCount({ count: 0 })).toBe(true)
    expect(isValidUnreadCount({ count: 4 })).toBe(true)

    expect(isValidUnreadCount({ count: -1 })).toBe(false)
    expect(isValidUnreadCount({ count: 1.5 })).toBe(false)
    expect(isValidUnreadCount({ count: Number.NaN })).toBe(false)
    expect(isValidUnreadCount({ count: '4' })).toBe(false)
    expect(isValidUnreadCount(null)).toBe(false)
    expect(isValidUnreadCount({})).toBe(false)
    expect(isValidUnreadCount({ unreadCount: 4 })).toBe(false)
  })

  it('T07, T08 & T13 — isValidNotification valida DTO real e isNotificationRead usa estritamente readAt !== null', () => {
    const unread = makeNotification({ readAt: null })
    const read = makeNotification({ id: 16, readAt: '2026-11-14T16:00:00.000Z' })

    expect(isValidNotification(unread)).toBe(true)
    expect(isValidNotification(read)).toBe(true)
    expect(isNotificationRead(unread)).toBe(false)
    expect(isNotificationRead(read)).toBe(true)

    expect(isValidNotification(null)).toBe(false)
    expect(isValidNotification(makeNotification({ id: 0 }))).toBe(false)
    expect(isValidNotification(makeNotification({ id: -5 }))).toBe(false)
    expect(isValidNotification(makeNotification({ id: 9007199254740992 }))).toBe(false)
    expect(isValidNotification(makeNotification({ userId: 0 }))).toBe(false)
    expect(isValidNotification(makeNotification({ type: 'UNKNOWN_TYPE' }))).toBe(false)
    expect(isValidNotification(makeNotification({ linkUrl: '' }))).toBe(false)
    expect(isValidNotification(makeNotification({ createdAt: 'not-a-date' }))).toBe(false)
    expect(isValidNotification(makeNotification({ createdAt: '2026-11-14' }))).toBe(false)
    expect(isValidNotification(makeNotification({ readAt: '2026-11-14' }))).toBe(false)
    expect(isValidNotification(makeNotification({ readAt: 'invalid-ts' }))).toBe(false)
    expect(isValidNotification({ id: 1, userId: 3 })).toBe(false)
  })

  it('T09, T10 & T11 — isValidNotificationList rejeita não-array, item inválido, IDs duplicados e userId de terceiro', () => {
    const validList = [
      makeNotification({ id: 15, userId: 3 }),
      makeNotification({ id: 14, userId: 3, type: 'REPORT_RESOLVED', readAt: '2026-11-13T10:00:00.000Z' }),
    ]

    expect(isValidNotificationList(validList, 3)).toBe(true)
    expect(isValidNotificationList([], 3)).toBe(true)

    expect(isValidNotificationList({ data: validList }, 3)).toBe(false)
    expect(
      isValidNotificationList([makeNotification({ id: 15, userId: 3 }), { id: 16 }], 3),
    ).toBe(false)
    expect(
      isValidNotificationList(
        [makeNotification({ id: 15, userId: 3 }), makeNotification({ id: 15, userId: 3 })],
        3,
      ),
    ).toBe(false)
    expect(
      isValidNotificationList(
        [makeNotification({ id: 15, userId: 3 }), makeNotification({ id: 16, userId: 99 })],
        3,
      ),
    ).toBe(false)
  })

  it('T12 & T48 — getNotificationPresentation deriva título, mensagem e ícone para os 3 tipos sem depender de campos fictícios', () => {
    const match = getNotificationPresentation('MATCH_FOUND')
    const claimed = getNotificationPresentation('ITEM_CLAIMED')
    const resolved = getNotificationPresentation('REPORT_RESOLVED')

    expect(match.title).toBeTruthy()
    expect(match.message).toBeTruthy()
    expect(match.icon).toBeTruthy()

    expect(claimed.title).toBeTruthy()
    expect(claimed.message).toBeTruthy()
    expect(claimed.icon).toBeTruthy()

    expect(resolved.title).toBeTruthy()
    expect(resolved.message).toBeTruthy()
    expect(resolved.icon).toBeTruthy()

    expect(new Set([match.title, claimed.title, resolved.title]).size).toBe(3)
  })

  it('T14, T15, T16, T17 & T18 — resolveNotificationRoute converte apenas rotas conhecidas e bloqueia links perigosos ou sem permissão', () => {
    expect(resolveNotificationRoute('/lost-reports/12', 'USER')).toEqual({
      name: 'lost-report-detail',
      params: { id: 12 },
    })
    expect(resolveNotificationRoute('/items/25', 'USER')).toEqual({
      name: 'item-detail',
      params: { id: 25 },
    })

    expect(resolveNotificationRoute('/admin/items/25', 'ADMIN')).toEqual({
      name: 'admin-item-detail',
      params: { id: 25 },
    })
    expect(resolveNotificationRoute('/admin/items/25', 'SUPERADMIN')).toEqual({
      name: 'admin-item-detail',
      params: { id: 25 },
    })
    expect(resolveNotificationRoute('/admin/items/25', 'USER')).toBeNull()
    expect(resolveNotificationRoute('/admin/items/25', null)).toBeNull()

    const unsafeOrInvalid = [
      'javascript:alert(1)',
      'https://site-externo.com/lost-reports/12',
      '//site-externo.com/items/25',
      '../../../admin',
      '/admin/items/abc',
      '/lost-reports/12abc',
      '/lost-reports/0012',
      '/lost-reports/0',
      '/lost-reports/-1',
      '/lost-reports/1.5',
      '/lost-reports/9007199254740992',
      '/items/25?redirect=https://evil.com',
      '/items/25#frag',
      '/desconhecido/99',
    ]

    for (const raw of unsafeOrInvalid) {
      expect(resolveNotificationRoute(raw, 'ADMIN')).toBeNull()
    }
  })
})
