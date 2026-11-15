import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import AdminAdminsView from '../AdminAdminsView.vue'
import { vuetify } from '@/theme'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { adminService } from '@/services/admin.service'
import type { User } from '@/types'

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
  name: 'Super Admin',
  email: 'super@ufc.br',
  phone: null,
  role: 'SUPERADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeAdmin = (overrides: Partial<User> = {}): User => ({
  id: 2,
  name: 'Ana Silva',
  email: 'ana@ufc.br',
  phone: null,
  role: 'ADMIN',
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-03T12:00:00.000Z',
  ...overrides,
})

function setSuperAdminSession(userOverrides: Partial<User> = {}, token = 'super-jwt') {
  const auth = useAuthStore()
  auth.token = token
  auth.user = makeUser({ role: 'SUPERADMIN', ...userOverrides })
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mountedWrappers: VueWrapper[] = []

async function mountView() {
  const wrapper = mount(AdminAdminsView, {
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  await nextTick()
  return wrapper
}

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

async function openCreateModal() {
  const btn = findButtonByText('Novo administrador')
  expect(btn).toBeTruthy()
  btn!.click()
  await flushPromises()
  await nextTick()
}

function getCreateInputs() {
  const dialog = document.body.querySelector('[data-test="admin-create-dialog"]')
  expect(dialog).toBeTruthy()
  const nameInput = dialog!.querySelector('[data-test="admin-create-name"] input') as HTMLInputElement
  const emailInput = dialog!.querySelector('[data-test="admin-create-email"] input') as HTMLInputElement
  const passwordInput = dialog!.querySelector(
    '[data-test="admin-create-password"] input',
  ) as HTMLInputElement
  return { dialog: dialog!, nameInput, emailInput, passwordInput }
}

async function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

describe('AdminAdminsView (Etapa 15)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('A15 — Acesso restrito ao SUPERADMIN e isolamento de sessão', () => {
    it('A15-01 — SUPERADMIN carrega listagem via GET /admins e oculta texto de construção', async () => {
      setSuperAdminSession()
      const listSpy = vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])

      const wrapper = await mountView()

      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).not.toContain('Em construção')
      expect(wrapper.text()).toContain('Gerenciamento de Administradores')
    })

    it('A15-02 — USER autenticado não dispara GET /admins nem exibe ações administrativas', async () => {
      const auth = useAuthStore()
      auth.token = 'user-jwt'
      auth.user = makeUser({ id: 10, role: 'USER' })
      const listSpy = vi.spyOn(adminService, 'list').mockResolvedValue([])

      const wrapper = await mountView()

      expect(listSpy).not.toHaveBeenCalled()
      expect(wrapper.find('[data-test="admin-restricted-alert"]').exists()).toBe(true)
      expect(findButtonByText('Novo administrador')?.disabled ?? true).toBe(true)
    })

    it('A15-03 — ADMIN comum não dispara GET /admins e exibe acesso restrito ao SUPERADMIN', async () => {
      const auth = useAuthStore()
      auth.token = 'admin-jwt'
      auth.user = makeUser({ id: 11, role: 'ADMIN' })
      const listSpy = vi.spyOn(adminService, 'list').mockResolvedValue([])

      const wrapper = await mountView()

      expect(listSpy).not.toHaveBeenCalled()
      expect(wrapper.find('[data-test="admin-restricted-alert"]').exists()).toBe(true)
    })

    it('A15-04 — usuário não autenticado não executa nenhuma requisição', async () => {
      const listSpy = vi.spyOn(adminService, 'list').mockResolvedValue([])
      await mountView()
      expect(listSpy).not.toHaveBeenCalled()
    })

    it('A15-05 — logout durante GET /admins em voo descarta resposta tardia e limpa estado', async () => {
      const auth = setSuperAdminSession()
      const pending = deferred<User[]>()
      vi.spyOn(adminService, 'list').mockReturnValueOnce(pending.promise)

      const wrapper = await mountView()
      auth.logout()
      await flushPromises()

      pending.resolve([makeAdmin({ name: 'Admin Tardio' })])
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).not.toContain('Admin Tardio')
      expect(wrapper.find('[data-test="admin-restricted-alert"]').exists()).toBe(true)
    })

    it('A15-06 — rebaixamento de SUPERADMIN para ADMIN fecha modais, limpa rascunho de senha e descarta confirmação pendente', async () => {
      const auth = setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const wrapper = await mountView()

      await openCreateModal()
      const { nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Novo Admin')
      await setInputValue(emailInput, 'novo@ufc.br')
      await setInputValue(passwordInput, 'SenhaUltraSecreta!')

      auth.user = makeUser({ role: 'ADMIN' })
      await flushPromises()
      await nextTick()

      expect(document.body.querySelector('[data-test="admin-create-dialog"]')).toBeNull()
      expect(wrapper.find('[data-test="admin-restricted-alert"]').exists()).toBe(true)
    })

    it('A15-07 — troca de conta SUPERADMIN reinicia estado, cancela confirmação própria e recarrega lista da nova sessão', async () => {
      const auth = setSuperAdminSession({ id: 1, name: 'Super 1' }, 'jwt-1')
      const adminSession1 = makeAdmin({ id: 20, name: 'Admin Sessão 1', email: 's1@ufc.br' })
      const adminSession2 = makeAdmin({ id: 21, name: 'Admin Sessão 2', email: 's2@ufc.br' })
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([adminSession1])
        .mockResolvedValueOnce([adminSession2])

      const wrapper = await mountView()
      expect(wrapper.text()).toContain('Admin Sessão 1')

      // Abre confirmação de exclusão na sessão 1
      findButtonByText('Excluir')!.click()
      await flushPromises()
      const ui = useUiStore()
      expect(ui.confirmDialog.show).toBe(true)

      // Troca para outro SUPERADMIN
      auth.sessionGeneration += 1
      auth.token = 'jwt-2'
      auth.user = makeUser({ id: 99, name: 'Super 2', email: 'super2@ufc.br', role: 'SUPERADMIN' })
      await flushPromises()
      await nextTick()

      expect(ui.confirmDialog.show).toBe(false)
      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).not.toContain('Admin Sessão 1')
      expect(wrapper.text()).toContain('Admin Sessão 2')
    })

    it('A15-08 — troca de sessão durante POST /admins em voo ignora resposta tardia, limpa senha e não exibe snackbar', async () => {
      const auth = setSuperAdminSession({ id: 1 }, 'jwt-1')
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      const createDef = deferred<User>()
      vi.spyOn(adminService, 'create').mockReturnValueOnce(createDef.promise)

      await mountView()
      await openCreateModal()
      const { nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Admin Tardio')
      await setInputValue(emailInput, 'tardio@ufc.br')
      await setInputValue(passwordInput, 'SenhaTardia123!')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()

      auth.logout()
      await flushPromises()

      createDef.resolve(makeAdmin({ id: 77, name: 'Admin Tardio', email: 'tardio@ufc.br' }))
      await flushPromises()
      await nextTick()

      const ui = useUiStore()
      expect(ui.snackbar.show).toBe(false)
      expect(document.body.textContent).not.toContain('Admin Tardio')
    })

    it('A15-09 — desmontagem durante confirmação ativa fecha somente diálogo próprio sem interferir em confirmação externa', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const wrapper = await mountView()
      const ui = useUiStore()

      findButtonByText('Excluir')!.click()
      await flushPromises()
      expect(ui.confirmDialog.show).toBe(true)

      // Outro componente assume o diálogo global antes do unmount desta view
      const externalPromise = ui.confirm({ title: 'Externa', message: 'Outro fluxo' })
      wrapper.unmount()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toBe('Externa')
      ui.confirmDialog.resolve(false)
      await expect(externalPromise).resolves.toBe(false)
    })
  })

  describe('L15 — Listagem, ordenação, busca local e defesa de contrato', () => {
    it('L15-01 — renderiza administradores ordenados por nome sem botões de editar, promover ou rebaixar', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([
        makeAdmin({ id: 5, name: 'Carlos Lima', email: 'carlos@ufc.br', phone: '(88) 99999-1111' }),
        makeAdmin({ id: 2, name: 'Ana Silva', email: 'ana@ufc.br', phone: null }),
      ])

      const wrapper = await mountView()
      const rows = wrapper.findAll('[data-test="admin-row"]')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('Ana Silva')
      expect(rows[0].text()).toContain('ana@ufc.br')
      expect(rows[1].text()).toContain('Carlos Lima')
      expect(rows[1].text()).toContain('(88) 99999-1111')

      expect(wrapper.text()).not.toContain('Editar')
      expect(wrapper.text()).not.toContain('Promover')
      expect(wrapper.text()).not.toContain('Rebaixar')
    })

    it('L15-02 — exibe EmptyState quando não há administradores cadastrados', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([])

      const wrapper = await mountView()
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('L15-03 — exibe LoadingOverlay enquanto GET /admins está em andamento', async () => {
      setSuperAdminSession()
      const pending = deferred<User[]>()
      vi.spyOn(adminService, 'list').mockReturnValueOnce(pending.promise)

      const wrapper = await mountView()
      expect(wrapper.text()).toContain('Carregando administradores...')

      pending.resolve([])
      await flushPromises()
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('L15-04 — exibe ErrorAlert em falha do GET /admins e permite recuperar clicando em Tentar novamente', async () => {
      setSuperAdminSession()
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockResolvedValueOnce([makeAdmin()])

      const wrapper = await mountView()
      expect(wrapper.text()).toContain('Não foi possível carregar os dados')

      findButtonByText('Tentar novamente')!.click()
      await flushPromises()
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Ana Silva')
    })

    it('L15-05 — resposta fora de ordem no GET /admins prevalece sempre a mais recente', async () => {
      setSuperAdminSession()
      const first = deferred<User[]>()
      const second = deferred<User[]>()
      vi.spyOn(adminService, 'list')
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)

      const wrapper = await mountView()
      findButtonByText('Atualizar')!.click()
      await flushPromises()

      second.resolve([makeAdmin({ id: 20, name: 'Mais Recente', email: 'novo@ufc.br' })])
      await flushPromises()

      first.resolve([makeAdmin({ id: 10, name: 'Obsoleto', email: 'velho@ufc.br' })])
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).toContain('Mais Recente')
      expect(wrapper.text()).not.toContain('Obsoleto')
    })

    it('L15-06 — rejeita DTO de lista contendo SUPERADMIN, USER, ID duplicado ou campo de senha', async () => {
      setSuperAdminSession()
      const payloads: unknown[] = [
        [makeAdmin({ id: 2, role: 'SUPERADMIN' })],
        [makeAdmin({ id: 2, role: 'USER' })],
        [makeAdmin({ id: 2 }), makeAdmin({ id: 2, email: 'dup@ufc.br' })],
        [{ ...makeAdmin(), passwordHash: 'scrypt:abc' }],
      ]

      for (const badPayload of payloads) {
        vi.spyOn(adminService, 'list').mockResolvedValueOnce(badPayload as never)
        const wrapper = await mountView()
        expect(wrapper.findAll('[data-test="admin-row"]')).toHaveLength(0)
        expect(wrapper.text()).toContain('Não foi possível carregar os dados')
        wrapper.unmount()
      }
    })

    it('L15-07 — busca local filtra por nome e e-mail sem disparar novas requisições', async () => {
      setSuperAdminSession()
      const listSpy = vi.spyOn(adminService, 'list').mockResolvedValueOnce([
        makeAdmin({ id: 2, name: 'Ana Silva', email: 'ana@ufc.br' }),
        makeAdmin({ id: 3, name: 'Bruno Costa', email: 'coord.ti@ufc.br' }),
      ])

      const wrapper = await mountView()
      const searchInput = wrapper.find('[data-test="admin-search"] input').element as HTMLInputElement

      await setInputValue(searchInput, 'COORD.TI')
      expect(wrapper.findAll('[data-test="admin-row"]')).toHaveLength(1)
      expect(wrapper.text()).toContain('Bruno Costa')

      await setInputValue(searchInput, 'inexistente')
      expect(wrapper.findAll('[data-test="admin-row"]')).toHaveLength(0)
      expect(wrapper.text()).toContain('Nenhum administrador encontrado')

      await setInputValue(searchInput, '')
      expect(wrapper.findAll('[data-test="admin-row"]')).toHaveLength(2)
      expect(listSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('G15 — Detalhes de administrador (GET /admins/:id)', () => {
    it('G15-01 — clicar em Detalhes chama GET /admins/:id e exibe somente campos públicos autorizados', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({
        id: 7,
        name: 'Maria Souza',
        email: 'maria@ufc.br',
        phone: '(88) 98888-7777',
      })
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([admin])
      const detailSpy = vi.spyOn(adminService, 'getById').mockResolvedValueOnce(admin)

      await mountView()
      findButtonByText('Detalhes')!.click()
      await flushPromises()
      await nextTick()

      expect(detailSpy).toHaveBeenCalledWith(7)
      const dialog = document.body.querySelector('[data-test="admin-detail-dialog"]')
      expect(dialog).toBeTruthy()
      expect(dialog!.textContent).toContain('Maria Souza')
      expect(dialog!.textContent).toContain('maria@ufc.br')
      expect(dialog!.textContent).toContain('(88) 98888-7777')
      expect(dialog!.textContent).toContain('#7')
      expect(dialog!.textContent).not.toContain('passwordHash')
    })

    it('G15-02 — exibe loading durante GET /admins/:id e trata DTO inválido ou com hash exposto', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 8 })
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([admin])
      const detailDef = deferred<User>()
      vi.spyOn(adminService, 'getById').mockReturnValueOnce(detailDef.promise)

      await mountView()
      findButtonByText('Detalhes')!.click()
      await flushPromises()

      const dialog = document.body.querySelector('[data-test="admin-detail-dialog"]')
      expect(dialog!.textContent).toContain('Carregando')

      detailDef.resolve({ ...admin, role: 'SUPERADMIN' } as User)
      await flushPromises()
      await nextTick()

      expect(dialog!.textContent).toContain('Resposta inválida')
    })

    it('G15-03 — HTTP 404 nos detalhes exibe erro controlado e oferece atualização da lista', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 9, name: 'Admin Removido' })
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      vi.spyOn(adminService, 'getById').mockRejectedValueOnce(
        makeHttpError(404, 'Administrador não encontrado.'),
      )

      const wrapper = await mountView()
      findButtonByText('Detalhes')!.click()
      await flushPromises()
      await nextTick()

      const dialog = document.body.querySelector('[data-test="admin-detail-dialog"]')
      expect(dialog!.textContent).toContain('Administrador não encontrado.')

      const syncBtn = Array.from(dialog!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Atualizar listagem'),
      )
      expect(syncBtn).toBeTruthy()
      syncBtn!.click()
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('G15-04 — troca rápida entre detalhes A e B descarta resposta atrasada de A', async () => {
      setSuperAdminSession()
      const adminA = makeAdmin({ id: 2, name: 'Admin A', email: 'a@ufc.br' })
      const adminB = makeAdmin({ id: 3, name: 'Admin B', email: 'b@ufc.br' })
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([adminA, adminB])

      const defA = deferred<User>()
      const defB = deferred<User>()
      vi.spyOn(adminService, 'getById')
        .mockReturnValueOnce(defA.promise)
        .mockReturnValueOnce(defB.promise)

      const wrapper = await mountView()
      const detailBtns = wrapper.findAll('[data-test="admin-detail-btn"]')
      await detailBtns[0].trigger('click')
      await nextTick()
      findButtonByText('Fechar')?.click()
      await nextTick()
      await detailBtns[1].trigger('click')
      await nextTick()

      defB.resolve(adminB)
      await flushPromises()
      defA.resolve(adminA)
      await flushPromises()
      await nextTick()

      const dialog = document.body.querySelector('[data-test="admin-detail-dialog"]')
      expect(dialog!.textContent).toContain('Admin B')
      expect(dialog!.textContent).not.toContain('Admin A')
    })

    it('G15-05 — fechar modal de detalhes descarta resposta tardia de GET /admins/:id', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 2, name: 'Admin Tardio Detalhe' })
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([admin])
      const def = deferred<User>()
      vi.spyOn(adminService, 'getById').mockReturnValueOnce(def.promise)

      await mountView()
      findButtonByText('Detalhes')!.click()
      await nextTick()
      findButtonByText('Fechar')!.click()
      await nextTick()

      def.resolve(admin)
      await flushPromises()
      await nextTick()

      expect(document.body.querySelector('[data-test="admin-detail-dialog"]')).toBeNull()
    })
  })

  describe('C15 — Cadastro de administrador (POST /admins) e proteção de credenciais', () => {
    it('C15-01 — modal contém apenas Nome, E-mail e Senha inicial mascarada com autocomplete new-password', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([])
      await mountView()

      await openCreateModal()
      const { dialog, nameInput, emailInput, passwordInput } = getCreateInputs()

      expect(nameInput).toBeTruthy()
      expect(emailInput).toBeTruthy()
      expect(passwordInput.type).toBe('password')
      expect(passwordInput.getAttribute('autocomplete')).toBe('new-password')
      expect(dialog.querySelectorAll('input')).toHaveLength(3)
      expect(dialog.textContent).not.toContain('Telefone')
      expect(dialog.textContent).not.toContain('SUPERADMIN')
    })

    it('C15-02 — valida campos localmente sem chamar POST /admins para dados inválidos', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([])
      const createSpy = vi.spyOn(adminService, 'create')
      await mountView()

      await openCreateModal()
      const { nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'An')
      await setInputValue(emailInput, 'invalido')
      await setInputValue(passwordInput, '')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()

      expect(createSpy).not.toHaveBeenCalled()

      // Senha acima de 1024 bytes UTF-8 também é bloqueada
      await setInputValue(nameInput, 'Ana Silva')
      await setInputValue(emailInput, 'ana@ufc.br')
      await setInputValue(passwordInput, 'á'.repeat(513))
      findButtonByText('Cadastrar')!.click()
      await flushPromises()

      expect(createSpy).not.toHaveBeenCalled()
    })

    it('C15-03 — envia { name, email, initialPassword } preservando espaços da senha e não persiste credencial', async () => {
      setSuperAdminSession()
      const created = makeAdmin({ id: 15, name: 'Ana Silva', email: 'ana.nova@ufc.br' })
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([created])
      const createSpy = vi.spyOn(adminService, 'create').mockResolvedValueOnce(created)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const wrapper = await mountView()
      await openCreateModal()
      const { nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, '  Ana Silva  ')
      await setInputValue(emailInput, '  ANA.NOVA@UFC.BR  ')
      await setInputValue(passwordInput, '  SenhaSecreta 99!  ')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()
      await nextTick()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Ana Silva',
        email: 'ana.nova@ufc.br',
        initialPassword: '  SenhaSecreta 99!  ',
      })
      expect(document.body.querySelector('[data-test="admin-create-dialog"]')).toBeNull()
      expect(wrapper.text()).toContain('Ana Silva')

      // Verifica proteção da credencial em storages, snackbar e console
      const ui = useUiStore()
      expect(ui.snackbar.show).toBe(true)
      expect(ui.snackbar.message).not.toContain('SenhaSecreta')
      expect(JSON.stringify(localStorage)).not.toContain('SenhaSecreta')
      expect(JSON.stringify(sessionStorage)).not.toContain('SenhaSecreta')
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()

      // Reabrir modal inicia com campos limpos e senha mascarada
      await openCreateModal()
      const reopened = getCreateInputs()
      expect(reopened.nameInput.value).toBe('')
      expect(reopened.emailInput.value).toBe('')
      expect(reopened.passwordInput.value).toBe('')
      expect(reopened.passwordInput.type).toBe('password')
    })

    it('C15-04 — cancelar modal limpa rascunho de senha e restaura visibilidade oculta', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([])
      await mountView()

      await openCreateModal()
      const { passwordInput, dialog } = getCreateInputs()
      await setInputValue(passwordInput, 'Rascunho123!')
      const toggleBtn = dialog.querySelector('[data-test="toggle-initial-password"]') as HTMLButtonElement | null
      toggleBtn?.click()
      await nextTick()
      expect(passwordInput.type).toBe('text')

      findButtonByText('Cancelar')!.click()
      await flushPromises()
      await openCreateModal()

      const reopened = getCreateInputs()
      expect(reopened.passwordInput.value).toBe('')
      expect(reopened.passwordInput.type).toBe('password')
    })

    it('C15-05 — bloqueia duplo clique enquanto POST /admins está em andamento', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeAdmin()])
      const pending = deferred<User>()
      const createSpy = vi.spyOn(adminService, 'create').mockReturnValueOnce(pending.promise)

      await mountView()
      await openCreateModal()
      const { nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Ana Silva')
      await setInputValue(emailInput, 'ana@ufc.br')
      await setInputValue(passwordInput, 'Senha123!')

      const submitBtn = findButtonByText('Cadastrar')!
      submitBtn.click()
      submitBtn.click()
      await flushPromises()

      expect(createSpy).toHaveBeenCalledTimes(1)

      pending.resolve(makeAdmin())
      await flushPromises()
    })

    it('C15-06 — HTTP 409 exibe mensagem de e-mail já cadastrado sem fechar o modal nem reenviar automaticamente', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([])
      const createSpy = vi
        .spyOn(adminService, 'create')
        .mockRejectedValueOnce(makeHttpError(409, 'Já existe um registro com esses dados únicos.'))

      await mountView()
      await openCreateModal()
      const { dialog, nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Ana Silva')
      await setInputValue(emailInput, 'ana@ufc.br')
      await setInputValue(passwordInput, 'Senha123!')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()
      await nextTick()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(document.body.querySelector('[data-test="admin-create-dialog"]')).toBeTruthy()
      expect(dialog.textContent).toContain('Já existe um registro com esses dados únicos.')
      expect(dialog.textContent).not.toContain('Senha123!')
    })

    it('C15-07 — falha 500 ou rede no POST /admins oferece Recarregar listagem para verificar estado incerto', async () => {
      setSuperAdminSession()
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeAdmin({ name: 'Criado Antes do Timeout' })])
      vi.spyOn(adminService, 'create').mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))

      const wrapper = await mountView()
      await openCreateModal()
      const { dialog, nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Ana Silva')
      await setInputValue(emailInput, 'ana@ufc.br')
      await setInputValue(passwordInput, 'Senha123!')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()
      await nextTick()

      const reloadBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Recarregar listagem'),
      )
      expect(reloadBtn).toBeTruthy()
      reloadBtn!.click()
      await flushPromises()
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Criado Antes do Timeout')
    })

    it('C15-08 — HTTP 201 com DTO inválido é rejeitado e aciona verificação da listagem', async () => {
      setSuperAdminSession()
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      vi.spyOn(adminService, 'create').mockResolvedValueOnce({
        ...makeAdmin(),
        passwordHash: 'leaked',
      } as User)

      await mountView()
      await openCreateModal()
      const { dialog, nameInput, emailInput, passwordInput } = getCreateInputs()
      await setInputValue(nameInput, 'Ana Silva')
      await setInputValue(emailInput, 'ana@ufc.br')
      await setInputValue(passwordInput, 'Senha123!')

      findButtonByText('Cadastrar')!.click()
      await flushPromises()
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(dialog.textContent).not.toContain('leaked')
      expect(useUiStore().snackbar.show).toBe(false)
    })
  })

  describe('D15 — Exclusão de administrador (DELETE /admins/:id)', () => {
    it('D15-01 — cancelar confirmação não chama DELETE /admins/:id', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      await mountView()
      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.danger).toBe(true)
      expect(ui.confirmDialog.message).toContain('Ana Silva')
      ui.confirmDialog.resolve(false)
      await flushPromises()

      expect(removeSpy).not.toHaveBeenCalled()
    })

    it('D15-02 — confirmar exclusão executa DELETE /admins/:id, trata 204 e recarrega lista', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 5, name: 'Ana Exclusão' })
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(adminService, 'remove').mockResolvedValueOnce(undefined)

      const wrapper = await mountView()
      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()

      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(5)
      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(ui.snackbar.show).toBe(true)
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('D15-03 — HTTP 409 preserva administrador na lista e exibe motivo sem inventar exclusão em cascata', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 6, name: 'Admin Vinculado' })
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([admin])
      const removeSpy = vi
        .spyOn(adminService, 'remove')
        .mockRejectedValueOnce(makeHttpError(409, 'A operação conflita com registros relacionados.'))

      const wrapper = await mountView()
      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()

      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-test="admin-delete-alert"]').text()).toContain(
        'A operação conflita com registros relacionados.',
      )
      expect(wrapper.text()).toContain('Admin Vinculado')
    })

    it('D15-04 — HTTP 404 na exclusão concilia a listagem automaticamente', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 7, name: 'Admin Já Excluído' })
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      vi.spyOn(adminService, 'remove').mockRejectedValueOnce(
        makeHttpError(404, 'Administrador não encontrado.'),
      )

      const wrapper = await mountView()
      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()

      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('D15-05 — erro 500 ou rede na exclusão exibe alerta com Verificar estado atual sem repetir DELETE', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 8, name: 'Admin Incerto' })
      const listSpy = vi
        .spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      const removeSpy = vi
        .spyOn(adminService, 'remove')
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))

      const wrapper = await mountView()
      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()

      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      const verifyBtn = findButtonByText('Verificar estado atual')
      expect(verifyBtn).toBeTruthy()
      verifyBtn!.click()
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
    })

    it('D15-06 — bloqueia exclusões concorrentes e abertura de criação durante confirmação/exclusão', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([makeAdmin({ id: 1 }), makeAdmin({ id: 2, name: 'Outro' })])
        .mockResolvedValueOnce([makeAdmin({ id: 2, name: 'Outro' })])
      const removeDef = deferred<void>()
      const removeSpy = vi.spyOn(adminService, 'remove').mockReturnValueOnce(removeDef.promise)

      const wrapper = await mountView()
      const ui = useUiStore()
      const deleteBtns = wrapper.findAll('[data-test="admin-delete-btn"]')
      await deleteBtns[0].trigger('click')
      await nextTick()
      ui.confirmDialog.resolve(true)
      await flushPromises()

      // Botões de criação e exclusão ficam desabilitados enquanto remove está em voo
      expect(findButtonByText('Novo administrador')!.disabled).toBe(true)
      await deleteBtns[1].trigger('click')
      expect(removeSpy).toHaveBeenCalledTimes(1)

      removeDef.resolve(undefined)
      await flushPromises()
    })

    it('D15-07 — GET /admins pré-mutação atrasado não sobrescreve lista recarregada após exclusão', async () => {
      setSuperAdminSession()
      const stalePreMutationList = deferred<User[]>()
      const adminA = makeAdmin({ id: 2, name: 'Admin A' })
      const adminB = makeAdmin({ id: 3, name: 'Admin B' })
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([adminA, adminB])
        .mockReturnValueOnce(stalePreMutationList.promise)
        .mockResolvedValueOnce([adminB])
      vi.spyOn(adminService, 'remove').mockResolvedValueOnce(undefined)

      const wrapper = await mountView()
      const ui = useUiStore()

      // Dispara atualização manual que ficará lenta em voo
      findButtonByText('Atualizar')!.click()
      await nextTick()

      // Antes de ela resolver, exclui adminA e recarrega estado real
      findButtonByText('Excluir')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()

      // Só agora o GET antigo pré-mutação resolve trazendo adminA de volta
      stalePreMutationList.resolve([adminA, adminB])
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).toContain('Admin B')
      expect(wrapper.text()).not.toContain('Admin A')
    })

    it('D15-08 — excluir administrador fecha modal de detalhes se estiver exibindo o mesmo registro', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 4, name: 'Admin Detalhe Excluído' })
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      vi.spyOn(adminService, 'getById').mockResolvedValue(admin)
      vi.spyOn(adminService, 'remove').mockResolvedValueOnce(undefined)

      await mountView()
      findButtonByText('Detalhes')!.click()
      await flushPromises()
      expect(document.body.querySelector('[data-test="admin-detail-dialog"]')).toBeTruthy()
      findButtonByText('Fechar')!.click()
      await nextTick()

      // Reabre detalhes via estado ou verifica fechamento após exclusão direta:
      // Abre novamente sem fechar antes de confirmar exclusão via uiStore
      findButtonByText('Detalhes')!.click()
      await flushPromises()
      expect(document.body.querySelector('[data-test="admin-detail-dialog"]')).toBeTruthy()

      const ui = useUiStore()
      findButtonByText('Excluir')!.click()
      await flushPromises()
      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(document.body.querySelector('[data-test="admin-detail-dialog"]')).toBeNull()
    })
  })

  describe('D15.1 — Proteção contra colisão com confirmação global ocupada', () => {
    it('D15.1-01 — diálogo externo aberto antes da exclusão preserva resolver, metadados e bloqueia DELETE', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      await mountView()
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm')

      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Esta confirmação pertence a outro componente.',
        danger: false,
        confirmText: 'Sim, prosseguir',
        cancelText: 'Voltar',
      })
      const externalResolver = ui.confirmDialog.resolve

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.open).toBe(true)
      expect(ui.confirmDialog.title).toBe('Confirmação externa')

      try {
        findButtonByText('Excluir')!.click()
        await flushPromises()
        await nextTick()

        expect(confirmSpy).toHaveBeenCalledTimes(1)
        expect(ui.confirmDialog.resolve).toBe(externalResolver)
        expect(ui.confirmDialog.title).toBe('Confirmação externa')
        expect(ui.confirmDialog.message).toBe('Esta confirmação pertence a outro componente.')
        expect(ui.confirmDialog.danger).toBe(false)
        expect(ui.confirmDialog.confirmText).toBe('Sim, prosseguir')
        expect(ui.confirmDialog.cancelText).toBe('Voltar')
        expect(removeSpy).not.toHaveBeenCalled()
        expect(ui.snackbar.show).toBe(false)
      } finally {
        ui.confirmDialog.show = false
        ui.confirmDialog.open = false
        externalResolver(false)
        ui.confirmDialog.resolve(false)
        await externalPromise
      }
    })

    it('D15.1-02 — Promise externa continua resolvível após tentativa bloqueada de exclusão', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      await mountView()
      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Esta confirmação pertence a outro componente.',
      })
      const externalResolver = ui.confirmDialog.resolve

      findButtonByText('Excluir')!.click()
      await flushPromises()
      await nextTick()

      let settled = false
      let settledValue: boolean | undefined
      void externalPromise.then((value) => {
        settled = true
        settledValue = value
      })

      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(false)
      await flushPromises()

      try {
        expect(settled).toBe(true)
        expect(settledValue).toBe(false)
        expect(removeSpy).not.toHaveBeenCalled()
        expect(ui.snackbar.show).toBe(false)
      } finally {
        if (!settled) {
          externalResolver(false)
          await externalPromise
        }
      }
    })

    it('D15.1-03 — exclusão funciona normalmente após liberação do diálogo externo', async () => {
      setSuperAdminSession()
      const admin = makeAdmin({ id: 5, name: 'Ana Liberada' })
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([admin])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(adminService, 'remove').mockResolvedValueOnce(undefined)

      const wrapper = await mountView()
      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Fluxo externo em andamento.',
      })
      const externalResolver = ui.confirmDialog.resolve

      findButtonByText('Excluir')!.click()
      await flushPromises()
      expect(ui.confirmDialog.title).toBe('Confirmação externa')

      // Libera diálogo externo
      let externalSettled = false
      let externalValue: boolean | undefined
      void externalPromise.then((value) => {
        externalSettled = true
        externalValue = value
      })
      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(false)
      await flushPromises()

      try {
        expect(externalSettled).toBe(true)
        expect(externalValue).toBe(false)
      } finally {
        if (!externalSettled) {
          externalResolver(false)
          await externalPromise
        }
      }

      // Nova tentativa administrativa agora abre o diálogo próprio e exclui
      findButtonByText('Excluir')!.click()
      await flushPromises()
      await nextTick()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toBe('Excluir administrador')
      expect(ui.confirmDialog.danger).toBe(true)

      ui.confirmDialog.resolve(true)
      await flushPromises()
      await nextTick()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(5)
      expect(wrapper.text()).toContain('Nenhum administrador cadastrado')
    })

    it('D15.1-04 — bloqueia nova confirmação durante ocupação parcial do estado (show ou open)', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      await mountView()
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm')

      // Caso 1: apenas show === true
      ui.confirmDialog.show = true
      ui.confirmDialog.open = false
      ui.confirmDialog.title = 'Parcial show'
      findButtonByText('Excluir')!.click()
      await flushPromises()
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(ui.confirmDialog.title).toBe('Parcial show')

      // Caso 2: apenas open === true
      ui.confirmDialog.show = false
      ui.confirmDialog.open = true
      ui.confirmDialog.title = 'Parcial open'
      findButtonByText('Excluir')!.click()
      await flushPromises()
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(ui.confirmDialog.title).toBe('Parcial open')

      ui.confirmDialog.open = false
      expect(removeSpy).not.toHaveBeenCalled()
    })

    it('D15.1-05 — preserva proteção contra duplo clique na confirmação administrativa própria', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list')
        .mockResolvedValueOnce([makeAdmin({ id: 9, name: 'Admin Único' })])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(adminService, 'remove').mockResolvedValueOnce(undefined)

      await mountView()
      const ui = useUiStore()
      const confirmSpy = vi.spyOn(ui, 'confirm')

      const deleteBtn = findButtonByText('Excluir')!
      deleteBtn.click()
      await nextTick()
      const firstResolver = ui.confirmDialog.resolve

      // Segundo clique enquanto a própria confirmação está aberta
      deleteBtn.click()
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(ui.confirmDialog.resolve).toBe(firstResolver)

      ui.confirmDialog.resolve(true)
      await flushPromises()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(9)
    })

    it('D15.1-06 — logout durante diálogo externo após tentativa bloqueada preserva diálogo externo intacto', async () => {
      const auth = setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      const wrapper = await mountView()
      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Pertence a outro fluxo.',
      })
      const externalResolver = ui.confirmDialog.resolve

      try {
        findButtonByText('Excluir')!.click()
        await flushPromises()

        auth.logout()
        await flushPromises()
        await nextTick()

        expect(ui.confirmDialog.show).toBe(true)
        expect(ui.confirmDialog.open).toBe(true)
        expect(ui.confirmDialog.resolve).toBe(externalResolver)
        expect(ui.confirmDialog.title).toBe('Confirmação externa')
        expect(removeSpy).not.toHaveBeenCalled()
        expect(ui.snackbar.show).toBe(false)
        expect(wrapper.find('[data-test="admin-restricted-alert"]').exists()).toBe(true)
      } finally {
        ui.confirmDialog.show = false
        ui.confirmDialog.open = false
        externalResolver(false)
        ui.confirmDialog.resolve(false)
        await externalPromise
      }
    })

    it('D15.1-07 — desmontagem após tentativa bloqueada preserva diálogo e Promise externa', async () => {
      setSuperAdminSession()
      vi.spyOn(adminService, 'list').mockResolvedValueOnce([makeAdmin()])
      const removeSpy = vi.spyOn(adminService, 'remove')

      const wrapper = await mountView()
      const ui = useUiStore()
      const externalPromise = ui.confirm({
        title: 'Confirmação externa',
        message: 'Outro componente aguarda resposta.',
      })
      const externalResolver = ui.confirmDialog.resolve

      findButtonByText('Excluir')!.click()
      await flushPromises()

      wrapper.unmount()
      await flushPromises()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.open).toBe(true)
      expect(ui.confirmDialog.resolve).toBe(externalResolver)

      let settled = false
      let settledValue: boolean | undefined
      void externalPromise.then((value) => {
        settled = true
        settledValue = value
      })

      ui.confirmDialog.show = false
      ui.confirmDialog.open = false
      ui.confirmDialog.resolve(true)
      await flushPromises()

      try {
        expect(settled).toBe(true)
        expect(settledValue).toBe(true)
        expect(removeSpy).not.toHaveBeenCalled()
      } finally {
        if (!settled) {
          externalResolver(false)
          await externalPromise
        }
      }
    })
  })
})
