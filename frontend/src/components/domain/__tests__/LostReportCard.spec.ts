import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LostReportCard from '../LostReportCard.vue'
import { vuetify } from '@/theme'
import { formatDate } from '@/utils/format'
import type { LostReport } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeReport = (overrides: Partial<LostReport> = {}): LostReport => ({
  id: 1,
  userId: 1,
  categoryId: 3,
  buildingId: 5,
  confirmedItemId: null,
  description: 'Garrafa térmica preta',
  lossDate: '2026-10-23',
  status: 'OPEN',
  createdAt: '2026-10-24T12:00:00.000Z',
  ...overrides,
})

function mountCard(lostReport: LostReport, slots?: { actions?: string }) {
  return mount(LostReportCard, {
    props: { lostReport },
    slots,
    global: {
      plugins: [vuetify],
    },
  })
}

describe('LostReportCard', () => {
  it('L08 — exibe descrição, Categoria #N, Prédio #N, data formatada e status em português sem depender de title/category.name/building.name', () => {
    const wrapper = mountCard(
      makeReport({
        description: 'Caderno universitário azul',
        categoryId: 3,
        buildingId: 5,
        lossDate: '2026-10-23',
        status: 'OPEN',
      }),
    )

    const text = wrapper.text()
    expect(text).toContain('Caderno universitário azul')
    expect(text).toContain('Categoria #3')
    expect(text).toContain('Prédio #5')
    expect(text).toContain('23/10/2026')
    expect(text).toContain('Aberta')
  })

  it('L09 — quando buildingId é null, exibe "Qualquer prédio"', () => {
    const wrapper = mountCard(makeReport({ buildingId: null }))

    expect(wrapper.text()).toContain('Qualquer prédio')
    expect(wrapper.text()).not.toContain('Prédio #null')
  })

  it('L10 — formata lossDate YYYY-MM-DD como DD/MM/YYYY sem deslocamento de fuso horário', () => {
    expect(formatDate('2026-10-23')).toBe('23/10/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')

    const wrapper = mountCard(makeReport({ lossDate: '2026-10-23' }))
    expect(wrapper.text()).toContain('Perdido em 23/10/2026')
    expect(wrapper.text()).not.toContain('22/10/2026')
  })

  it('L11 — renderiza rótulos corretos de status para OPEN, RESOLVED e CANCELLED', () => {
    expect(mountCard(makeReport({ status: 'OPEN' })).text()).toContain('Aberta')
    expect(mountCard(makeReport({ status: 'RESOLVED' })).text()).toContain('Resolvida')
    expect(mountCard(makeReport({ status: 'CANCELLED' })).text()).toContain('Cancelada')
  })

  it('suporta descrições longas sem truncar os dados no DOM e preserva slot actions', () => {
    const longDescription =
      'Mochila preta grande com vários zíperes, chaveiro prateado, caderno de Cálculo II e estojo azul dentro.'
    const wrapper = mountCard(makeReport({ description: longDescription }), {
      actions: '<button type="button" data-test="slot-action">Ação</button>',
    })

    expect(wrapper.text()).toContain(longDescription)
    expect(wrapper.find('[data-test="slot-action"]').exists()).toBe(true)
  })
})
