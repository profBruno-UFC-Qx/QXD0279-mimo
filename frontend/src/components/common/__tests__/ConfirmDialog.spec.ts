import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { vuetify } from '@/theme'
import { useUiStore } from '@/stores/uiStore'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof globalThis.visualViewport === 'undefined') {
  Object.defineProperty(globalThis, 'visualViewport', {
    value: {
      width: 1280,
      height: 800,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
  })
}

const mountedWrappers: VueWrapper[] = []

function findBodyButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  ) as HTMLButtonElement | undefined
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ConfirmDialog (Etapa 17 — R17-CONF-05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
  })

  it('R17-CONF-05a — confirmar resolve a Promise exatamente uma vez com true e fecha diálogo', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    mountedWrappers.push(wrapper)

    const ui = useUiStore()
    let resolutions = 0
    let resolvedValue: boolean | undefined
    const promise = ui
      .confirm({
        title: 'Confirmar ação',
        message: 'Deseja continuar?',
        confirmText: 'Sim, confirmar',
        cancelText: 'Voltar',
      })
      .then((val) => {
        resolutions += 1
        resolvedValue = val
        return val
      })

    await flushPromises()
    await nextTick()

    const confirmBtn = findBodyButton('Sim, confirmar')!
    expect(confirmBtn).toBeDefined()
    confirmBtn.click()
    await flushPromises()
    await nextTick()

    await expect(promise).resolves.toBe(true)
    expect(resolutions).toBe(1)
    expect(resolvedValue).toBe(true)
    expect(ui.confirmDialog.show).toBe(false)
    expect(ui.confirmDialog.open).toBe(false)
  })

  it('R17-CONF-05b — cancelar resolve a Promise exatamente uma vez com false e fecha diálogo', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    mountedWrappers.push(wrapper)

    const ui = useUiStore()
    let resolutions = 0
    const promise = ui
      .confirm({
        title: 'Cancelar ação',
        message: 'Confirma?',
        confirmText: 'Confirmar',
        cancelText: 'Desistir',
      })
      .then((val) => {
        resolutions += 1
        return val
      })

    await flushPromises()
    await nextTick()

    findBodyButton('Desistir')!.click()
    await flushPromises()
    await nextTick()

    await expect(promise).resolves.toBe(false)
    expect(resolutions).toBe(1)
    expect(ui.confirmDialog.show).toBe(false)
    expect(ui.confirmDialog.open).toBe(false)
  })

  it('R17-CONF-05c — callback onConfirm assíncrono bloqueia duplo clique e resolve uma única vez ao finalizar', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    mountedWrappers.push(wrapper)

    const gate = deferred<void>()
    const onConfirmSpy = vi.fn().mockImplementation(() => gate.promise)

    const ui = useUiStore()
    let settled = false
    const promise = ui
      .confirm({
        title: 'Ação assíncrona',
        message: 'Aguarde o término.',
        confirmText: 'Executar',
        cancelText: 'Voltar',
        onConfirm: onConfirmSpy,
      })
      .then((val) => {
        settled = true
        return val
      })

    await flushPromises()
    await nextTick()

    const confirmBtn = findBodyButton('Executar')!
    confirmBtn.click()
    confirmBtn.click()
    await flushPromises()
    await nextTick()

    expect(onConfirmSpy).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    gate.resolve()
    await flushPromises()
    await nextTick()

    await expect(promise).resolves.toBe(true)
    expect(settled).toBe(true)
    expect(ui.confirmDialog.show).toBe(false)
  })

  it('R17-CONF-05d — erro em onConfirm fecha o diálogo com segurança e resolve Promise com false sem rejeição não tratada', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    mountedWrappers.push(wrapper)

    const onConfirmSpy = vi.fn().mockRejectedValueOnce(new Error('Falha no callback'))
    const ui = useUiStore()
    const promise = ui.confirm({
      title: 'Callback com erro',
      message: 'Não pode travar.',
      confirmText: 'Tentar',
      cancelText: 'Cancelar',
      onConfirm: onConfirmSpy,
    })

    await flushPromises()
    await nextTick()

    findBodyButton('Tentar')!.click()
    await flushPromises()
    await nextTick()

    await expect(promise).resolves.toBe(false)
    expect(onConfirmSpy).toHaveBeenCalledTimes(1)
    expect(ui.confirmDialog.show).toBe(false)
    expect(ui.confirmDialog.open).toBe(false)
  })
})
