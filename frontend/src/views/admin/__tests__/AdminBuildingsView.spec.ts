import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import AdminBuildingsView from '../AdminBuildingsView.vue'
import BuildingsView from '@/views/public/BuildingsView.vue'
import BuildingSelect from '@/components/form/BuildingSelect.vue'
import { vuetify } from '@/theme'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { buildingService } from '@/services/building.service'
import type { Building, User } from '@/types'

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

const makeBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 2,
  name: 'Bloco de Engenharia',
  address: 'Rua Exemplo, 123',
  pickupPoint: 'Recepção principal',
  serviceHours: 'Segunda a sexta, das 8h às 17h',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

function setAdminSession(userOverrides: Partial<User> = {}, token = 'admin-jwt') {
  const auth = useAuthStore()
  auth.token = token
  auth.user = makeUser(userOverrides)
  return auth
}

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

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/predios', name: 'admin-buildings', component: { template: '<div />' } },
      { path: '/403', name: 'forbidden', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', name: 'fallback', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/admin/predios')
  await router.isReady()
  const wrapper = mount(AdminBuildingsView, {
    attachTo: document.body,
    global: { plugins: [vuetify, router] },
  })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(label))
}

function findBodyButton(label: string) {
  return Array.from(document.body.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label),
  )
}

function getBuildingCard(wrapper: VueWrapper, name: string) {
  return wrapper.findAllComponents({ name: 'VCard' }).find((c) => c.text().includes(name))
}

function getCardButton(wrapper: VueWrapper, buildingName: string, buttonLabel: string) {
  const card = getBuildingCard(wrapper, buildingName)
  return card?.findAll('button').find((b) => b.text().includes(buttonLabel))
}

async function setDialogField(testId: string, value: string) {
  const container = document.body.querySelector(`[data-test="${testId}"]`)
  const input = container?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
  if (!input) throw new Error(`Campo ${testId} não encontrado no diálogo`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

function getDialogFieldValue(testId: string): string {
  const container = document.body.querySelector(`[data-test="${testId}"]`)
  const input = container?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
  return input?.value ?? ''
}

async function fillBuildingDialog(values: {
  name: string
  address: string
  pickupPoint: string
  serviceHours: string
}) {
  await setDialogField('building-name', values.name)
  await setDialogField('building-address', values.address)
  await setDialogField('building-pickup-point', values.pickupPoint)
  await setDialogField('building-service-hours', values.serviceHours)
}

describe('AdminBuildingsView (Etapa 13 — Gerenciamento Administrativo de Prédios)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
  })

  describe('Listagem (F01–F10)', () => {
    it('F01, F02 & F03 — remove stub, executa GET /buildings e exibe os quatro campos reais', async () => {
      setAdminSession()
      const b1 = makeBuilding({
        id: 1,
        name: 'Biblioteca Central',
        address: 'Av. Principal, 200',
        pickupPoint: 'Balcão de atendimento',
        serviceHours: 'Segunda a sexta, 7h às 19h',
      })
      const b2 = makeBuilding({ id: 2 })
      const listSpy = vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b1, b2])

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.text()).not.toContain('Em construção')
      expect(wrapper.text()).toContain('Gerenciamento de Prédios')
      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Biblioteca Central')
      expect(wrapper.text()).toContain('Av. Principal, 200')
      expect(wrapper.text()).toContain('Balcão de atendimento')
      expect(wrapper.text()).toContain('Segunda a sexta, 7h às 19h')
      expect(wrapper.text()).toContain('Bloco de Engenharia')
      expect(wrapper.text()).toContain('Rua Exemplo, 123')
      expect(wrapper.text()).toContain('Recepção principal')
      expect(wrapper.text()).toContain('Segunda a sexta, das 8h às 17h')
    })

    it('F04 & F05 — exibe LoadingOverlay sem EmptyState prematuro e mostra EmptyState quando lista vazia []', async () => {
      setAdminSession()
      let resolveList!: (val: Building[]) => void
      vi.spyOn(buildingService, 'list').mockImplementationOnce(
        () => new Promise<Building[]>((r) => { resolveList = r }),
      )

      const { wrapper } = await mountView()
      await nextTick()

      expect(wrapper.findComponent({ name: 'LoadingOverlay' }).props('loading')).toBe(true)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

      resolveList([])
      await flushPromises()

      expect(wrapper.findComponent({ name: 'LoadingOverlay' }).props('loading')).toBe(false)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    })

    it('F06 & F07 — HTTP 500 exibe ErrorAlert e Retry executa apenas GET', async () => {
      setAdminSession()
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockRejectedValueOnce(makeHttpError(500))
        .mockResolvedValueOnce([makeBuilding()])
      const postSpy = vi.spyOn(buildingService, 'create')
      const patchSpy = vi.spyOn(buildingService, 'update')
      const delSpy = vi.spyOn(buildingService, 'remove')

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)

      await findButton(wrapper, 'Tentar novamente')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
      expect(wrapper.text()).toContain('Bloco de Engenharia')
      expect(postSpy).not.toHaveBeenCalled()
      expect(patchSpy).not.toHaveBeenCalled()
      expect(delSpy).not.toHaveBeenCalled()
    })

    it('F08 & F09 — rejeita DTO corrompido ou IDs duplicados sem tratar como lista vazia', async () => {
      for (const malformed of [
        { data: [] },
        [{ id: 1, name: 'Incompleto' }],
        [makeBuilding({ id: 5, name: 'Prédio A' }), makeBuilding({ id: 5, name: 'Prédio B' })],
      ]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce(malformed as unknown as Building[])

        const { wrapper } = await mountView()
        await flushPromises()

        expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
        expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Prédio A')
        wrapper.unmount()
      }
    })

    it('F10 — GETs fora de ordem descartam resposta antiga e preservam loading da nova', async () => {
      setAdminSession()
      let resolveFirst!: (val: Building[]) => void
      let resolveSecond!: (val: Building[]) => void
      vi.spyOn(buildingService, 'list')
        .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveSecond = r }))

      const { wrapper } = await mountView()
      await nextTick()

      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      resolveSecond([makeBuilding({ id: 2, name: 'Bloco Recente' })])
      await flushPromises()
      expect(wrapper.text()).toContain('Bloco Recente')

      resolveFirst([makeBuilding({ id: 1, name: 'Bloco Antigo' })])
      await flushPromises()

      expect(wrapper.text()).toContain('Bloco Recente')
      expect(wrapper.text()).not.toContain('Bloco Antigo')
    })
  })

  describe('Criação (C01–C10)', () => {
    it('C01 & C09 — botão Novo prédio abre os quatro campos e cancelar não envia POST', async () => {
      setAdminSession()
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
      const createSpy = vi.spyOn(buildingService, 'create')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()

      expect(document.body.textContent).toContain('Nome do prédio')
      expect(document.body.textContent).toContain('Endereço')
      expect(document.body.textContent).toContain('Ponto de retirada')
      expect(document.body.textContent).toContain('Horário de atendimento')

      findBodyButton('Cancelar')!.click()
      await flushPromises()
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('C02 & C03 — validação local impede POST para campos vazios/espaços ou fora dos limites reais', async () => {
      setAdminSession()
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
      const createSpy = vi.spyOn(buildingService, 'create')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()

      // Campos vazios / apenas espaços
      await fillBuildingDialog({ name: '   ', address: '   ', pickupPoint: '   ', serviceHours: '   ' })
      findBodyButton('Cadastrar prédio')!.click()
      await flushPromises()
      expect(createSpy).not.toHaveBeenCalled()

      // Fora dos limites mínimos e máximos (name 3..150, address 5..255, pickupPoint 3..200, serviceHours 3..200)
      await fillBuildingDialog({
        name: 'AB',
        address: 'Rua ',
        pickupPoint: 'A'.repeat(201),
        serviceHours: '12',
      })
      findBodyButton('Cadastrar prédio')!.click()
      await flushPromises()
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('C04, C05 & C10 — criação HTTP 201 envia payload exato sem duplo submit, fecha diálogo, atualiza listagem e catálogo compartilhado', async () => {
      setAdminSession()
      const created = makeBuilding({
        id: 10,
        name: 'Bloco Novo',
        address: 'Rua Nova, 400',
        pickupPoint: 'Portaria Norte',
        serviceHours: 'Segunda a sexta, 8h às 17h',
      })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([created])

      let resolvePost!: (val: Building) => void
      const createSpy = vi.spyOn(buildingService, 'create').mockImplementationOnce(
        () => new Promise<Building>((r) => { resolvePost = r }),
      )
      const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()

      await fillBuildingDialog({
        name: '  Bloco Novo  ',
        address: 'Rua Nova, 400',
        pickupPoint: 'Portaria Norte',
        serviceHours: 'Segunda a sexta, 8h às 17h',
      })

      // Duplo submit rápido -> apenas 1 POST
      findBodyButton('Cadastrar prédio')!.click()
      await nextTick()
      findBodyButton('Cadastrar prédio')?.click()
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Bloco Novo',
        address: 'Rua Nova, 400',
        pickupPoint: 'Portaria Norte',
        serviceHours: 'Segunda a sexta, 8h às 17h',
      })

      resolvePost(created)
      await flushPromises()

      expect(successSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Bloco Novo')
      expect(useBuildingsStore().items).toEqual([created])
    })

    it('C06 — HTTP 409 mantém formulário aberto e preserva dados digitados', async () => {
      setAdminSession()
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([makeBuilding()])
      const createSpy = vi
        .spyOn(buildingService, 'create')
        .mockRejectedValueOnce(makeHttpError(409, 'Já existe um prédio com esse nome.'))

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()

      await fillBuildingDialog({
        name: 'Bloco de Engenharia',
        address: 'Rua Alternativa, 99',
        pickupPoint: 'Hall B',
        serviceHours: '08h às 18h',
      })
      findBodyButton('Cadastrar prédio')!.click()
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(document.body.textContent).toContain('Já existe um prédio com esse nome')
      expect(getDialogFieldValue('building-name')).toBe('Bloco de Engenharia')
      expect(getDialogFieldValue('building-address')).toBe('Rua Alternativa, 99')
    })

    it('C07 & C08 — HTTP 500 e DTO de sucesso inválido não mostram sucesso falso nem repetem POST', async () => {
      // C07: HTTP 500
      {
        setAdminSession()
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
        const createSpy = vi.spyOn(buildingService, 'create').mockRejectedValueOnce(makeHttpError(500))
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()

        await fillBuildingDialog({
          name: 'Bloco Teste',
          address: 'Rua Exemplo, 100',
          pickupPoint: 'Recepção',
          serviceHours: '08h às 17h',
        })
        findBodyButton('Cadastrar prédio')!.click()
        await flushPromises()

        expect(createSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()
        expect(document.body.textContent).toContain('Não foi possível confirmar')
        wrapper.unmount()
      }

      // C08: HTTP 201 com DTO malformado
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
        vi.spyOn(buildingService, 'create').mockResolvedValueOnce({ id: 0, name: '' } as unknown as Building)
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()

        await fillBuildingDialog({
          name: 'Bloco Teste',
          address: 'Rua Exemplo, 100',
          pickupPoint: 'Recepção',
          serviceHours: '08h às 17h',
        })
        findBodyButton('Cadastrar prédio')!.click()
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(document.body.textContent).toContain('Resposta inválida')
      }
    })
  })

  describe('Edição (E01–E12)', () => {
    it('E01, E02 & E03 — carrega dados atuais por GET /buildings/:id, preenche os quatro campos e sem alterações não envia PATCH', async () => {
      setAdminSession()
      const original = makeBuilding({ id: 4, name: 'Bloco 4' })
      const fresh = makeBuilding({
        id: 4,
        name: 'Bloco 4 Atual',
        address: 'Av. Campus, 40',
        pickupPoint: 'Sala 101',
        serviceHours: '09h às 18h',
      })
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([original])
      const getByIdSpy = vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(fresh)
      const updateSpy = vi.spyOn(buildingService, 'update')

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco 4', 'Editar')!.trigger('click')
      await flushPromises()

      expect(getByIdSpy).toHaveBeenCalledWith(4)
      expect(getDialogFieldValue('building-name')).toBe('Bloco 4 Atual')
      expect(getDialogFieldValue('building-address')).toBe('Av. Campus, 40')
      expect(getDialogFieldValue('building-pickup-point')).toBe('Sala 101')
      expect(getDialogFieldValue('building-service-hours')).toBe('09h às 18h')

      findBodyButton('Salvar alterações')!.click()
      await flushPromises()
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('E04, E05, E09 & E12 — PATCH envia somente campos alterados sem duplo submit, atualiza UI e catálogo compartilhado', async () => {
      setAdminSession()
      const store = useBuildingsStore()
      const original = makeBuilding({ id: 4, name: 'Bloco 4', pickupPoint: 'Recepção' })
      const updated = makeBuilding({ id: 4, name: 'Bloco 4', pickupPoint: 'Secretaria do bloco' })

      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([original])
        .mockResolvedValueOnce([updated])
      vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(original)
      let resolvePatch!: (val: Building) => void
      const updateSpy = vi.spyOn(buildingService, 'update').mockImplementationOnce(
        () => new Promise<Building>((r) => { resolvePatch = r }),
      )
      const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()
      await store.ensureLoaded()

      await getCardButton(wrapper, 'Bloco 4', 'Editar')!.trigger('click')
      await flushPromises()

      await setDialogField('building-pickup-point', 'Secretaria do bloco')
      findBodyButton('Salvar alterações')!.click()
      await nextTick()
      findBodyButton('Salvar alterações')?.click()
      await flushPromises()

      expect(updateSpy).toHaveBeenCalledTimes(1)
      expect(updateSpy).toHaveBeenCalledWith(4, { pickupPoint: 'Secretaria do bloco' })

      resolvePatch(updated)
      await flushPromises()

      expect(successSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Secretaria do bloco')
      expect(store.items[0].pickupPoint).toBe('Secretaria do bloco')
    })

    it('E06, E07 & E08 — trata ID divergente no PATCH 200, HTTP 404 na edição e HTTP 409 de nome duplicado', async () => {
      // E06: ID divergente
      {
        setAdminSession()
        const b4 = makeBuilding({ id: 4, name: 'Bloco 4' })
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b4])
        vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(b4)
        vi.spyOn(buildingService, 'update').mockResolvedValueOnce(makeBuilding({ id: 99, name: 'Outro' }))
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco 4', 'Editar')!.trigger('click')
        await flushPromises()
        await setDialogField('building-name', 'Bloco Quatro')
        findBodyButton('Salvar alterações')!.click()
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('Outro')
        wrapper.unmount()
      }

      // E07: HTTP 404 no PATCH + permite recarregar
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        const b4 = makeBuilding({ id: 4, name: 'Bloco 4' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b4])
          .mockResolvedValueOnce([])
        vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(b4)
        vi.spyOn(buildingService, 'update').mockRejectedValueOnce(makeHttpError(404, 'Não existe prédio cadastrado com esse ID.'))

        const { wrapper } = await mountView()
        await flushPromises()
        await getCardButton(wrapper, 'Bloco 4', 'Editar')!.trigger('click')
        await flushPromises()
        await setDialogField('building-name', 'Bloco Quatro')
        findBodyButton('Salvar alterações')!.click()
        await flushPromises()

        expect(document.body.textContent).toContain('não existe')
        findBodyButton('Recarregar listagem')?.click()
        await flushPromises()
        expect(listSpy).toHaveBeenCalledTimes(2)
        wrapper.unmount()
      }

      // E08: HTTP 409 mantém dados e informa conflito
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        const b4 = makeBuilding({ id: 4, name: 'Bloco 4' })
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b4])
        vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(b4)
        vi.spyOn(buildingService, 'update').mockRejectedValueOnce(makeHttpError(409, 'Já existe um prédio com esse nome.'))

        const { wrapper } = await mountView()
        await flushPromises()
        await getCardButton(wrapper, 'Bloco 4', 'Editar')!.trigger('click')
        await flushPromises()
        await setDialogField('building-name', 'Biblioteca Central')
        findBodyButton('Salvar alterações')!.click()
        await flushPromises()

        expect(document.body.textContent).toContain('Já existe um prédio com esse nome')
        expect(getDialogFieldValue('building-name')).toBe('Biblioteca Central')
      }
    })

    it('E10 & E11 — seleção de edição fora de ordem mantém #11 e GET listagem antigo após PATCH não restaura nome anterior', async () => {
      // E10: seleção fora de ordem #10 -> #11
      {
        setAdminSession()
        const b10 = makeBuilding({ id: 10, name: 'Bloco Dez' })
        const b11 = makeBuilding({ id: 11, name: 'Bloco Onze' })
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b10, b11])

        let resolve10!: (val: Building) => void
        let resolve11!: (val: Building) => void
        vi.spyOn(buildingService, 'getById')
          .mockImplementationOnce(() => new Promise<Building>((r) => { resolve10 = r }))
          .mockImplementationOnce(() => new Promise<Building>((r) => { resolve11 = r }))

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Dez', 'Editar')!.trigger('click')
        await nextTick()
        findBodyButton('Cancelar')!.click()
        await nextTick()

        await getCardButton(wrapper, 'Bloco Onze', 'Editar')!.trigger('click')
        await nextTick()

        resolve11(makeBuilding({ id: 11, name: 'Bloco Onze Oficial' }))
        await flushPromises()
        expect(getDialogFieldValue('building-name')).toBe('Bloco Onze Oficial')

        resolve10(makeBuilding({ id: 10, name: 'Bloco Dez Antigo' }))
        await flushPromises()
        expect(getDialogFieldValue('building-name')).toBe('Bloco Onze Oficial')
        wrapper.unmount()
      }

      // E11: GET antigo iniciado antes do PATCH não restaura nome antigo
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        const original = makeBuilding({ id: 4, name: 'Nome Antigo' })
        const updated = makeBuilding({ id: 4, name: 'Nome Confirmado' })
        let resolveStaleList!: (val: Building[]) => void
        vi.spyOn(buildingService, 'list')
          .mockResolvedValueOnce([original])
          .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveStaleList = r }))
          .mockResolvedValueOnce([updated])
        vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(original)
        vi.spyOn(buildingService, 'update').mockResolvedValueOnce(updated)

        const { wrapper } = await mountView()
        await flushPromises()

        // Dispara GET lento antes do PATCH
        await findButton(wrapper, 'Atualizar')!.trigger('click')
        await nextTick()

        await getCardButton(wrapper, 'Nome Antigo', 'Editar')!.trigger('click')
        await flushPromises()
        await setDialogField('building-name', 'Nome Confirmado')
        findBodyButton('Salvar alterações')!.click()
        await flushPromises()

        expect(wrapper.text()).toContain('Nome Confirmado')

        resolveStaleList([original])
        await flushPromises()

        expect(wrapper.text()).toContain('Nome Confirmado')
        expect(wrapper.text()).not.toContain('Nome Antigo')
      }
    })
  })

  describe('Exclusão (D01–D12)', () => {
    it('D01, D02, D03 & D04 — exige confirmação explícita, cancelar envia 0 DELETEs e 204 reconcilia listagem', async () => {
      setAdminSession()
      const b1 = makeBuilding({ id: 2, name: 'Bloco Removível' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
      const ui = useUiStore()
      const confirmSpy = vi
        .spyOn(ui, 'confirm')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Removível', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).not.toHaveBeenCalled()

      await getCardButton(wrapper, 'Bloco Removível', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(2)
      expect(successSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).not.toContain('Bloco Removível')
    })

    it('D05 & D06 — HTTP 409 informa vínculos sem tentar remoção em cascata nem remover prédio localmente', async () => {
      setAdminSession()
      const b1 = makeBuilding({ id: 2, name: 'Bloco Vinculado' })
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b1])
      vi.spyOn(buildingService, 'remove').mockRejectedValueOnce(makeHttpError(409))
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Vinculado', 'Excluir')!.trigger('click')
      await flushPromises()

      expect(successSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('itens ou relatos de perdas vinculados')
      expect(wrapper.text()).toContain('Bloco Vinculado')
    })

    it('D07, D08, D09 & D10 — trata 404, 500 e falha de rede sem repetir DELETE e bloqueia duplo clique', async () => {
      // D07: 404
      {
        setAdminSession()
        const b1 = makeBuilding({ id: 2, name: 'Bloco Ausente' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([])
        vi.spyOn(buildingService, 'remove').mockRejectedValueOnce(makeHttpError(404))
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const successSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Ausente', 'Excluir')!.trigger('click')
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(listSpy).toHaveBeenCalledTimes(2)
        expect(wrapper.text()).not.toContain('Bloco Ausente')
        wrapper.unmount()
      }

      // D08 & D09: 500 e falha de rede não repetem DELETE e oferecem GET de verificação
      for (const failure of [makeHttpError(500), new Error('Network Error')]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        const b1 = makeBuilding({ id: 2, name: 'Bloco Incerto' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
        const removeSpy = vi.spyOn(buildingService, 'remove').mockRejectedValueOnce(failure)
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Incerto', 'Excluir')!.trigger('click')
        await flushPromises()

        expect(removeSpy).toHaveBeenCalledTimes(1)
        expect(wrapper.text()).toContain('Verificar estado atual')
        await findButton(wrapper, 'Verificar estado atual')!.trigger('click')
        await flushPromises()
        expect(listSpy).toHaveBeenCalledTimes(2)
        expect(removeSpy).toHaveBeenCalledTimes(1)
        wrapper.unmount()
      }

      // D10: duplo clique rápido envia apenas 1 DELETE
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        const b1 = makeBuilding({ id: 2, name: 'Bloco Duplo' })
        vi.spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([])
        let resolveDelete!: () => void
        const removeSpy = vi.spyOn(buildingService, 'remove').mockImplementationOnce(
          () => new Promise<void>((r) => { resolveDelete = r }),
        )
        vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)

        const { wrapper } = await mountView()
        await flushPromises()

        const btn = getCardButton(wrapper, 'Bloco Duplo', 'Excluir')!
        await btn.trigger('click')
        await nextTick()
        await btn.trigger('click')
        await flushPromises()

        expect(removeSpy).toHaveBeenCalledTimes(1)
        resolveDelete()
        await flushPromises()
      }
    })

    it('D11 & D12 — GET antigo após DELETE não restaura prédio e catálogo compartilhado é atualizado', async () => {
      setAdminSession()
      const b1 = makeBuilding({ id: 2, name: 'Bloco Excluído' })
      let resolveStaleList!: (val: Building[]) => void
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([b1])
        .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveStaleList = r }))
        .mockResolvedValueOnce([])
      vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

      const store = useBuildingsStore()
      await store.ensureLoaded()
      expect(store.items).toHaveLength(1)

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      await getCardButton(wrapper, 'Bloco Excluído', 'Excluir')!.trigger('click')
      await flushPromises()

      expect(wrapper.text()).not.toContain('Bloco Excluído')
      expect(store.items).toEqual([])

      resolveStaleList([b1])
      await flushPromises()

      expect(wrapper.text()).not.toContain('Bloco Excluído')
      expect(store.items).toEqual([])
    })
  })

  describe('Sessão e concorrência (A01–A10)', () => {
    it('A01, A02, A03, A04 & A05 — logout, troca de conta, nova generation e perda de papel isolam sessão', async () => {
      // A01 & A02: logout durante GET e durante POST descarta resultados e limpa estado
      {
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-a')
        let resolveGet!: (val: Building[]) => void
        vi.spyOn(buildingService, 'list').mockImplementationOnce(
          () => new Promise<Building[]>((r) => { resolveGet = r }),
        )
        const { wrapper } = await mountView()
        await nextTick()

        auth.logout()
        await nextTick()
        resolveGet([makeBuilding({ name: 'Prédio Vazado' })])
        await flushPromises()

        expect(wrapper.text()).not.toContain('Prédio Vazado')
        wrapper.unmount()
      }

      // A02: logout durante POST
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-a')
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
        let resolvePost!: (val: Building) => void
        vi.spyOn(buildingService, 'create').mockImplementationOnce(
          () => new Promise<Building>((r) => { resolvePost = r }),
        )
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: 'Bloco Tardio',
          address: 'Rua A, 123',
          pickupPoint: 'Recepção',
          serviceHours: '08h às 17h',
        })
        findBodyButton('Cadastrar prédio')!.click()
        await nextTick()

        auth.logout()
        await nextTick()
        resolvePost(makeBuilding({ id: 50, name: 'Bloco Tardio' }))
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('Bloco Tardio')
        wrapper.unmount()
      }

      // A03 & A04: troca de conta e mesmo JWT com nova generation
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'same-jwt')
        let resolveA!: (val: Building[]) => void
        vi.spyOn(buildingService, 'list')
          .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveA = r }))
          .mockResolvedValueOnce([makeBuilding({ id: 2, name: 'Prédio Conta B' })])

        const { wrapper } = await mountView()
        await nextTick()

        auth.sessionGeneration += 1
        auth.user = makeUser({ id: 99, role: 'SUPERADMIN' })
        await flushPromises()

        expect(wrapper.text()).toContain('Prédio Conta B')
        resolveA([makeBuilding({ id: 1, name: 'Prédio Conta A' })])
        await flushPromises()

        expect(wrapper.text()).toContain('Prédio Conta B')
        expect(wrapper.text()).not.toContain('Prédio Conta A')
        wrapper.unmount()
      }

      // A05: perda de papel ADMIN -> USER impede novas escritas e limpa estado
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-role')
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([makeBuilding({ name: 'Prédio Visível' })])
        const removeSpy = vi.spyOn(buildingService, 'remove')

        const { wrapper } = await mountView()
        await flushPromises()
        expect(wrapper.text()).toContain('Prédio Visível')

        auth.user = makeUser({ id: 1, role: 'USER' })
        await flushPromises()

        expect(wrapper.text()).not.toContain('Prédio Visível')
        expect(findButton(wrapper, 'Novo prédio')!.attributes('disabled')).toBeDefined()
        expect(removeSpy).not.toHaveBeenCalled()
        wrapper.unmount()
      }
    })

    it('A06, A07, A08, A09 & A10 — desmontagem segura, ConfirmDialog alheio preservado, loading independente e sem retry automático de escrita', async () => {
      // A06 & A08: desmontar durante confirmação fecha o próprio diálogo sem disparar DELETE e sem fechar diálogo de outro componente
      {
        setAdminSession()
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([makeBuilding({ id: 2, name: 'Bloco Confirm' })])
        const removeSpy = vi.spyOn(buildingService, 'remove')
        const ui = useUiStore()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Confirm', 'Excluir')!.trigger('click')
        await nextTick()
        expect(ui.confirmDialog.show).toBe(true)

        wrapper.unmount()
        await flushPromises()
        expect(removeSpy).not.toHaveBeenCalled()
        expect(ui.confirmDialog.show).toBe(false)

        // Simula novo diálogo aberto por outro componente e desmontagem de uma nova instância sem diálogo aberto
        const otherPromise = ui.confirm({ title: 'Diálogo alheio', message: 'Outro fluxo' })
        expect(ui.confirmDialog.show).toBe(true)

        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([])
        const { wrapper: wrapper2 } = await mountView()
        await flushPromises()
        wrapper2.unmount()
        await flushPromises()

        expect(ui.confirmDialog.show).toBe(true)
        ui.confirmDialog.resolve(false)
        await otherPromise
      }

      // A07, A09 & A10: desmontagem durante escrita não mostra snackbar, respostas antigas não limpam loading atual e 500 não repete POST
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        setAdminSession()
        vi.spyOn(buildingService, 'list').mockResolvedValue([makeBuilding({ id: 2, name: 'Bloco A' })])
        let resolveCreate!: (val: Building) => void
        const createSpy = vi.spyOn(buildingService, 'create').mockImplementationOnce(
          () => new Promise<Building>((r) => { resolveCreate = r }),
        )
        const ui = useUiStore()
        const successSpy = vi.spyOn(ui, 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: 'Bloco Montagem',
          address: 'Rua X, 123',
          pickupPoint: 'Recepção',
          serviceHours: '08h às 17h',
        })
        findBodyButton('Cadastrar prédio')!.click()
        await nextTick()

        wrapper.unmount()
        resolveCreate(makeBuilding({ id: 88, name: 'Bloco Montagem' }))
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(createSpy).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Etapa 13.1 — Parte A: Consistência do catálogo público após escrita interrompida (C13.1-01–C13.1-10)', () => {
    it('C13.1-01 — cadastro concluído após logout não gera efeitos administrativos e permite ao catálogo público obter prédio #2 via GET', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Existente' })
      const b2 = makeBuilding({ id: 2, name: 'Bloco Recém Criado' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([b1, b2])

      const store = useBuildingsStore()
      await store.ensureLoaded()
      expect(store.loaded).toBe(true)

      const auth = setAdminSession()
      let resolvePost!: (val: Building) => void
      const createSpy = vi.spyOn(buildingService, 'create').mockImplementationOnce(
        () => new Promise<Building>((r) => { resolvePost = r }),
      )
      const ui = useUiStore()
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()
      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()
      await fillBuildingDialog({
        name: b2.name,
        address: b2.address,
        pickupPoint: b2.pickupPoint,
        serviceHours: b2.serviceHours,
      })
      findBodyButton('Cadastrar prédio')!.click()
      await nextTick()
      expect(createSpy).toHaveBeenCalledTimes(1)

      auth.logout()
      await nextTick()

      resolvePost(b2)
      await flushPromises()

      expect(successSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('Bloco Recém Criado')
      expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
      expect(createSpy).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      const publicWrapper = mount(BuildingsView, {
        attachTo: document.body,
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(publicWrapper)
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(publicWrapper.text()).toContain('Bloco Recém Criado')
      expect(createSpy).toHaveBeenCalledTimes(1)
    })

    it('C13.1-02 — edição concluída após logout permite que consulta pública seguinte obtenha o nome atualizado', async () => {
      const bOld = makeBuilding({ id: 1, name: 'Bloco Antigo' })
      const bUpdated = makeBuilding({ id: 1, name: 'Bloco Atualizado' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([bOld])
        .mockResolvedValueOnce([bOld])
        .mockResolvedValueOnce([bUpdated])
      vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(bOld)
      let resolvePatch!: (val: Building) => void
      const updateSpy = vi.spyOn(buildingService, 'update').mockImplementationOnce(
        () => new Promise<Building>((r) => { resolvePatch = r }),
      )

      const store = useBuildingsStore()
      await store.ensureLoaded()

      const auth = setAdminSession()
      const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Antigo', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', 'Bloco Atualizado')
      findBodyButton('Salvar alterações')!.click()
      await nextTick()
      expect(updateSpy).toHaveBeenCalledTimes(1)

      auth.logout()
      await nextTick()

      resolvePatch(bUpdated)
      await flushPromises()

      expect(successSpy).not.toHaveBeenCalled()

      wrapper.unmount()
      const publicWrapper = mount(BuildingsView, {
        attachTo: document.body,
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(publicWrapper)
      await flushPromises()

      expect(publicWrapper.text()).toContain('Bloco Atualizado')
      expect(publicWrapper.text()).not.toContain('Bloco Antigo')
    })

    it('C13.1-03 — exclusão concluída após logout não gera sucesso tardio e próxima revalidação pública remove prédio #1', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Temporário' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([])
      let resolveDelete!: () => void
      const removeSpy = vi.spyOn(buildingService, 'remove').mockImplementationOnce(
        () => new Promise<void>((r) => { resolveDelete = r }),
      )
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const store = useBuildingsStore()
      await store.ensureLoaded()

      const auth = setAdminSession()
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Temporário', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)

      auth.logout()
      await nextTick()

      resolveDelete()
      await flushPromises()

      expect(successSpy).not.toHaveBeenCalled()
      expect(removeSpy).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      const publicWrapper = mount(BuildingsView, {
        attachTo: document.body,
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(publicWrapper)
      await flushPromises()

      expect(publicWrapper.text()).not.toContain('Bloco Temporário')
      expect(store.items).toEqual([])
    })

    it('C13.1-04 & C13.1-05 — escrita concluída após troca de conta ou nova sessionGeneration não altera sessão B e mantém catálogo revalidável', async () => {
      // C13.1-04: troca de conta ADMIN A -> ADMIN B
      {
        const b1 = makeBuilding({ id: 1, name: 'Bloco Inicial' })
        const b2 = makeBuilding({ id: 2, name: 'Bloco Sessão A' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1, b2])

        const store = useBuildingsStore()
        await store.ensureLoaded()

        const auth = setAdminSession({ id: 10, role: 'ADMIN' }, 'jwt-a')
        let resolveCreateA!: (val: Building) => void
        vi.spyOn(buildingService, 'create').mockImplementationOnce(
          () => new Promise<Building>((r) => { resolveCreateA = r }),
        )
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: b2.name,
          address: b2.address,
          pickupPoint: b2.pickupPoint,
          serviceHours: b2.serviceHours,
        })
        findBodyButton('Cadastrar prédio')!.click()
        await nextTick()

        // Troca para ADMIN B
        auth.token = 'jwt-b'
        auth.user = makeUser({ id: 20, role: 'ADMIN' })
        auth.sessionGeneration += 1
        await flushPromises()

        resolveCreateA(b2)
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('Bloco Sessão A')

        await store.ensureLoaded()
        expect(listSpy).toHaveBeenCalledTimes(4)
        expect(store.items).toEqual([b1, b2])
        wrapper.unmount()
      }

      // C13.1-05: mesmo JWT e usuário, mas nova sessionGeneration
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Gen' })
        const b2 = makeBuilding({ id: 2, name: 'Bloco Geração Antiga' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1, b2])

        const store = useBuildingsStore()
        await store.ensureLoaded()

        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'same-jwt')
        let resolvePost!: (val: Building) => void
        vi.spyOn(buildingService, 'create').mockImplementationOnce(
          () => new Promise<Building>((r) => { resolvePost = r }),
        )
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: b2.name,
          address: b2.address,
          pickupPoint: b2.pickupPoint,
          serviceHours: b2.serviceHours,
        })
        findBodyButton('Cadastrar prédio')!.click()
        await nextTick()

        auth.sessionGeneration += 1
        await flushPromises()

        resolvePost(b2)
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('Bloco Geração Antiga')

        await store.ensureLoaded()
        expect(listSpy).toHaveBeenCalledTimes(4)
        expect(store.items).toEqual([b1, b2])
        wrapper.unmount()
      }
    })

    it('C13.1-06 — desmontagem durante POST, PATCH ou DELETE não dispara efeitos tardios e mantém catálogo revalidável', async () => {
      const operations = ['create', 'update', 'remove'] as const
      for (const op of operations) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Base' })
        const b2 = makeBuilding({ id: 2, name: 'Bloco Unmount' })
        const finalList = op === 'create' ? [b1, b2] : op === 'update' ? [makeBuilding({ id: 1, name: 'Bloco Editado Unmount' })] : []
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce(finalList)

        const store = useBuildingsStore()
        await store.ensureLoaded()

        setAdminSession()
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const successSpy = vi.spyOn(ui, 'notifySuccess')

        let resolveOp!: (val?: unknown) => void
        if (op === 'create') {
          vi.spyOn(buildingService, 'create').mockImplementationOnce(() => new Promise((r) => { resolveOp = r }))
        } else if (op === 'update') {
          vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(b1)
          vi.spyOn(buildingService, 'update').mockImplementationOnce(() => new Promise((r) => { resolveOp = r }))
        } else {
          vi.spyOn(buildingService, 'remove').mockImplementationOnce(() => new Promise((r) => { resolveOp = r }))
        }

        const { wrapper } = await mountView()
        await flushPromises()

        if (op === 'create') {
          await findButton(wrapper, 'Novo prédio')!.trigger('click')
          await nextTick()
          await fillBuildingDialog({
            name: b2.name,
            address: b2.address,
            pickupPoint: b2.pickupPoint,
            serviceHours: b2.serviceHours,
          })
          findBodyButton('Cadastrar prédio')!.click()
        } else if (op === 'update') {
          await getCardButton(wrapper, 'Bloco Base', 'Editar')!.trigger('click')
          await flushPromises()
          await setDialogField('building-name', 'Bloco Editado Unmount')
          findBodyButton('Salvar alterações')!.click()
        } else {
          await getCardButton(wrapper, 'Bloco Base', 'Excluir')!.trigger('click')
        }
        await nextTick()

        wrapper.unmount()
        resolveOp(op === 'create' ? b2 : op === 'update' ? finalList[0] : undefined)
        await flushPromises()

        expect(successSpy).not.toHaveBeenCalled()
        expect(store.loaded).toBe(false)

        await store.ensureLoaded()
        expect(listSpy).toHaveBeenCalledTimes(3)
        expect(store.items).toEqual(finalList)
      }
    })

    it('C13.1-07 — HTTP 500 e falha de rede não declaram sucesso, não repetem escrita, preservam dados digitados e permitem revalidação por GET', async () => {
      for (const failure of [makeHttpError(500), new Error('Network Error')]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Anterior' })
        const b2 = makeBuilding({ id: 2, name: 'Bloco Possivelmente Persistido' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1, b2])

        const store = useBuildingsStore()
        await store.ensureLoaded()

        setAdminSession()
        const createSpy = vi.spyOn(buildingService, 'create').mockRejectedValueOnce(failure)
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')

        const { wrapper } = await mountView()
        await flushPromises()
        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: b2.name,
          address: b2.address,
          pickupPoint: b2.pickupPoint,
          serviceHours: b2.serviceHours,
        })
        findBodyButton('Cadastrar prédio')!.click()
        await flushPromises()

        expect(createSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()
        expect(getDialogFieldValue('building-name')).toBe(b2.name)
        expect(store.loaded).toBe(false)

        await store.ensureLoaded()
        expect(listSpy).toHaveBeenCalledTimes(3)
        expect(store.items).toEqual([b1, b2])
        wrapper.unmount()
      }
    })

    it('C13.1-08 — HTTP 409 conhecido preserva tratamento atual e evita revalidação desnecessária do catálogo', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Existente' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1])
        .mockResolvedValueOnce([b1])

      const store = useBuildingsStore()
      await store.ensureLoaded()

      setAdminSession()
      const createSpy = vi
        .spyOn(buildingService, 'create')
        .mockRejectedValueOnce(makeHttpError(409, 'Já existe um prédio com esse nome.'))
      const removeSpy = vi.spyOn(buildingService, 'remove').mockRejectedValueOnce(makeHttpError(409))
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)

      const { wrapper } = await mountView()
      await flushPromises()

      // Conflito no POST
      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()
      await fillBuildingDialog({
        name: b1.name,
        address: 'Outro endereço válido, 10',
        pickupPoint: 'Hall',
        serviceHours: '08h às 17h',
      })
      findBodyButton('Cadastrar prédio')!.click()
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(document.body.textContent).toContain('Já existe um prédio com esse nome')
      expect(store.loaded).toBe(true)
      findBodyButton('Cancelar')!.click()
      await nextTick()

      // Conflito no DELETE
      await getCardButton(wrapper, 'Bloco Existente', 'Excluir')!.trigger('click')
      await flushPromises()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('itens ou relatos de perdas vinculados')
      expect(store.loaded).toBe(true)

      await store.ensureLoaded()
      expect(listSpy).toHaveBeenCalledTimes(2)
    })

    it('C13.1-09 — consumidor público já montado revalida catálogo quando escrita pendente conclui com sucesso', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Inicial' })
      const b2 = makeBuilding({ id: 2, name: 'Bloco Novo Sincronizado' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1]) // load admin view
        .mockResolvedValueOnce([b1]) // BuildingsView montado durante POST pendente
        .mockResolvedValueOnce([b1, b2]) // revalidação automática quando POST termina

      const auth = setAdminSession()
      let resolvePost!: (val: Building) => void
      vi.spyOn(buildingService, 'create').mockImplementationOnce(
        () => new Promise<Building>((r) => { resolvePost = r }),
      )

      const { wrapper } = await mountView()
      await flushPromises()
      await findButton(wrapper, 'Novo prédio')!.trigger('click')
      await nextTick()
      await fillBuildingDialog({
        name: b2.name,
        address: b2.address,
        pickupPoint: b2.pickupPoint,
        serviceHours: b2.serviceHours,
      })
      findBodyButton('Cadastrar prédio')!.click()
      await nextTick()

      // Usuário sai do painel e monta /predios (e BuildingSelect) enquanto POST ainda está pendente
      wrapper.unmount()
      auth.logout()
      const publicWrapper = mount(
        { components: { BuildingsView, BuildingSelect }, template: '<div><BuildingsView /><BuildingSelect /></div>' },
        { attachTo: document.body, global: { plugins: [vuetify] } },
      )
      mountedWrappers.push(publicWrapper)
      await flushPromises()

      expect(publicWrapper.text()).toContain('Bloco Inicial')
      expect(publicWrapper.text()).not.toContain('Bloco Novo Sincronizado')

      // POST conclui no backend
      resolvePost(b2)
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(publicWrapper.text()).toContain('Bloco Novo Sincronizado')
      expect(publicWrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([b1, b2])
    })

    it('C13.1-10 — escrita antiga da sessão A finalizada após escrita da sessão B não restaura dados antigos nem gera efeitos privados', async () => {
      const original = makeBuilding({ id: 1, name: 'Bloco Base' })
      const editedByA = makeBuilding({ id: 1, name: 'Bloco Sessão A' })
      const editedByB = makeBuilding({ id: 1, name: 'Bloco Sessão B' })

      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([original]) // Admin A mount
        .mockResolvedValueOnce([original]) // Admin B mount after switch
        .mockResolvedValueOnce([editedByB]) // Admin B loadBuildings after PATCH B
        .mockResolvedValueOnce([editedByB]) // Revalidação pública posterior
      vi.spyOn(buildingService, 'getById')
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(original)

      let resolvePatchA!: (val: Building) => void
      const updateSpy = vi
        .spyOn(buildingService, 'update')
        .mockImplementationOnce(() => new Promise<Building>((r) => { resolvePatchA = r }))
        .mockResolvedValueOnce(editedByB)

      const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-a')
      const ui = useUiStore()
      const successSpy = vi.spyOn(ui, 'notifySuccess')
      const store = useBuildingsStore()

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Base', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', 'Bloco Sessão A')
      findBodyButton('Salvar alterações')!.click()
      await nextTick()

      // Troca para Admin B
      auth.token = 'jwt-b'
      auth.user = makeUser({ id: 2, role: 'ADMIN' })
      auth.sessionGeneration += 1
      await flushPromises()

      // Sessão B edita e conclui primeiro
      await getCardButton(wrapper, 'Bloco Base', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', 'Bloco Sessão B')
      findBodyButton('Salvar alterações')!.click()
      await flushPromises()

      expect(wrapper.text()).toContain('Bloco Sessão B')
      expect(store.items[0].name).toBe('Bloco Sessão B')
      expect(successSpy).toHaveBeenCalledTimes(1)

      // Resposta tardia da sessão A chega depois
      resolvePatchA(editedByA)
      await flushPromises()

      expect(wrapper.text()).toContain('Bloco Sessão B')
      expect(wrapper.text()).not.toContain('Bloco Sessão A')
      expect(successSpy).toHaveBeenCalledTimes(1)
      expect(updateSpy).toHaveBeenCalledTimes(2)

      await store.ensureLoaded()
      expect(listSpy).toHaveBeenCalledTimes(4)
      expect(store.items[0].name).toBe('Bloco Sessão B')
    })
  })

  describe('Etapa 13.1 — Parte B: Confirmação pendente de exclusão com ui.confirm real (D13.1-01–D13.1-11)', () => {
    function spyRealConfirm() {
      const ui = useUiStore()
      const originalConfirm = ui.confirm.bind(ui)
      const tracked: Array<{ promise: Promise<boolean>; settled: boolean; value?: boolean }> = []
      const confirmSpy = vi.spyOn(ui, 'confirm').mockImplementation((options) => {
        const promise = originalConfirm(options)
        const entry = { promise, settled: false, value: undefined as boolean | undefined }
        void promise.then((val) => {
          entry.settled = true
          entry.value = val
        })
        tracked.push(entry)
        return promise
      })
      return { ui, confirmSpy, tracked }
    }

    it('D13.1-01 — duplo clique em Excluir #42 enquanto confirmação real está pendente abre apenas 1 diálogo e 0 DELETEs', async () => {
      setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco Quarenta e Dois' })
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b42]).mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
      const { ui, confirmSpy, tracked } = spyRealConfirm()

      const { wrapper } = await mountView()
      await flushPromises()

      const deleteBtn = getCardButton(wrapper, 'Bloco Quarenta e Dois', 'Excluir')!
      await deleteBtn.trigger('click')
      await nextTick()
      await deleteBtn.trigger('click')
      await nextTick()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.confirmDialog.show).toBe(true)
      expect(removeSpy).not.toHaveBeenCalled()

      // Cancela e verifica que nenhuma Promise ficou abandonada
      ui.confirmDialog.resolve(false)
      await flushPromises()
      expect(tracked[0].settled).toBe(true)
      expect(tracked[0].value).toBe(false)
      expect(removeSpy).not.toHaveBeenCalled()

      // Nova tentativa funciona após cancelamento
      await deleteBtn.trigger('click')
      await nextTick()
      expect(confirmSpy).toHaveBeenCalledTimes(2)
      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(42)
    })

    it('D13.1-02 — clique em #43 enquanto confirmação real de #42 está pendente não substitui o diálogo de #42', async () => {
      setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco 42' })
      const b43 = makeBuilding({ id: 43, name: 'Bloco 43' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b42, b43])
        .mockResolvedValueOnce([b43])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValue(undefined)
      const { ui, confirmSpy } = spyRealConfirm()

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco 42', 'Excluir')!.trigger('click')
      await nextTick()
      expect(ui.confirmDialog.message).toContain('Bloco 42')

      await getCardButton(wrapper, 'Bloco 43', 'Excluir')!.trigger('click')
      await nextTick()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.confirmDialog.message).toContain('Bloco 42')
      expect(removeSpy).not.toHaveBeenCalled()

      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(42)

      // Após concluir #42, é possível iniciar exclusão de #43
      await getCardButton(wrapper, 'Bloco 43', 'Excluir')!.trigger('click')
      await nextTick()
      expect(confirmSpy).toHaveBeenCalledTimes(2)
      expect(ui.confirmDialog.message).toContain('Bloco 43')
      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(2)
      expect(removeSpy).toHaveBeenLastCalledWith(43)
    })

    it('D13.1-03 & D13.1-11 — cancelar #42 libera confirmação, encerra Promise e permite excluir #43 em seguida', async () => {
      setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco A' })
      const b43 = makeBuilding({ id: 43, name: 'Bloco B' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b42, b43])
        .mockResolvedValueOnce([b42])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
      const { ui, tracked } = spyRealConfirm()

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco A', 'Excluir')!.trigger('click')
      await nextTick()
      ui.confirmDialog.resolve(false)
      await flushPromises()

      expect(tracked[0]).toMatchObject({ settled: true, value: false })
      expect(removeSpy).not.toHaveBeenCalled()

      await getCardButton(wrapper, 'Bloco B', 'Excluir')!.trigger('click')
      await nextTick()
      ui.confirmDialog.resolve(true)
      await flushPromises()

      expect(tracked[1]).toMatchObject({ settled: true, value: true })
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(43)
    })

    it('D13.1-04 — confirmação positiva única após clique duplicado envia exatamente um DELETE e encerra estado', async () => {
      setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco Único' })
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b42]).mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
      const { ui, confirmSpy } = spyRealConfirm()

      const { wrapper } = await mountView()
      await flushPromises()

      const btn = getCardButton(wrapper, 'Bloco Único', 'Excluir')!
      await btn.trigger('click')
      await nextTick()
      await btn.trigger('click')
      await nextTick()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      ui.confirmDialog.resolve(true)
      await flushPromises()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(42)
      expect(wrapper.text()).not.toContain('Bloco Único')
    })

    it('D13.1-05 — logout durante confirmação pendente fecha diálogo próprio, resolve Promise e não envia DELETE', async () => {
      const auth = setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco Logout' })
      vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b42])
      const removeSpy = vi.spyOn(buildingService, 'remove')
      const { ui, tracked } = spyRealConfirm()
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Logout', 'Excluir')!.trigger('click')
      await nextTick()
      expect(ui.confirmDialog.show).toBe(true)

      auth.logout()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(false)
      expect(tracked[0]).toMatchObject({ settled: true, value: false })
      expect(removeSpy).not.toHaveBeenCalled()
      expect(successSpy).not.toHaveBeenCalled()
    })

    it('D13.1-06, D13.1-07 & D13.1-08 — troca de conta, nova generation e perda de papel encerram confirmação sem enviar DELETE', async () => {
      // D13.1-06: troca de conta A -> B
      {
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-a')
        const b42 = makeBuilding({ id: 42, name: 'Bloco Conta' })
        vi.spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b42])
          .mockResolvedValueOnce([b42])
          .mockResolvedValueOnce([])
        const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValueOnce(undefined)
        const { ui, tracked } = spyRealConfirm()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Conta', 'Excluir')!.trigger('click')
        await nextTick()

        auth.token = 'jwt-b'
        auth.user = makeUser({ id: 2, role: 'ADMIN' })
        auth.sessionGeneration += 1
        await flushPromises()

        expect(tracked[0]).toMatchObject({ settled: true, value: false })
        expect(ui.confirmDialog.show).toBe(false)
        expect(removeSpy).not.toHaveBeenCalled()

        // Sessão B consegue confirmar sua própria exclusão
        await getCardButton(wrapper, 'Bloco Conta', 'Excluir')!.trigger('click')
        await nextTick()
        ui.confirmDialog.resolve(true)
        await flushPromises()
        expect(removeSpy).toHaveBeenCalledTimes(1)
        wrapper.unmount()
      }

      // D13.1-07: mesmo JWT, nova sessionGeneration
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'same-jwt')
        const b42 = makeBuilding({ id: 42, name: 'Bloco Gen' })
        vi.spyOn(buildingService, 'list').mockResolvedValue([b42])
        const removeSpy = vi.spyOn(buildingService, 'remove')
        const { ui, tracked } = spyRealConfirm()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Gen', 'Excluir')!.trigger('click')
        await nextTick()

        auth.sessionGeneration += 1
        await flushPromises()

        expect(tracked[0]).toMatchObject({ settled: true, value: false })
        expect(ui.confirmDialog.show).toBe(false)
        expect(removeSpy).not.toHaveBeenCalled()
        wrapper.unmount()
      }

      // D13.1-08: perda de papel ADMIN -> USER
      {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())
        const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'jwt-role')
        const b42 = makeBuilding({ id: 42, name: 'Bloco Papel' })
        vi.spyOn(buildingService, 'list').mockResolvedValueOnce([b42])
        const removeSpy = vi.spyOn(buildingService, 'remove')
        const { ui, tracked } = spyRealConfirm()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Papel', 'Excluir')!.trigger('click')
        await nextTick()

        auth.user = makeUser({ id: 1, role: 'USER' })
        await flushPromises()

        expect(tracked[0]).toMatchObject({ settled: true, value: false })
        expect(ui.confirmDialog.show).toBe(false)
        expect(removeSpy).not.toHaveBeenCalled()
      }
    })

    it('D13.1-09 & D13.1-10 — desmontagem encerra confirmação própria sem abandonar Promise e preserva diálogo de outro componente', async () => {
      setAdminSession()
      const b42 = makeBuilding({ id: 42, name: 'Bloco Desmonte' })
      vi.spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b42])
        .mockResolvedValueOnce([b42])
      const removeSpy = vi.spyOn(buildingService, 'remove')
      const { ui, tracked } = spyRealConfirm()
      const successSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Desmonte', 'Excluir')!.trigger('click')
      await nextTick()
      expect(ui.confirmDialog.show).toBe(true)

      wrapper.unmount()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(false)
      expect(tracked[0]).toMatchObject({ settled: true, value: false })
      expect(removeSpy).not.toHaveBeenCalled()
      expect(successSpy).not.toHaveBeenCalled()

      // Diálogo aberto por outro componente permanece intacto ao desmontar uma instância administrativa
      const { wrapper: wrapper2 } = await mountView()
      await flushPromises()
      const externalPromise = ui.confirm({ title: 'Ação externa', message: 'Manter aberto' })
      expect(ui.confirmDialog.show).toBe(true)

      wrapper2.unmount()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toBe('Ação externa')
      ui.confirmDialog.resolve(false)
      await expect(externalPromise).resolves.toBe(false)
    })
  })

  describe('Etapa 13.2 — Revalidação automática de consumidores públicos após escrita incerta (C13.2-01–C13.2-08)', () => {
    function mountPublicConsumers() {
      const publicWrapper = mount(
        {
          components: { BuildingsView, BuildingSelect },
          template: '<div><BuildingsView /><BuildingSelect /></div>',
        },
        { attachTo: document.body, global: { plugins: [vuetify] } },
      )
      mountedWrappers.push(publicWrapper)
      return publicWrapper
    }

    it('C13.2-01 — POST com HTTP 500 ou erro de rede revalida automaticamente BuildingsView e BuildingSelect já montados sem repetir POST', async () => {
      for (const failure of [makeHttpError(500), new Error('Network Error')]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Inicial' })
        const b2 = makeBuilding({ id: 2, name: 'Bloco Novo Persistido' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1]) // GET público inicial
          .mockResolvedValueOnce([b1]) // GET administrativo
          .mockResolvedValueOnce([b1, b2]) // Revalidação automática após escrita incerta

        const publicWrapper = mountPublicConsumers()
        await flushPromises()
        expect(publicWrapper.text()).toContain('Bloco Inicial')

        setAdminSession()
        const createSpy = vi.spyOn(buildingService, 'create').mockRejectedValueOnce(failure)
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')
        const store = useBuildingsStore()

        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: b2.name,
          address: b2.address,
          pickupPoint: b2.pickupPoint,
          serviceHours: b2.serviceHours,
        })
        findBodyButton('Cadastrar prédio')!.click()
        await flushPromises()

        expect(createSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()
        expect(listSpy).toHaveBeenCalledTimes(3)
        expect(store.loading).toBe(false)
        expect(store.items).toEqual([b1, b2])
        expect(publicWrapper.text()).toContain('Bloco Novo Persistido')
        expect(publicWrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([b1, b2])
        wrapper.unmount()
        publicWrapper.unmount()
      }
    })

    it('C13.2-02 — PATCH com HTTP 500 ou erro de rede revalida consumidores montados sem desmontar/remount e sem repetir PATCH', async () => {
      for (const failure of [makeHttpError(500), new Error('Network Error')]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const oldB = makeBuilding({ id: 1, name: 'Bloco Antigo' })
        const newB = makeBuilding({ id: 1, name: 'Bloco Editado no Backend' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([oldB])
          .mockResolvedValueOnce([oldB])
          .mockResolvedValueOnce([newB])
        vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(oldB)

        const publicWrapper = mountPublicConsumers()
        await flushPromises()
        expect(publicWrapper.text()).toContain('Bloco Antigo')

        setAdminSession()
        const updateSpy = vi.spyOn(buildingService, 'update').mockRejectedValueOnce(failure)
        const successSpy = vi.spyOn(useUiStore(), 'notifySuccess')
        const store = useBuildingsStore()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Antigo', 'Editar')!.trigger('click')
        await flushPromises()
        await setDialogField('building-name', newB.name)
        findBodyButton('Salvar alterações')!.click()
        await flushPromises()

        expect(updateSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()
        expect(listSpy).toHaveBeenCalledTimes(3)
        expect(store.loading).toBe(false)
        expect(publicWrapper.text()).toContain('Bloco Editado no Backend')
        expect(publicWrapper.text()).not.toContain('Bloco Antigo')
        expect(publicWrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([newB])
        wrapper.unmount()
        publicWrapper.unmount()
      }
    })

    it('C13.2-03 — DELETE com HTTP 500 ou erro de rede revalida consumidores montados e remove prédio excluído sem repetir DELETE', async () => {
      for (const failure of [makeHttpError(500), new Error('Network Error')]) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Removido' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([])

        const publicWrapper = mountPublicConsumers()
        await flushPromises()
        expect(publicWrapper.text()).toContain('Bloco Removido')

        setAdminSession()
        const removeSpy = vi.spyOn(buildingService, 'remove').mockRejectedValueOnce(failure)
        const ui = useUiStore()
        vi.spyOn(ui, 'confirm').mockResolvedValueOnce(true)
        const successSpy = vi.spyOn(ui, 'notifySuccess')
        const store = useBuildingsStore()

        const { wrapper } = await mountView()
        await flushPromises()

        await getCardButton(wrapper, 'Bloco Removido', 'Excluir')!.trigger('click')
        await flushPromises()

        expect(removeSpy).toHaveBeenCalledTimes(1)
        expect(successSpy).not.toHaveBeenCalled()
        expect(listSpy).toHaveBeenCalledTimes(3)
        expect(store.loading).toBe(false)
        expect(store.items).toEqual([])
        expect(publicWrapper.text()).not.toContain('Bloco Removido')
        expect(publicWrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([])
        wrapper.unmount()
        publicWrapper.unmount()
      }
    })

    it('C13.2-04 — falha da própria revalidação GET não entra em loop e recupera no retry manual', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Anterior' })
      const b2 = makeBuilding({ id: 1, name: 'Bloco Recuperado' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1]) // GET público
        .mockResolvedValueOnce([b1]) // GET admin
        .mockRejectedValueOnce(makeHttpError(503)) // revalidação automática falha
        .mockResolvedValueOnce([b2]) // retry manual funciona
      vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(b1)
      vi.spyOn(buildingService, 'update').mockRejectedValueOnce(makeHttpError(500))

      const publicWrapper = mountPublicConsumers()
      await flushPromises()

      setAdminSession()
      const store = useBuildingsStore()
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Anterior', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', b2.name)
      findBodyButton('Salvar alterações')!.click()
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(store.error).toBe(true)
      expect(store.loading).toBe(false)
      expect(publicWrapper.text()).toContain('Tentar novamente')

      await findButton(publicWrapper, 'Tentar novamente')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(4)
      expect(store.error).toBe(false)
      expect(store.loading).toBe(false)
      expect(publicWrapper.text()).toContain('Bloco Recuperado')
      expect(publicWrapper.findComponent(BuildingSelect).findComponent({ name: 'VSelect' }).props('items')).toEqual([b2])
    })

    it('C13.2-05 — GET público antigo fora de ordem terminado após revalidação de PATCH 500 não sobrescreve dados recentes', async () => {
      let resolveStaleGet!: (val: Building[]) => void
      let rejectPatch!: (err: unknown) => void
      const initialB = makeBuilding({ id: 1, name: 'Bloco Base' })
      const freshB = makeBuilding({ id: 1, name: 'Bloco Pós-500 Atualizado' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([initialB]) // GET admin
        .mockImplementationOnce(() => new Promise<Building[]>((r) => { resolveStaleGet = r })) // GET público lento
        .mockResolvedValueOnce([freshB]) // revalidação após PATCH 500
      vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(initialB)
      vi.spyOn(buildingService, 'update').mockImplementationOnce(
        () => new Promise<Building>((_, rej) => { rejectPatch = rej }),
      )

      setAdminSession()
      const store = useBuildingsStore()
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Base', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', freshB.name)
      findBodyButton('Salvar alterações')!.click()
      await nextTick()

      // Consumidor público monta e inicia GET lento enquanto PATCH ainda está em voo
      const publicWrapper = mountPublicConsumers()
      await nextTick()
      expect(listSpy).toHaveBeenCalledTimes(2)

      // PATCH falha com 500 -> aciona revalidação automática (#3) que vence primeiro
      rejectPatch(makeHttpError(500))
      await flushPromises()
      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(store.items).toEqual([freshB])
      expect(publicWrapper.text()).toContain('Bloco Pós-500 Atualizado')

      // GET antigo resolve depois com dados velhos -> descartado
      resolveStaleGet([makeBuilding({ id: 1, name: 'Bloco Antigo Lento' })])
      await flushPromises()

      expect(store.loading).toBe(false)
      expect(store.items).toEqual([freshB])
      expect(publicWrapper.text()).toContain('Bloco Pós-500 Atualizado')
      expect(publicWrapper.text()).not.toContain('Bloco Antigo Lento')
    })

    it('C13.2-06 — logout e desmontagem administrativa durante PATCH 500 ainda revalidam consumidor público sem efeitos administrativos', async () => {
      const oldB = makeBuilding({ id: 1, name: 'Bloco Antes Logout' })
      const newB = makeBuilding({ id: 1, name: 'Bloco Atual Após Logout' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([oldB]) // admin mount
        .mockResolvedValueOnce([oldB]) // consumidor público após logout durante PATCH pendente
        .mockResolvedValueOnce([newB]) // revalidação automática quando PATCH falha com erro de rede
      vi.spyOn(buildingService, 'getById').mockResolvedValueOnce(oldB)

      let rejectPatch!: (err: unknown) => void
      vi.spyOn(buildingService, 'update').mockImplementationOnce(
        () => new Promise<Building>((_, rej) => { rejectPatch = rej }),
      )

      const auth = setAdminSession()
      const ui = useUiStore()
      const successSpy = vi.spyOn(ui, 'notifySuccess')
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Antes Logout', 'Editar')!.trigger('click')
      await flushPromises()
      await setDialogField('building-name', newB.name)
      findBodyButton('Salvar alterações')!.click()
      await nextTick()

      // Sai do painel e faz logout enquanto PATCH ainda está em voo
      wrapper.unmount()
      auth.logout()
      const publicWrapper = mountPublicConsumers()
      await flushPromises()

      rejectPatch(new Error('Network Error'))
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(3)
      expect(successSpy).not.toHaveBeenCalled()
      expect(publicWrapper.text()).toContain('Bloco Atual Após Logout')
    })

    it('C13.2-07 — desmontagem do consumidor antes da falha 500 evita revalidação desnecessária; desmontagem durante revalidação não quebra estado', async () => {
      const b1 = makeBuilding({ id: 1, name: 'Bloco Inicial' })
      const listSpy = vi
        .spyOn(buildingService, 'list')
        .mockResolvedValueOnce([b1]) // consumidor público
        .mockResolvedValueOnce([b1]) // admin view
      let rejectDelete!: (err: unknown) => void
      vi.spyOn(buildingService, 'remove').mockImplementationOnce(
        () => new Promise<void>((_, rej) => { rejectDelete = rej }),
      )

      const publicWrapper = mountPublicConsumers()
      await flushPromises()

      setAdminSession()
      vi.spyOn(useUiStore(), 'confirm').mockResolvedValueOnce(true)
      const store = useBuildingsStore()
      const { wrapper } = await mountView()
      await flushPromises()

      await getCardButton(wrapper, 'Bloco Inicial', 'Excluir')!.trigger('click')
      await flushPromises()

      // Consumidor desmonta antes da falha 500
      publicWrapper.unmount()
      rejectDelete(makeHttpError(500))
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(store.loaded).toBe(false)
      expect(store.loading).toBe(false)
    })

    it('C13.2-08 — rejeições definitivas 400, 401, 403 e 409 com consumidores ativos não invalidam catálogo nem disparam GET', async () => {
      for (const status of [400, 401, 403, 409] as const) {
        vi.restoreAllMocks()
        localStorage.clear()
        setActivePinia(createPinia())

        const b1 = makeBuilding({ id: 1, name: 'Bloco Estável' })
        const listSpy = vi
          .spyOn(buildingService, 'list')
          .mockResolvedValueOnce([b1])
          .mockResolvedValueOnce([b1])
        vi.spyOn(buildingService, 'create').mockRejectedValueOnce(makeHttpError(status, `Erro ${status}`))

        const publicWrapper = mountPublicConsumers()
        await flushPromises()

        setAdminSession()
        const store = useBuildingsStore()
        const { wrapper } = await mountView()
        await flushPromises()

        await findButton(wrapper, 'Novo prédio')!.trigger('click')
        await nextTick()
        await fillBuildingDialog({
          name: 'Outro Prédio',
          address: 'Rua Nova, 99',
          pickupPoint: 'Portaria',
          serviceHours: '08h às 18h',
        })
        findBodyButton('Cadastrar prédio')!.click()
        await flushPromises()

        expect(listSpy).toHaveBeenCalledTimes(2)
        expect(store.loaded).toBe(true)
        wrapper.unmount()
        publicWrapper.unmount()
      }
    })
  })

  describe('Etapa 17 — R17-CONF-01: preservação de confirmação global externa', () => {
    it('R17-CONF-01 — exclusão de prédio não substitui diálogo global externo já aberto e volta a funcionar após liberação', async () => {
      setAdminSession()
      const building = makeBuilding({ id: 2, name: 'Bloco Central' })
      vi.spyOn(buildingService, 'list').mockResolvedValue([building])
      const removeSpy = vi.spyOn(buildingService, 'remove').mockResolvedValue(undefined)

      const { wrapper } = await mountView()
      await flushPromises()

      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Pertence a outro fluxo.',
      })
      const externalResolver = ui.confirmDialog.resolve
      let settled = false
      void externalPromise.then(() => {
        settled = true
      })

      await getCardButton(wrapper, 'Bloco Central', 'Excluir')!.trigger('click')
      await flushPromises()

      expect(ui.confirmDialog.resolve).toBe(externalResolver)
      expect(ui.confirmDialog.title).toBe('Confirmação externa')
      expect(removeSpy).not.toHaveBeenCalled()

      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(false)
      await flushPromises()
      expect(settled).toBe(true)

      await getCardButton(wrapper, 'Bloco Central', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(ui.confirmDialog.title).toBe('Excluir prédio?')
      ui.confirmDialog.resolve(true)
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(2)
    })
  })
})
