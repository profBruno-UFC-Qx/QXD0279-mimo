import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import SuggestionCard from '../SuggestionCard.vue'
import { vuetify } from '@/theme'
import type { PublicCatalogItem } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makePublicItem = (overrides: Partial<PublicCatalogItem> = {}): PublicCatalogItem => ({
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

function createCardRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/minhas-perdas/:id', name: 'lost-report-detail', component: { template: '<div />' } },
      { path: '/itens/:id', name: 'item-detail', component: { template: '<div data-test="item-detail" />' } },
    ],
  })
}

async function mountCard(
  item: PublicCatalogItem,
  props: {
    mode?: 'preview' | 'confirm' | 'interactive'
    state?: 'waiting' | 'confirmed' | 'discarded'
    score?: number
    confirming?: boolean
    disabled?: boolean
  } = {},
) {
  const router = createCardRouter()
  await router.push('/minhas-perdas/12')
  await router.isReady()

  const wrapper = mount(SuggestionCard, {
    props: {
      item,
      mode: props.mode ?? 'preview',
      ...(props.state !== undefined ? { state: props.state } : {}),
      ...(props.score !== undefined ? { score: props.score } : {}),
      ...(props.confirming !== undefined ? { confirming: props.confirming } : {}),
      ...(props.disabled !== undefined ? { disabled: props.disabled } : {}),
    },
    global: {
      plugins: [vuetify, router],
    },
  })

  return { wrapper, router }
}

describe('SuggestionCard (Etapa 08 — Somente leitura com DTO público)', () => {
  it('S04 & S07 — exibe DTO público completo com título, descrição, categoria, prédio, local, status e data formatada', async () => {
    const { wrapper } = await mountCard(makePublicItem())
    const text = wrapper.text()

    expect(text).toContain('Mochila preta')
    expect(text).toContain('Mochila encontrada no bloco principal.')
    expect(text).toContain('Bolsas e mochilas')
    expect(text).toContain('Bloco principal')
    expect(text).toContain('Corredor do primeiro andar')
    expect(text).toContain('Disponível')
    expect(text).toContain('06/11/2026')
    expect(text).not.toContain('05/11/2026')
    expect(wrapper.findComponent({ name: 'StatusChip' }).exists()).toBe(true)
  })

  it('S08 — aceita e apresenta itens ELIGIBLE em modo preview', async () => {
    const { wrapper } = await mountCard(makePublicItem({ status: 'ELIGIBLE' }))
    expect(wrapper.text()).toContain('Elegível à destinação')
  })

  it('S05 — apresenta imagem com alt adequado para foto válida e placeholder para photos vazio ou URL insegura', async () => {
    const withPhoto = await mountCard(makePublicItem({ title: 'Caderno azul', photos: [{ id: 1, url: 'https://cdn.ufc.br/foto.jpg' }] }))
    const img = withPhoto.wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://cdn.ufc.br/foto.jpg')
    expect(img.attributes('alt')).toContain('Caderno azul')

    const withoutPhoto = await mountCard(makePublicItem({ photos: [] }))
    expect(withoutPhoto.wrapper.find('img').exists()).toBe(false)
    expect(withoutPhoto.wrapper.find('.mdi-image, .mdi-image-outline').exists()).toBe(true)

    const unsafePhoto = await mountCard(makePublicItem({ photos: [{ id: 2, url: 'javascript:alert(1)' }] }))
    expect(unsafePhoto.wrapper.find('img').exists()).toBe(false)
    expect(unsafePhoto.wrapper.html()).not.toContain('javascript:alert(1)')
  })

  it('S06 — campos nulos (description e foundLocation null) não exibem "null" nem "undefined"', async () => {
    const { wrapper } = await mountCard(makePublicItem({ description: null, foundLocation: null }))
    const text = wrapper.text()

    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
    expect(text).toContain('Mochila preta')
  })

  it('S10 & S11 — modo preview não exibe score, compatibilidade ou ações de confirmação/descarte e não emite eventos de escrita', async () => {
    const { wrapper } = await mountCard(makePublicItem(), {
      mode: 'preview',
      state: 'waiting',
      score: 95,
    })

    const text = wrapper.text()
    expect(text).not.toContain('95%')
    expect(text).not.toContain('Compatibilidade')
    expect(text).not.toContain('É este!')
    expect(text).not.toContain('Não é meu')
    expect(text).not.toContain('Confirmar')
    expect(text).not.toContain('Descartar')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('discard')).toBeUndefined()
  })

  it('S12 — ação "Ver detalhes do item" navega via rota nomeada item-detail sem depender de URL manual', async () => {
    const { wrapper, router } = await mountCard(makePublicItem({ id: 73 }))
    const pushSpy = vi.spyOn(router, 'push')

    const detailsControl = wrapper
      .findAll('a, button')
      .find((el) => el.text().includes('Ver detalhes do item'))

    expect(detailsControl).toBeDefined()
    expect(detailsControl!.attributes('href')).toBe('/itens/73')

    await detailsControl!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe('item-detail')
    })

    expect(router.currentRoute.value.params.id).toBe('73')
    expect(pushSpy).toHaveBeenCalled()
  })

  it('F06 — modo confirm exibe "Ver detalhes do item" e "É este!" sem "Não é meu" ou score e emite confirm', async () => {
    const { wrapper } = await mountCard(makePublicItem({ id: 25 }), {
      mode: 'confirm',
      score: 88,
    })

    const text = wrapper.text()
    expect(text).toContain('Ver detalhes do item')
    expect(text).toContain('É este!')
    expect(text).not.toContain('Não é meu')
    expect(text).not.toContain('Compatibilidade')
    expect(text).not.toContain('88%')

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('É este!'))
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('discard')).toBeUndefined()
  })

  it('F06 & F13 — modo confirm desabilita ação de confirmação quando disabled ou confirming é true', async () => {
    const { wrapper } = await mountCard(makePublicItem({ id: 25 }), {
      mode: 'confirm',
      confirming: true,
      disabled: true,
    })

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('É este!'))
    expect(confirmBtn).toBeDefined()
    expect(confirmBtn!.attributes('disabled')).toBeDefined()

    await confirmBtn!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
