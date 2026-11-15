import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import AdminCategoriesView from '../AdminCategoriesView.vue'
import CategorySelect from '@/components/form/CategorySelect.vue'
import { vuetify } from '@/theme'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { categoryService } from '@/services/category.service'
import type { Category, User } from '@/types'

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

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 2,
  name: 'Eletrônicos',
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
      { path: '/admin/categorias', name: 'admin-categories', component: { template: '<div />' } },
      { path: '/403', name: 'forbidden', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', name: 'fallback', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/admin/categorias')
  await router.isReady()
  const wrapper = mount(AdminCategoriesView, {
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

function getRowByCategoryName(wrapper: VueWrapper, name: string) {
  return wrapper
    .findAll('[data-test="category-row"]')
    .find((row) => row.text().includes(name))
}

function getRowButton(wrapper: VueWrapper, categoryName: string, buttonLabel: string) {
  const row = getRowByCategoryName(wrapper, categoryName)
  return row?.findAll('button').find((b) => b.text().includes(buttonLabel))
}

async function setDialogName(value: string) {
  const container = document.body.querySelector('[data-test="category-name"]')
  const input = container?.querySelector('input') as HTMLInputElement | null
  if (!input) throw new Error('Campo category-name não encontrado no diálogo')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

function getDialogNameValue(): string {
  const container = document.body.querySelector('[data-test="category-name"]')
  const input = container?.querySelector('input') as HTMLInputElement | null
  return input?.value ?? ''
}

describe('AdminCategoriesView (Etapa 14 — Gerenciamento Administrativo de Categorias)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()!.unmount()
    }
    document.body.innerHTML = ''
  })

  describe('Listagem, Busca e Sessão (A14-01–A14-10)', () => {
    it('A14-01 & A14-02 — remove stub e carrega categorias para ADMIN e SUPERADMIN', async () => {
      setAdminSession({ role: 'ADMIN' })
      const catalog = [
        makeCategory({ id: 1, name: 'Acessórios' }),
        makeCategory({ id: 2, name: 'Documentos' }),
      ]
      const listSpy = vi.spyOn(categoryService, 'list').mockResolvedValueOnce(catalog)

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.text()).not.toContain('Em construção')
      expect(wrapper.text()).toContain('Gerenciamento de Categorias')
      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Acessórios')
      expect(wrapper.text()).toContain('Documentos')
      wrapper.unmount()

      // SUPERADMIN
      vi.restoreAllMocks()
      setActivePinia(createPinia())
      setAdminSession({ id: 9, role: 'SUPERADMIN' }, 'super-jwt')
      const superSpy = vi
        .spyOn(categoryService, 'list')
        .mockResolvedValueOnce([makeCategory({ id: 3, name: 'Vestuário' })])

      const { wrapper: superWrapper } = await mountView()
      await flushPromises()
      expect(superSpy).toHaveBeenCalledTimes(1)
      expect(superWrapper.text()).toContain('Vestuário')
    })

    it('A14-03 — USER comum não executa GET nem operações administrativas', async () => {
      setAdminSession({ role: 'USER' }, 'user-jwt')
      const listSpy = vi.spyOn(categoryService, 'list')

      const { wrapper } = await mountView()
      await flushPromises()

      expect(listSpy).not.toHaveBeenCalled()
      expect(findButton(wrapper, 'Nova categoria')?.attributes('disabled')).toBeDefined()
    })

    it('A14-04 — exibe EmptyState quando lista retornada é []', async () => {
      setAdminSession()
      vi.spyOn(categoryService, 'list').mockResolvedValueOnce([])

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
      expect(wrapper.text()).toContain('Nenhuma categoria cadastrada')
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
    })

    it('A14-05 — falha de GET exibe ErrorAlert sem falso vazio e retry recupera listagem', async () => {
      setAdminSession()
      const listSpy = vi
        .spyOn(categoryService, 'list')
        .mockRejectedValueOnce(makeHttpError(503))
        .mockResolvedValueOnce([makeCategory({ id: 4, name: 'Chaves' })])

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

      await findButton(wrapper, 'Tentar novamente')!.trigger('click')
      await flushPromises()

      expect(listSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(false)
      expect(wrapper.text()).toContain('Chaves')
    })

    it('A14-06 & A14-07 — busca local ignora caixa/espaços nas bordas, não dispara GET e exibe estado vazio de busca', async () => {
      setAdminSession()
      const listSpy = vi.spyOn(categoryService, 'list').mockResolvedValueOnce([
        makeCategory({ id: 1, name: 'Eletrônicos' }),
        makeCategory({ id: 2, name: 'Documentos' }),
      ])

      const { wrapper } = await mountView()
      await flushPromises()

      const searchInput = wrapper.find('input')
      await searchInput.setValue('  ELETRÔ  ')
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Eletrônicos')
      expect(wrapper.text()).not.toContain('Documentos')

      await searchInput.setValue('Inexistente')
      await nextTick()
      expect(wrapper.text()).toContain('Nenhuma categoria encontrada')

      await searchInput.setValue('')
      await nextTick()
      expect(wrapper.text()).toContain('Eletrônicos')
      expect(wrapper.text()).toContain('Documentos')
    })

    it('A14-08 — DTO inválido em GET é rejeitado sem falso EmptyState', async () => {
      setAdminSession()
      vi.spyOn(categoryService, 'list').mockResolvedValueOnce([
        { id: 0, name: 'X' } as unknown as Category,
      ])

      const { wrapper } = await mountView()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ErrorAlert' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
    })

    it('A14-09 & A14-10 — GET antigo fora de ordem é ignorado e logout durante GET não popula tela', async () => {
      const auth = setAdminSession()
      let resolveFirst!: (val: Category[]) => void
      let resolveSecond!: (val: Category[]) => void
      vi.spyOn(categoryService, 'list')
        .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveSecond = r }))

      const { wrapper } = await mountView()
      await nextTick()

      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      resolveSecond([makeCategory({ id: 2, name: 'Categoria Atual' })])
      await flushPromises()

      resolveFirst([makeCategory({ id: 1, name: 'Categoria Antiga' })])
      await flushPromises()

      expect(wrapper.text()).toContain('Categoria Atual')
      expect(wrapper.text()).not.toContain('Categoria Antiga')

      // Logout durante GET pendente
      let resolveAfterLogout!: (val: Category[]) => void
      vi.spyOn(categoryService, 'list').mockImplementationOnce(
        () => new Promise<Category[]>((r) => { resolveAfterLogout = r }),
      )
      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      auth.logout()
      await nextTick()

      resolveAfterLogout([makeCategory({ id: 8, name: 'Categoria Vazada' })])
      await flushPromises()

      expect(wrapper.text()).not.toContain('Categoria Vazada')
    })
  })

  describe('Cadastro de Categorias (C14-01–C14-12)', () => {
    it('C14-01 & C14-02 — abre formulário, valida nome vazio, espaços, <2 e >100 caracteres sem enviar POST', async () => {
      setAdminSession()
      vi.spyOn(categoryService, 'list').mockResolvedValueOnce([])
      const createSpy = vi.spyOn(categoryService, 'create')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      expect(document.body.textContent).toContain('Nova categoria')

      for (const badName of ['', '   ', 'A', 'X'.repeat(101)]) {
        await setDialogName(badName)
        findBodyButton('Salvar')!.click()
        await nextTick()
      }

      expect(createSpy).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('Máximo de 100 caracteres.')
    })

    it('C14-03, C14-04 & C14-05 — normaliza extremidades, envia somente { name }, atualiza listagem/catálogo e bloqueia duplo submit', async () => {
      setAdminSession()
      const created = makeCategory({ id: 10, name: 'Óculos & Chaves' })
      vi.spyOn(categoryService, 'list')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([created])

      let resolvePost!: (val: Category) => void
      const createSpy = vi.spyOn(categoryService, 'create').mockImplementationOnce(
        () => new Promise<Category>((r) => { resolvePost = r }),
      )

      const store = useCategoriesStore()
      const ui = useUiStore()
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      await setDialogName('  Óculos & Chaves  ')

      const saveBtn = findBodyButton('Salvar')!
      saveBtn.click()
      saveBtn.click()
      await nextTick()

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).toHaveBeenCalledWith({ name: 'Óculos & Chaves' })
      expect(Object.keys(createSpy.mock.calls[0][0])).toEqual(['name'])

      resolvePost(created)
      await flushPromises()

      expect(wrapper.text()).toContain('Óculos & Chaves')
      expect(store.items).toEqual([created])
      expect(snackSpy).toHaveBeenCalledTimes(1)
    })

    it('C14-06, C14-07, C14-08, C14-09 & C14-10 — trata 409, 400, 500, rede e DTO inválido sem retry automático ou sucesso falso', async () => {
      setAdminSession()
      vi.spyOn(categoryService, 'list').mockResolvedValue([])
      const createSpy = vi
        .spyOn(categoryService, 'create')
        .mockRejectedValueOnce(makeHttpError(409, 'Já existe uma categoria com esse nome.'))
        .mockRejectedValueOnce(makeHttpError(400, 'Nome inválido.'))
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ id: -1, name: 'X' } as unknown as Category)

      const ui = useUiStore()
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      const { wrapper } = await mountView()
      await flushPromises()

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      await setDialogName('Eletrônicos')

      // 409
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Já existe uma categoria com esse nome.')
      expect(getDialogNameValue()).toBe('Eletrônicos')

      // 400
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Nome inválido.')

      // 500 -> resultado incerto oferece recarregar listagem
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Não foi possível confirmar')
      expect(findBodyButton('Recarregar listagem')).toBeDefined()

      // Rede
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Não foi possível confirmar')

      // HTTP 201 com DTO inválido
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Resposta inválida ao cadastrar a categoria')
      expect(createSpy).toHaveBeenCalledTimes(5)
      expect(snackSpy).not.toHaveBeenCalled()
    })

    it('C14-11 & C14-12 — logout durante POST suprime snackbar, invalida catálogo público e GET antigo não apaga categoria criada', async () => {
      const auth = setAdminSession()
      let resolveStaleGet!: (val: Category[]) => void
      const created = makeCategory({ id: 15, name: 'Livros' })

      vi.spyOn(categoryService, 'list')
        .mockResolvedValueOnce([])
        .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveStaleGet = r }))
        .mockResolvedValueOnce([created])

      const createSpy = vi.spyOn(categoryService, 'create').mockResolvedValueOnce(created)

      const { wrapper } = await mountView()
      await flushPromises()

      // C14-12: GET antigo antes do POST
      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      await setDialogName('Livros')
      findBodyButton('Salvar')!.click()
      await flushPromises()

      resolveStaleGet([])
      await flushPromises()
      expect(wrapper.text()).toContain('Livros')
      expect(createSpy).toHaveBeenCalledTimes(1)

      // C14-11: Logout durante POST pendente + consumidor público ativo
      let resolvePostAfterLogout!: (val: Category) => void
      vi.spyOn(categoryService, 'create').mockImplementationOnce(
        () => new Promise<Category>((r) => { resolvePostAfterLogout = r }),
      )
      vi.spyOn(categoryService, 'list').mockResolvedValue([
        created,
        makeCategory({ id: 16, name: 'Pós-Logout' }),
      ])

      const selectWrapper = mount(CategorySelect, {
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(selectWrapper)

      const ui = useUiStore()
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      await setDialogName('Pós-Logout')
      findBodyButton('Salvar')!.click()
      await nextTick()

      auth.logout()
      await nextTick()

      resolvePostAfterLogout(makeCategory({ id: 16, name: 'Pós-Logout' }))
      await flushPromises()

      expect(snackSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('Pós-Logout')
      expect(selectWrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([
        created,
        makeCategory({ id: 16, name: 'Pós-Logout' }),
      ])
    })
  })

  describe('Edição / Renomeação (E14-01–E14-11)', () => {
    it('E14-01, E14-02 & E14-04 — preenche nome atual sem GET por ID e não envia PATCH se nome normalizado não mudou', async () => {
      setAdminSession()
      const cat1 = makeCategory({ id: 1, name: 'Acessórios' })
      const cat2 = makeCategory({ id: 2, name: 'Documentos' })
      const listSpy = vi.spyOn(categoryService, 'list').mockResolvedValueOnce([cat1, cat2])
      const updateSpy = vi.spyOn(categoryService, 'update')

      const { wrapper } = await mountView()
      await flushPromises()

      await getRowButton(wrapper, 'Documentos', 'Editar')!.trigger('click')
      await nextTick()

      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(getDialogNameValue()).toBe('Documentos')

      await setDialogName('  Documentos  ')
      findBodyButton('Salvar')!.click()
      await flushPromises()

      expect(updateSpy).not.toHaveBeenCalled()
      expect(document.body.querySelector('[data-test="category-name"]')).toBeNull()
    })

    it('E14-03 & E14-05 — PATCH correto com { name }, atualiza listagem e reflete no CategorySelect', async () => {
      setAdminSession()
      const cat = makeCategory({ id: 3, name: 'Celulares' })
      const renamed = makeCategory({ id: 3, name: 'Eletrônicos e Celulares' })
      vi.spyOn(categoryService, 'list')
        .mockResolvedValueOnce([cat])
        .mockResolvedValueOnce([cat])
        .mockResolvedValueOnce([renamed])
      const updateSpy = vi.spyOn(categoryService, 'update').mockResolvedValueOnce(renamed)

      const selectWrapper = mount(CategorySelect, {
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(selectWrapper)

      const { wrapper } = await mountView()
      await flushPromises()

      await getRowButton(wrapper, 'Celulares', 'Editar')!.trigger('click')
      await nextTick()
      await setDialogName('  Eletrônicos e Celulares  ')

      const saveBtn = findBodyButton('Salvar')!
      saveBtn.click()
      saveBtn.click()
      await flushPromises()

      expect(updateSpy).toHaveBeenCalledTimes(1)
      expect(updateSpy).toHaveBeenCalledWith(3, { name: 'Eletrônicos e Celulares' })
      expect(wrapper.text()).toContain('Eletrônicos e Celulares')
      expect(selectWrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([renamed])
    })

    it('E14-06, E14-07, E14-08 & E14-09 — trata 404, 409, 500 e DTO com ID incompatível sem substituir outra categoria', async () => {
      setAdminSession()
      const cat1 = makeCategory({ id: 1, name: 'Acessórios' })
      const cat2 = makeCategory({ id: 2, name: 'Documentos' })
      vi.spyOn(categoryService, 'list').mockResolvedValue([cat1, cat2])
      vi.spyOn(categoryService, 'update')
        .mockRejectedValueOnce(makeHttpError(409, 'Já existe categoria com esse nome.'))
        .mockRejectedValueOnce(makeHttpError(404, 'Não encontrada'))
        .mockRejectedValueOnce(makeHttpError(500, 'Erro interno'))
        .mockResolvedValueOnce(makeCategory({ id: 1, name: 'ID Divergente' }))

      const { wrapper } = await mountView()
      await flushPromises()

      await getRowButton(wrapper, 'Documentos', 'Editar')!.trigger('click')
      await nextTick()
      await setDialogName('Acessórios')

      // 409
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Já existe categoria com esse nome.')

      // 404
      await setDialogName('Documentos Renomeados')
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Esta categoria não existe mais no servidor')

      // 500
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Não foi possível confirmar')

      // ID incompatível (#1 retornado quando editava #2)
      findBodyButton('Salvar')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain('Resposta inválida ao atualizar a categoria')
      expect(wrapper.text()).toContain('Acessórios')
      expect(wrapper.text()).not.toContain('ID Divergente')
    })

    it('E14-10 & E14-11 — troca de sessão durante PATCH e troca de categoria no modal isolam estado e ignoram resposta antiga', async () => {
      const auth = setAdminSession({ id: 1, name: 'Admin A' }, 'token-a')
      const cat1 = makeCategory({ id: 1, name: 'Categoria 1' })
      const cat2 = makeCategory({ id: 2, name: 'Categoria 2' })
      vi.spyOn(categoryService, 'list').mockResolvedValue([cat1, cat2])

      let resolveOldPatch!: (val: Category) => void
      vi.spyOn(categoryService, 'update').mockImplementationOnce(
        () => new Promise<Category>((r) => { resolveOldPatch = r }),
      )

      const { wrapper } = await mountView()
      await flushPromises()

      await getRowButton(wrapper, 'Categoria 1', 'Editar')!.trigger('click')
      await nextTick()
      await setDialogName('Categoria 1 Editada')
      findBodyButton('Salvar')!.click()
      await nextTick()

      // Troca de sessão A -> B com PATCH pendente
      auth.token = 'token-b'
      auth.user = makeUser({ id: 2, name: 'Admin B' })
      auth.sessionGeneration += 1
      await flushPromises()

      // Modal não pode permanecer aberto nem carregar rascunho de A
      expect(document.body.querySelector('[data-test="category-name"]')).toBeNull()

      // B abre categoria 2 para editar
      await getRowButton(wrapper, 'Categoria 2', 'Editar')!.trigger('click')
      await nextTick()
      expect(getDialogNameValue()).toBe('Categoria 2')

      // PATCH antigo de A chega atrasado
      resolveOldPatch(makeCategory({ id: 1, name: 'Vazada de A' }))
      await flushPromises()

      expect(getDialogNameValue()).toBe('Categoria 2')
      expect(wrapper.text()).not.toContain('Vazada de A')
    })
  })

  describe('Exclusão Segura e Proteção do Diálogo (D14-01–D14-15)', () => {
    it('D14-01, D14-02, D14-03 & D14-04 — confirmação exigida, cancelar não chama DELETE e confirmar remove da listagem e do CategorySelect', async () => {
      setAdminSession()
      const cat = makeCategory({ id: 5, name: 'Chaves' })
      vi.spyOn(categoryService, 'list')
        .mockResolvedValueOnce([cat])
        .mockResolvedValueOnce([cat])
        .mockResolvedValueOnce([])
      const removeSpy = vi.spyOn(categoryService, 'remove').mockResolvedValueOnce(undefined)

      const selectWrapper = mount(CategorySelect, {
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(selectWrapper)

      const ui = useUiStore()
      const confirmSpy = vi
        .spyOn(ui, 'confirm')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      const { wrapper } = await mountView()
      await flushPromises()

      // Cancelamento
      await getRowButton(wrapper, 'Chaves', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(confirmSpy.mock.calls[0][0].message).toContain('Chaves')
      expect(removeSpy).not.toHaveBeenCalled()

      // Confirmação
      await getRowButton(wrapper, 'Chaves', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(5)
      expect(wrapper.text()).toContain('Nenhuma categoria cadastrada')
      expect(selectWrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([])
    })

    it('D14-05, D14-06, D14-07 & D14-08 — trata 409 por vínculos, 404, 500 e erro de rede sem exclusão otimista', async () => {
      setAdminSession()
      const linked = makeCategory({ id: 1, name: 'Eletrônicos' })
      const extra = makeCategory({ id: 2, name: 'Roupas' })
      vi.spyOn(categoryService, 'list').mockResolvedValue([linked, extra])
      const removeSpy = vi
        .spyOn(categoryService, 'remove')
        .mockRejectedValueOnce(makeHttpError(409, 'Categoria vinculada'))
        .mockRejectedValueOnce(makeHttpError(500, 'Erro servidor'))
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockRejectedValueOnce(makeHttpError(404, 'Não existe'))

      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      // 409 preserva item e informa vínculos
      await getRowButton(wrapper, 'Eletrônicos', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Eletrônicos')
      expect(wrapper.text()).toContain('itens encontrados ou relatos de perdas vinculados')

      // 500 oferece verificar estado atual
      await getRowButton(wrapper, 'Eletrônicos', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Não foi possível confirmar a exclusão')
      expect(findButton(wrapper, 'Verificar estado atual')).toBeDefined()

      // Rede
      await getRowButton(wrapper, 'Eletrônicos', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Não foi possível confirmar a exclusão')

      // 404 reconcilia
      await getRowButton(wrapper, 'Roupas', 'Excluir')!.trigger('click')
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledTimes(4)
    })

    it('D14-09 & D14-10 — duplo clique na mesma ou outra categoria com diálogo pendente não abre duas confirmações', async () => {
      setAdminSession()
      const cat1 = makeCategory({ id: 1, name: 'Acessórios' })
      const cat2 = makeCategory({ id: 2, name: 'Documentos' })
      vi.spyOn(categoryService, 'list').mockResolvedValueOnce([cat1, cat2])
      const removeSpy = vi.spyOn(categoryService, 'remove').mockResolvedValueOnce(undefined)

      const ui = useUiStore()
      let resolveConfirm!: (val: boolean) => void
      const confirmSpy = vi.spyOn(ui, 'confirm').mockImplementationOnce(
        () => new Promise<boolean>((r) => { resolveConfirm = r }),
      )

      const { wrapper } = await mountView()
      await flushPromises()

      await getRowButton(wrapper, 'Acessórios', 'Excluir')!.trigger('click')
      await getRowButton(wrapper, 'Acessórios', 'Excluir')!.trigger('click')
      await getRowButton(wrapper, 'Documentos', 'Excluir')!.trigger('click')
      await nextTick()

      expect(confirmSpy).toHaveBeenCalledTimes(1)

      resolveConfirm(true)
      await flushPromises()

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith(1)
    })

    it('D14-11, D14-12 & D14-13 — logout ou unmount fecha apenas confirmação própria, ignora resolver tardio e preserva diálogo alheio', async () => {
      const auth = setAdminSession()
      const cat = makeCategory({ id: 7, name: 'Bolsas' })
      vi.spyOn(categoryService, 'list').mockResolvedValue([cat])
      const removeSpy = vi.spyOn(categoryService, 'remove')

      const { wrapper } = await mountView()
      await flushPromises()

      const ui = useUiStore()
      await getRowButton(wrapper, 'Bolsas', 'Excluir')!.trigger('click')
      await nextTick()
      const staleResolver = ui.confirmDialog.resolve

      // Logout fecha diálogo próprio sem DELETE
      auth.logout()
      await nextTick()
      expect(ui.confirmDialog.show).toBe(false)
      staleResolver(true)
      await flushPromises()
      expect(removeSpy).not.toHaveBeenCalled()

      // Preserva diálogo alheio no unmount
      setAdminSession({ id: 2 }, 'token-2')
      await flushPromises()

      const foreignConfirm = ui.confirm({ title: 'Outro componente', message: 'Manter' })
      wrapper.unmount()
      await nextTick()

      expect(ui.confirmDialog.show).toBe(true)
      expect(ui.confirmDialog.title).toBe('Outro componente')
      ui.confirmDialog.resolve(false)
      await foreignConfirm
    })

    it('D14-14 & D14-15 — GET antigo após DELETE não restaura excluída e DELETE pós-troca de conta invalida catálogo sem vazar snackbar', async () => {
      const auth = setAdminSession({ id: 1 }, 'token-1')
      const cat1 = makeCategory({ id: 1, name: 'Removida' })
      const cat2 = makeCategory({ id: 2, name: 'Mantida' })

      let resolveStaleGet!: (val: Category[]) => void
      vi.spyOn(categoryService, 'list')
        .mockResolvedValueOnce([cat1, cat2])
        .mockImplementationOnce(() => new Promise<Category[]>((r) => { resolveStaleGet = r }))
        .mockResolvedValueOnce([cat2])
        .mockResolvedValueOnce([cat2])

      vi.spyOn(categoryService, 'remove').mockResolvedValueOnce(undefined)
      const ui = useUiStore()
      vi.spyOn(ui, 'confirm').mockResolvedValue(true)

      const { wrapper } = await mountView()
      await flushPromises()

      // Dispara GET lento antes do DELETE
      await findButton(wrapper, 'Atualizar')!.trigger('click')
      await nextTick()

      await getRowButton(wrapper, 'Removida', 'Excluir')!.trigger('click')
      await flushPromises()

      resolveStaleGet([cat1, cat2])
      await flushPromises()
      expect(wrapper.text()).not.toContain('Removida')
      expect(wrapper.text()).toContain('Mantida')

      // DELETE pendente durante troca de conta
      let resolveDeleteAfterSwitch!: () => void
      vi.spyOn(categoryService, 'remove').mockImplementationOnce(
        () => new Promise<void>((r) => { resolveDeleteAfterSwitch = r }),
      )
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      await getRowButton(wrapper, 'Mantida', 'Excluir')!.trigger('click')
      await nextTick()

      auth.token = 'token-2'
      auth.user = makeUser({ id: 2, name: 'Admin 2' })
      auth.sessionGeneration += 1
      await flushPromises()

      resolveDeleteAfterSwitch()
      await flushPromises()

      expect(snackSpy).not.toHaveBeenCalled()
    })
  })

  describe('Isolamento de Sessão, Desmontagem e Recuperação do Catálogo (X14-01–X14-08)', () => {
    it('X14-01, X14-02, X14-03, X14-04, X14-05, X14-06, X14-07 & X14-08 — rebaixamento, troca de sessão, unmount e loading owner', async () => {
      const auth = setAdminSession({ id: 1, role: 'ADMIN' }, 'tok-a')
      const initial = [makeCategory({ id: 1, name: 'Eletrônicos' })]
      const listSpy = vi
        .spyOn(categoryService, 'list')
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce([makeCategory({ id: 2, name: 'Documentos' })])
        .mockResolvedValueOnce([makeCategory({ id: 3, name: 'Chaves' })])

      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.text()).toContain('Eletrônicos')

      // X14-01: rebaixamento ADMIN -> USER limpa dados e fecha editor
      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      auth.user = makeUser({ id: 1, role: 'USER' })
      auth.sessionGeneration += 1
      await flushPromises()

      expect(wrapper.text()).not.toContain('Eletrônicos')
      expect(document.body.querySelector('[data-test="category-name"]')).toBeNull()

      // X14-02 & X14-03: retorno como ADMIN e depois nova sessionGeneration com mesma identidade
      auth.user = makeUser({ id: 1, role: 'ADMIN' })
      auth.sessionGeneration += 1
      await flushPromises()
      expect(wrapper.text()).toContain('Documentos')

      auth.sessionGeneration += 1
      await flushPromises()
      expect(wrapper.text()).toContain('Chaves')
      expect(listSpy).toHaveBeenCalledTimes(3)

      // X14-04, X14-05, X14-06 & X14-08: unmount durante POST mantém loading/snackbar limpos e catálogo recuperável
      let resolvePostAfterUnmount!: (val: Category) => void
      vi.spyOn(categoryService, 'create').mockImplementationOnce(
        () => new Promise<Category>((r) => { resolvePostAfterUnmount = r }),
      )
      vi.spyOn(categoryService, 'list').mockResolvedValueOnce([
        makeCategory({ id: 3, name: 'Chaves' }),
        makeCategory({ id: 4, name: 'Criada no Unmount' }),
      ])

      const ui = useUiStore()
      const snackSpy = vi.spyOn(ui, 'notifySuccess')

      await findButton(wrapper, 'Nova categoria')!.trigger('click')
      await nextTick()
      await setDialogName('Criada no Unmount')
      findBodyButton('Salvar')!.click()
      await nextTick()

      wrapper.unmount()
      resolvePostAfterUnmount(makeCategory({ id: 4, name: 'Criada no Unmount' }))
      await flushPromises()

      expect(snackSpy).not.toHaveBeenCalled()

      // Catálogo público consegue obter o novo estado sem precisar de admin autenticado
      auth.logout()
      const selectWrapper = mount(CategorySelect, {
        global: { plugins: [vuetify] },
      })
      mountedWrappers.push(selectWrapper)
      await flushPromises()

      expect(selectWrapper.findComponent({ name: 'VSelect' }).props('items')).toEqual([
        makeCategory({ id: 3, name: 'Chaves' }),
        makeCategory({ id: 4, name: 'Criada no Unmount' }),
      ])
    })
  })
})
