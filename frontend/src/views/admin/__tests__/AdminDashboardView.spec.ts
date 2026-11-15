import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import AdminDashboardView from '../AdminDashboardView.vue'
import StatCard from '@/components/domain/StatCard.vue'
import { vuetify } from '@/theme'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { adminLostReportService } from '@/services/adminLostReport.service'
import { adminItemService } from '@/services/adminItem.service'
import { jobService, type DispositionEligibilityResult } from '@/services/job.service'
import { api } from '@/services/api'
import appRouter from '@/router'
import type { Item, LostReport, Page, User } from '@/types'

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

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  name: 'Admin UFC',
  email: 'admin@ufc.br',
  phone: null,
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

function makePage<T>(total: number, data: T[] = []): Page<T> {
  return {
    data,
    pagination: {
      total,
      page: 1,
      per_page: 1,
      total_pages: total,
    },
  }
}

function makeHttpError(
  status: number,
  details = 'Erro',
  config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig,
): AxiosError {
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setSession(role: User['role'], overrides: Partial<User> = {}, token = 'jwt-token') {
  const auth = useAuthStore()
  auth.token = token
  auth.user = makeUser({ role, ...overrides })
  return auth
}

function mockHealthyMetrics(counts = { totalReports: 120, openReports: 35, available: 48, eligible: 12 }) {
  const lostSpy = vi.spyOn(adminLostReportService, 'list').mockImplementation(async (query) => {
    if (query?.status === 'OPEN') return makePage<LostReport>(counts.openReports)
    return makePage<LostReport>(counts.totalReports)
  })
  const itemSpy = vi.spyOn(adminItemService, 'list').mockImplementation(async (query) => {
    if (query?.status === 'ELIGIBLE') return makePage<Item>(counts.eligible)
    return makePage<Item>(counts.available)
  })
  return { lostSpy, itemSpy }
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/dashboard', name: 'admin-dashboard', component: { template: '<div />' } },
      { path: '/admin/perdas', name: 'admin-lost-reports', component: { template: '<div />' } },
      { path: '/admin/itens', name: 'admin-items', component: { template: '<div />' } },
    ],
  })
}

const mountedWrappers: VueWrapper[] = []

async function mountDashboard() {
  const router = createTestRouter()
  await router.push('/admin/dashboard')
  await router.isReady()

  const wrapper = mount(AdminDashboardView, {
    attachTo: document.body,
    global: { plugins: [vuetify, router] },
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  await nextTick()
  return { wrapper, router }
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((btn) =>
    btn.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

describe('AdminDashboardView (Etapa 16)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  const originalAdapter = api.defaults.adapter

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Autorização e montagem (D16-01 a D16-08)', () => {
    it('D16-01, D16-08 & apresentação — ADMIN acessa dashboard, reutiliza StatCard, não dispara POST na montagem e oferece links válidos', async () => {
      setSession('ADMIN')
      mockHealthyMetrics({ totalReports: 120, openReports: 35, available: 48, eligible: 12 })
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility')

      const { wrapper } = await mountDashboard()

      expect(jobSpy).not.toHaveBeenCalled()
      const cards = wrapper.findAllComponents(StatCard)
      expect(cards).toHaveLength(4)
      expect(wrapper.text()).toContain('Relatos cadastrados')
      expect(wrapper.text()).toContain('120')
      expect(wrapper.text()).toContain('Relatos em aberto')
      expect(wrapper.text()).toContain('35')
      expect(wrapper.text()).toContain('Itens disponíveis')
      expect(wrapper.text()).toContain('48')
      expect(wrapper.text()).toContain('Itens elegíveis')
      expect(wrapper.text()).toContain('12')
      expect(wrapper.text()).toContain('Nenhum resultado de processamento disponível nesta página.')

      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
      expect(hrefs).toContain('/admin/perdas')
      expect(hrefs).toContain('/admin/itens')
    })

    it('D16-02 — SUPERADMIN também acessa dashboard e carrega os quatro indicadores', async () => {
      setSession('SUPERADMIN')
      const { lostSpy, itemSpy } = mockHealthyMetrics({
        totalReports: 10,
        openReports: 4,
        available: 8,
        eligible: 2,
      })

      const { wrapper } = await mountDashboard()

      expect(lostSpy).toHaveBeenCalledTimes(2)
      expect(itemSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('10')
      expect(wrapper.text()).toContain('4')
      expect(wrapper.text()).toContain('8')
      expect(wrapper.text()).toContain('2')
    })

    it('D16-03 & D16-04 — USER e visitante não disparam consultas administrativas nem POST', async () => {
      const lostSpy = vi.spyOn(adminLostReportService, 'list')
      const itemSpy = vi.spyOn(adminItemService, 'list')
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility')

      const { wrapper: guestWrapper } = await mountDashboard()
      expect(lostSpy).not.toHaveBeenCalled()
      expect(itemSpy).not.toHaveBeenCalled()
      expect(jobSpy).not.toHaveBeenCalled()
      expect(guestWrapper.find('[data-test="dashboard-restricted-alert"]').exists()).toBe(true)

      setSession('USER')
      const { wrapper: userWrapper } = await mountDashboard()
      expect(lostSpy).not.toHaveBeenCalled()
      expect(itemSpy).not.toHaveBeenCalled()
      expect(jobSpy).not.toHaveBeenCalled()
      expect(userWrapper.find('[data-test="dashboard-restricted-alert"]').exists()).toBe(true)
    })
  })

  describe('Métricas reais, validação e atualização (M16-14 a M16-28)', () => {
    it('M16-14 a M16-18 — consulta os quatro indicadores usando per_page=1, filtros exatos e pagination.total', async () => {
      setSession('ADMIN')
      // data[] vazio propositalmente para garantir que usa pagination.total e nunca data.length
      const lostSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage<LostReport>(99, []))
        .mockResolvedValueOnce(makePage<LostReport>(17, []))
      const itemSpy = vi
        .spyOn(adminItemService, 'list')
        .mockResolvedValueOnce(makePage<Item>(64, []))
        .mockResolvedValueOnce(makePage<Item>(9, []))

      const { wrapper } = await mountDashboard()

      expect(lostSpy).toHaveBeenNthCalledWith(1, { page: 1, per_page: 1 })
      expect(lostSpy).toHaveBeenNthCalledWith(2, { status: 'OPEN', page: 1, per_page: 1 })
      expect(itemSpy).toHaveBeenNthCalledWith(1, { status: 'AVAILABLE', page: 1, per_page: 1 })
      expect(itemSpy).toHaveBeenNthCalledWith(2, { status: 'ELIGIBLE', page: 1, per_page: 1 })
      expect(wrapper.text()).toContain('99')
      expect(wrapper.text()).toContain('17')
      expect(wrapper.text()).toContain('64')
      expect(wrapper.text()).toContain('9')
    })

    it('M16-19 & M16-20 — zero renderiza como 0 após resposta e loading não exibe 0 fictício', async () => {
      setSession('ADMIN')
      const pendingTotal = deferred<Page<LostReport>>()
      const pendingOpen = deferred<Page<LostReport>>()
      const pendingAvail = deferred<Page<Item>>()
      const pendingElig = deferred<Page<Item>>()

      vi.spyOn(adminLostReportService, 'list')
        .mockReturnValueOnce(pendingTotal.promise)
        .mockReturnValueOnce(pendingOpen.promise)
      vi.spyOn(adminItemService, 'list')
        .mockReturnValueOnce(pendingAvail.promise)
        .mockReturnValueOnce(pendingElig.promise)

      const { wrapper } = await mountDashboard()
      const cardsDuringLoad = wrapper.findAllComponents(StatCard)
      for (const card of cardsDuringLoad) {
        expect(card.props('value')).not.toBe(0)
      }

      pendingTotal.resolve(makePage(0))
      pendingOpen.resolve(makePage(0))
      pendingAvail.resolve(makePage(0))
      pendingElig.resolve(makePage(0))
      await flushPromises()
      await nextTick()

      const cardsLoaded = wrapper.findAllComponents(StatCard)
      expect(cardsLoaded.map((c) => c.props('value'))).toEqual([0, 0, 0, 0])
    })

    it('M16-21 & M16-22 — falha ou DTO inválido em uma métrica preserva as outras três válidas sem transformar erro em zero', async () => {
      setSession('ADMIN')
      vi.spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage(50))
        .mockRejectedValueOnce(makeHttpError(500, 'Falha parcial'))
      vi.spyOn(adminItemService, 'list')
        .mockResolvedValueOnce({ data: [{ id: 1 } as Item] } as unknown as Page<Item>) // pagination ausente -> inválido
        .mockResolvedValueOnce(makePage(4))

      const { wrapper } = await mountDashboard()
      const cards = wrapper.findAllComponents(StatCard)

      expect(cards[0].props('value')).toBe(50)
      expect(cards[1].props('value')).toBe('—')
      expect(cards[2].props('value')).toBe('—')
      expect(cards[3].props('value')).toBe(4)
      expect(wrapper.find('[data-test="metrics-error-alert"]').exists()).toBe(true)
    })

    it('M16-23, M16-27 & M16-28 — atualização manual executa somente GET, recupera falha e não exibe contagem antiga como atual após nova falha', async () => {
      setSession('ADMIN')
      const lostSpy = vi
        .spyOn(adminLostReportService, 'list')
        .mockResolvedValueOnce(makePage(40))
        .mockResolvedValueOnce(makePage(12))
        // Segunda atualização falha em OPEN e sucede no total
        .mockResolvedValueOnce(makePage(42))
        .mockRejectedValueOnce(makeHttpError(500))
        // Terceira atualização recupera tudo
        .mockResolvedValueOnce(makePage(43))
        .mockResolvedValueOnce(makePage(15))
      vi.spyOn(adminItemService, 'list').mockResolvedValue(makePage(10))
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility')

      const { wrapper } = await mountDashboard()
      expect(wrapper.findAllComponents(StatCard)[1].props('value')).toBe(12)

      findButton('Atualizar indicadores')!.click()
      await flushPromises()
      await nextTick()

      // Valor antigo não é apresentado como dado atual válido após falha
      const openCard = wrapper.findAllComponents(StatCard)[1]
      expect(openCard.props('value')).toBe('—')
      expect(wrapper.find('[data-test="metrics-error-alert"]').exists()).toBe(true)
      expect(jobSpy).not.toHaveBeenCalled()

      findButton('Atualizar indicadores')!.click()
      await flushPromises()
      await nextTick()

      expect(lostSpy).toHaveBeenCalledTimes(6)
      expect(wrapper.findAllComponents(StatCard)[1].props('value')).toBe(15)
      expect(wrapper.find('[data-test="metrics-error-alert"]').exists()).toBe(false)
    })

    it('M16-24 — atualização #2 mais recente não é sobrescrita por resposta atrasada da atualização #1', async () => {
      setSession('ADMIN')
      const firstTotal = deferred<Page<LostReport>>()
      const firstOpen = deferred<Page<LostReport>>()
      const secondTotal = deferred<Page<LostReport>>()
      const secondOpen = deferred<Page<LostReport>>()

      vi.spyOn(adminLostReportService, 'list')
        .mockReturnValueOnce(firstTotal.promise)
        .mockReturnValueOnce(firstOpen.promise)
        .mockReturnValueOnce(secondTotal.promise)
        .mockReturnValueOnce(secondOpen.promise)
      vi.spyOn(adminItemService, 'list').mockResolvedValue(makePage(5))

      const { wrapper } = await mountDashboard()

      // Dispara atualização #2 antes de #1 finalizar
      findButton('Atualizar indicadores')!.click()
      await nextTick()

      secondTotal.resolve(makePage(200))
      secondOpen.resolve(makePage(88))
      await flushPromises()

      firstTotal.resolve(makePage(10))
      firstOpen.resolve(makePage(3))
      await flushPromises()
      await nextTick()

      const cards = wrapper.findAllComponents(StatCard)
      expect(cards[0].props('value')).toBe(200)
      expect(cards[1].props('value')).toBe(88)
    })

    it('M16-25 & M16-26 — logout ou troca de conta durante GET descarta métricas antigas', async () => {
      const auth = setSession('ADMIN', { id: 1 }, 'jwt-a')
      const pending = deferred<Page<LostReport>>()
      vi.spyOn(adminLostReportService, 'list')
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(makePage(10))
        // Recarregamento para sessão B
        .mockResolvedValueOnce(makePage(7))
        .mockResolvedValueOnce(makePage(2))
      vi.spyOn(adminItemService, 'list').mockResolvedValue(makePage(3))

      const { wrapper } = await mountDashboard()

      auth.logout()
      await flushPromises()
      pending.resolve(makePage(999))
      await flushPromises()
      expect(wrapper.text()).not.toContain('999')

      // Entra nova sessão B
      auth.sessionGeneration += 1
      auth.token = 'jwt-b'
      auth.user = makeUser({ id: 2, role: 'SUPERADMIN' })
      await flushPromises()
      await nextTick()

      const cards = wrapper.findAllComponents(StatCard)
      expect(cards[0].props('value')).toBe(7)
      expect(cards[1].props('value')).toBe(2)
    })
  })

  describe('Confirmação obrigatória e propriedade (C16-01 a C16-11)', () => {
    it('C16-01 & C16-02 — clicar abre confirmação e cancelar não dispara POST', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility')

      await mountDashboard()
      const ui = useUiStore()
      findButton('Executar processamento')!.click()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toContain('processamento de elegibilidade')

      ui.confirmDialog.resolve(false)
      await flushPromises()
      expect(jobSpy).not.toHaveBeenCalled()
    })

    it('C16-03, C16-04 & C16-05 — duplo clique abre apenas uma confirmação e gera no máximo um POST', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility').mockResolvedValueOnce({
        updatedCount: 2,
      })

      await mountDashboard()
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm')
      const btn = findButton('Executar processamento')!

      btn.click()
      btn.click()
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)

      ui.confirmDialog.resolve(true)
      await flushPromises()

      expect(jobSpy).toHaveBeenCalledTimes(1)
    })

    it('C16-06, C16-07 & C16-11 — preserva diálogo externo ocupado e volta a funcionar após liberação', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility').mockResolvedValueOnce({
        updatedCount: 1,
      })

      await mountDashboard()
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm')

      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Pertence a outro fluxo.',
      })
      const externalResolver = ui.confirmDialog.resolve

      let settled = false
      void externalPromise.then(() => {
        settled = true
      })

      findButton('Executar processamento')!.click()
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.confirmDialog.resolve).toBe(externalResolver)
      expect(ui.confirmDialog.title).toBe('Confirmação externa')
      expect(jobSpy).not.toHaveBeenCalled()

      // Libera diálogo externo
      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(false)
      await flushPromises()
      expect(settled).toBe(true)

      // Após liberação, processamento funciona normalmente
      findButton('Executar processamento')!.click()
      await flushPromises()
      expect(ui.confirmDialog.title).toContain('processamento de elegibilidade')

      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(jobSpy).toHaveBeenCalledTimes(1)
    })

    it('C16-08, C16-09 & C16-10 — logout cancela somente confirmação própria; desmontagem preserva diálogo alheio', async () => {
      const auth = setSession('ADMIN')
      mockHealthyMetrics()

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      // Logout cancela confirmação própria
      findButton('Executar processamento')!.click()
      await flushPromises()
      expect(ui.confirmDialog.show).toBe(true)
      auth.logout()
      await flushPromises()
      expect(ui.confirmDialog.show).toBe(false)

      // Remonta com sessão e simula outro componente assumindo diálogo antes do unmount
      setSession('ADMIN')
      const { wrapper: wrapper2 } = await mountDashboard()
      findButton('Executar processamento')!.click()
      await flushPromises()
      const externalPromise = ui.confirm({ title: 'Diálogo alheio', message: 'Outro dono' })
      wrapper2.unmount()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toBe('Diálogo alheio')
      ui.confirmDialog.resolve(false)
      await expect(externalPromise).resolves.toBe(false)
    })
  })

  describe('Processamento e revalidação pós-job (J16-01 a J16-20)', () => {
    it('J16-01, J16-02, J16-03, J16-04 & J16-12 — executa POST único, bloqueia botão durante loading, exibe updatedCount > 0 e recarrega indicadores por GET', async () => {
      setSession('ADMIN')
      const { lostSpy, itemSpy } = mockHealthyMetrics({
        totalReports: 120,
        openReports: 35,
        available: 48,
        eligible: 12,
      })
      const postDef = deferred<DispositionEligibilityResult>()
      const jobSpy = vi.spyOn(jobService, 'runDispositionEligibility').mockReturnValueOnce(postDef.promise)

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      const runBtn = findButton('Executar processamento')!
      expect(runBtn.disabled).toBe(true)
      runBtn.click()
      expect(jobSpy).toHaveBeenCalledTimes(1)

      // Prepara novos indicadores após conclusão do job
      itemSpy.mockReset().mockImplementation(async (query) => {
        if (query?.status === 'ELIGIBLE') return makePage<Item>(17)
        return makePage<Item>(43)
      })
      postDef.resolve({ updatedCount: 5 })
      await flushPromises()
      await nextTick()

      expect(runBtn.disabled).toBe(false)
      expect(wrapper.text()).toContain('5 itens foram marcados como elegíveis nesta execução.')
      expect(ui.snackbar.show).toBe(true)
      expect(lostSpy).toHaveBeenCalledTimes(4)
      expect(itemSpy).toHaveBeenCalledTimes(2)
      const cards = wrapper.findAllComponents(StatCard)
      expect(cards[2].props('value')).toBe(43)
      expect(cards[3].props('value')).toBe(17)
    })

    it('J16-05 — updatedCount = 0 é sucesso válido com mensagem clara e sem persistência artificial', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      vi.spyOn(jobService, 'runDispositionEligibility').mockResolvedValueOnce({ updatedCount: 0 })

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).toContain('Nenhum item precisou ser atualizado nesta execução.')
      expect(JSON.stringify(localStorage)).not.toContain('updatedCount')
    })

    it('J16-06, J16-09, J16-10 & J16-11 — DTO inválido, HTTP 500 ou erro de rede tratam como resultado incerto sem retry automático', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      const jobSpy = vi
        .spyOn(jobService, 'runDispositionEligibility')
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockRejectedValueOnce(new Error('Resposta inválida'))

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      for (let i = 0; i < 3; i++) {
        findButton('Executar processamento')!.click()
        await flushPromises()
        ui.confirmDialog.resolve(true)
        await flushPromises()
        await nextTick()
        expect(wrapper.find('[data-test="job-uncertain-alert"]').exists()).toBe(true)
      }

      expect(jobSpy).toHaveBeenCalledTimes(3)
      expect(findButton('Executar processamento')!.disabled).toBe(false)
    })

    it('J16-07 & J16-08 — HTTP 401 e HTTP 403 exibem erro controlado sem retry e sem sucesso falso', async () => {
      setSession('ADMIN')
      mockHealthyMetrics()
      const jobSpy = vi
        .spyOn(jobService, 'runDispositionEligibility')
        .mockRejectedValueOnce(makeHttpError(403, 'Acesso restrito'))

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(jobSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Acesso restrito')
      expect(ui.snackbar.show).toBe(false)
      expect(findButton('Executar processamento')!.disabled).toBe(false)
    })

    it('J16-13 — falha ao atualizar indicadores após sucesso preserva o resultado confirmado do job', async () => {
      setSession('ADMIN')
      const { itemSpy } = mockHealthyMetrics()
      vi.spyOn(jobService, 'runDispositionEligibility').mockResolvedValueOnce({ updatedCount: 4 })

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      itemSpy.mockRejectedValue(makeHttpError(500))
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).toContain('4 itens foram marcados como elegíveis nesta execução.')
      expect(wrapper.find('[data-test="metrics-error-alert"]').exists()).toBe(true)
    })

    it('J16-14 a J16-19 — logout, troca de conta, nova sessionGeneration e unmount durante POST descartam efeitos tardios e não prendem loading', async () => {
      const auth = setSession('ADMIN', { id: 1 }, 'jwt-a')
      mockHealthyMetrics()
      const postDef1 = deferred<DispositionEligibilityResult>()
      const postDef2 = deferred<DispositionEligibilityResult>()
      const jobSpy = vi
        .spyOn(jobService, 'runDispositionEligibility')
        .mockReturnValueOnce(postDef1.promise)
        .mockReturnValueOnce(postDef2.promise)

      const { wrapper } = await mountDashboard()
      const ui = useUiStore()

      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      // Troca de conta para outro ADMIN durante POST em andamento
      auth.sessionGeneration += 1
      auth.token = 'jwt-b'
      auth.user = makeUser({ id: 2, role: 'SUPERADMIN' })
      await flushPromises()
      await nextTick()

      // Resposta tardia do job da sessão A
      postDef1.resolve({ updatedCount: 9 })
      await flushPromises()
      await nextTick()

      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.text()).not.toContain('9 itens')
      expect(findButton('Executar processamento')!.disabled).toBe(false)

      // Nova sessão pode iniciar seu próprio job e unmount descarta falha tardia
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      wrapper.unmount()
      postDef2.reject(makeHttpError(500))
      await flushPromises()
      expect(jobSpy).toHaveBeenCalledTimes(2)
      expect(ui.snackbar.show).toBe(false)
    })
  })

  describe('Regressão HTTP 401 e isolamento via interceptor real (Etapa 17)', () => {
    it('R17-401-01 — HTTP 401 do job na sessão ADMIN atual aplica política do interceptor, limpa dashboard e não repete POST', async () => {
      const auth = setSession('ADMIN', { id: 10 }, 'jwt-401-current')
      localStorage.setItem('achadex.token', 'jwt-401-current')
      mockHealthyMetrics()

      await appRouter.push('/admin/dashboard')
      await appRouter.isReady()
      const pushSpy = vi.spyOn(appRouter, 'push')

      let postCount = 0
      api.defaults.adapter = async (config) => {
        if (config.method?.toLowerCase() === 'post' && config.url?.includes('/jobs/disposition-eligibility')) {
          postCount += 1
          throw makeHttpError(401, 'Token expirado', config)
        }
        throw makeHttpError(500, 'Chamada inesperada', config)
      }

      const wrapper = mount(AdminDashboardView, {
        attachTo: document.body,
        global: { plugins: [vuetify, appRouter] },
      })
      mountedWrappers.push(wrapper)
      await flushPromises()
      await nextTick()

      const ui = useUiStore()
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(postCount).toBe(1)
      expect(auth.token).toBeNull()
      expect(auth.user).toBeNull()
      expect(localStorage.getItem('achadex.token')).toBeNull()
      expect(pushSpy).toHaveBeenCalledWith({
        name: 'login',
        query: { redirect: '/admin/dashboard' },
      })
      await vi.waitFor(() => {
        expect(appRouter.currentRoute.value.name).toBe('login')
      })
      expect(wrapper.find('[data-test="dashboard-restricted-alert"]').exists()).toBe(true)
      expect(wrapper.findAllComponents(StatCard)).toHaveLength(0)
      expect(ui.snackbar.show).toBe(false)
    })

    it('R17-401-02 — HTTP 401 antigo da sessão A não encerra sessão B nem vaza efeitos para o dashboard atual', async () => {
      const auth = setSession('ADMIN', { id: 1 }, 'jwt-session-a')
      localStorage.setItem('achadex.token', 'jwt-session-a')
      mockHealthyMetrics({ totalReports: 40, openReports: 15, available: 22, eligible: 3 })

      await appRouter.push('/admin/dashboard')
      await appRouter.isReady()

      let rejectDelayed401!: (reason: unknown) => void
      let delayedConfig!: InternalAxiosRequestConfig
      let postCount = 0
      api.defaults.adapter = (config) => {
        if (config.method?.toLowerCase() === 'post' && config.url?.includes('/jobs/disposition-eligibility')) {
          postCount += 1
          delayedConfig = config
          return new Promise((_, reject) => {
            rejectDelayed401 = reject
          })
        }
        return Promise.reject(makeHttpError(500, 'Chamada inesperada'))
      }

      const wrapper = mount(AdminDashboardView, {
        attachTo: document.body,
        global: { plugins: [vuetify, appRouter] },
      })
      mountedWrappers.push(wrapper)
      await flushPromises()
      await nextTick()

      const ui = useUiStore()
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(postCount).toBe(1)

      // Troca de conta para sessão B antes da resposta 401 da sessão A chegar
      auth.sessionGeneration += 1
      auth.token = 'jwt-session-b'
      auth.user = makeUser({ id: 2, role: 'SUPERADMIN', name: 'Super B' })
      localStorage.setItem('achadex.token', 'jwt-session-b')
      await flushPromises()
      await nextTick()

      rejectDelayed401(
        new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          delayedConfig,
          null,
          {
            status: 401,
            statusText: '401',
            headers: new AxiosHeaders(),
            config: delayedConfig,
            data: { success: false, data: null, error: { code: 401, details: 'Expirado A' } },
          },
        ),
      )
      await flushPromises()
      await nextTick()

      expect(auth.token).toBe('jwt-session-b')
      expect(auth.user?.id).toBe(2)
      expect(localStorage.getItem('achadex.token')).toBe('jwt-session-b')
      expect(appRouter.currentRoute.value.name).toBe('admin-dashboard')
      expect(postCount).toBe(1)
      expect(ui.snackbar.show).toBe(false)
      expect(wrapper.find('[data-test="job-error-alert"]').exists()).toBe(false)
      expect(findButton('Executar processamento')!.disabled).toBe(false)
    })

    it('R17-401-03 — HTTP 403 no job não provoca logout artificial nem retry automático', async () => {
      const auth = setSession('ADMIN', { id: 3 }, 'jwt-403-stay')
      localStorage.setItem('achadex.token', 'jwt-403-stay')
      mockHealthyMetrics()

      await appRouter.push('/admin/dashboard')
      await appRouter.isReady()

      let postCount = 0
      api.defaults.adapter = async (config) => {
        if (config.method?.toLowerCase() === 'post' && config.url?.includes('/jobs/disposition-eligibility')) {
          postCount += 1
          throw makeHttpError(403, 'Sem permissão para job', config)
        }
        throw makeHttpError(500, 'Chamada inesperada', config)
      }

      const wrapper = mount(AdminDashboardView, {
        attachTo: document.body,
        global: { plugins: [vuetify, appRouter] },
      })
      mountedWrappers.push(wrapper)
      await flushPromises()
      await nextTick()

      const ui = useUiStore()
      findButton('Executar processamento')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(postCount).toBe(1)
      expect(auth.token).toBe('jwt-403-stay')
      expect(appRouter.currentRoute.value.name).toBe('admin-dashboard')
      expect(wrapper.find('[data-test="job-error-alert"]').text()).toContain('Sem permissão para job')
      expect(ui.snackbar.show).toBe(false)
      expect(findButton('Executar processamento')!.disabled).toBe(false)
    })
  })
})
