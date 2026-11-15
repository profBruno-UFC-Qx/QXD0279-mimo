import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ProfileView from '../ProfileView.vue'
import { vuetify } from '@/theme'
import { userService } from '@/services/user.service'
import { authService } from '@/services/auth.service'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import router from '@/router'
import type { User } from '@/types'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  name: 'Ana Beatriz',
  email: 'ana@ufc.br',
  phone: '(88) 99999-0000',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

function mountProfile() {
  return mount(ProfileView, {
    global: {
      plugins: [vuetify],
    },
  })
}

function getInputValues(wrapper: ReturnType<typeof mountProfile>): string[] {
  return wrapper.findAll('input').map((input) => (input.element as HTMLInputElement).value)
}

describe('ProfileView (S10 · RF10 — Leitura do Perfil)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('P01 — Abertura do perfil: recupera os dados reais do usuário autenticado via userService.me()', async () => {
    const meSpy = vi.spyOn(userService, 'me').mockResolvedValue(makeUser())

    mountProfile()
    await flushPromises()

    expect(meSpy).toHaveBeenCalledTimes(1)
  })

  it('P02 — Carregamento: exibe indicador de carregamento e não mostra conteúdo fictício nem dados antigos enquanto pendente', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Maria Souza', email: 'maria@exemplo.com' })

    let resolveMe!: (value: User) => void
    vi.spyOn(userService, 'me').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolveMe = resolve
        }),
    )

    const wrapper = mountProfile()
    await nextTick()

    expect(wrapper.find('.loading-overlay').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Maria Souza')
    expect(getInputValues(wrapper)).not.toContain('Maria Souza')

    resolveMe(makeUser({ name: 'Maria Oliveira' }))
    await flushPromises()

    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
  })

  it('P03 — Consulta bem-sucedida: exibe título Perfil, Nome, Telefone, E-mail (somente leitura) e Papel retornados pela API', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(
      makeUser({
        name: 'Ana Beatriz',
        phone: '(88) 99999-0000',
        email: 'ana@ufc.br',
        role: 'ADMIN',
      }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Perfil')
    expect(wrapper.text()).toContain('Nome')
    expect(wrapper.text()).toContain('Telefone')
    expect(wrapper.text()).toContain('E-mail (somente leitura)')
    expect(wrapper.text()).toContain('Papel')

    const values = getInputValues(wrapper)
    expect(values).toContain('Ana Beatriz')
    expect(values).toContain('(88) 99999-0000')
    expect(values).toContain('ana@ufc.br')
    expect(values).toContain('ADMIN')
  })

  it('P04 — Telefone nulo: exibe "Não informado" quando a API retorna phone: null', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(
      makeUser({
        name: 'Carlos Lima',
        email: 'carlos@ufc.br',
        phone: null,
      }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    const phoneInput = wrapper.find('input#profile-phone')
    expect(phoneInput.exists()).toBe(true)
    expect((phoneInput.element as HTMLInputElement).value).toBe('')
    expect(phoneInput.attributes('placeholder')).toBe('Não informado')
  })

  it('P05 — Atualização de dados: substitui nome antigo em memória pelo valor recente retornado pelo backend', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Maria Souza' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Maria Oliveira' }))

    const wrapper = mountProfile()
    await flushPromises()

    const values = getInputValues(wrapper)
    expect(values).toContain('Maria Oliveira')
    expect(values).not.toContain('Maria Souza')
    expect(wrapper.text()).not.toContain('Maria Souza')
    expect(auth.user?.name).toBe('Maria Oliveira')
  })

  it('P06 — Erro da API: em falha de rede ou HTTP 500 exibe alerta de erro, não mostra falso sucesso, não encerra sessão e permite tentar novamente', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Maria Souza' })
    localStorage.setItem('achadex.token', 'jwt-token')

    vi.spyOn(userService, 'me').mockRejectedValue(new Error('Request failed with status code 500'))

    const wrapper = mountProfile()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).toContain('Tentar novamente')
    expect(ui.snackbar.show).toBe(false)
    expect(auth.token).toBe('jwt-token')
    expect(auth.user?.name).toBe('Maria Souza')
  })

  it('P07 — Recuperação de erro: ao clicar em "Tentar novamente" realiza nova consulta, mostra carregamento, oculta erro e exibe dados', async () => {
    let resolveRetry!: (value: User) => void
    const meSpy = vi
      .spyOn(userService, 'me')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveRetry = resolve
          }),
      )

    const wrapper = mountProfile()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')

    const retryBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Tentar novamente'))
    expect(retryBtn).toBeDefined()
    await retryBtn!.trigger('click')
    await nextTick()

    expect(meSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.loading-overlay').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')

    resolveRetry(makeUser({ name: 'Ana Recuperada' }))
    await flushPromises()

    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados')
    expect(getInputValues(wrapper)).toContain('Ana Recuperada')
  })

  it('P08 — Sessão inválida: quando a API retorna 401 utiliza o tratamento centralizado de autenticação existente', async () => {
    const auth = useAuthStore()
    auth.token = 'expired-token'
    auth.user = makeUser()
    localStorage.setItem('achadex.token', 'expired-token')

    vi.spyOn(auth, 'fetchMe').mockResolvedValue()
    await router.push('/perfil')
    await router.isReady()

    const pushSpy = vi.spyOn(router, 'push')
    const originalAdapter = api.defaults.adapter
    api.defaults.adapter = async (config) => {
      const error = Object.assign(new Error('Request failed with status code 401'), {
        config,
        response: { status: 401, data: { success: false, message: 'Não autenticado' } },
      })
      throw error
    }

    try {
      mountProfile()
      await flushPromises()

      expect(auth.token).toBeNull()
      expect(auth.user).toBeNull()
      expect(pushSpy).toHaveBeenCalledWith({
        name: 'login',
        query: { redirect: '/perfil' },
      })
    } finally {
      api.defaults.adapter = originalAdapter
    }
  })

  it('P09 — Segurança: não exibe senhas, hashes ou tokens e mostra apenas os dados do usuário autenticado', async () => {
    const payloadWithSecrets = {
      ...makeUser({ name: 'Usuário Seguro', email: 'seguro@ufc.br' }),
      password: 'PlainPassword123!',
      passwordHash: 'scrypt:1111:2222',
      password_hash: 'scrypt:3333:4444',
      token: 'secret-jwt-token-999',
    } as unknown as User

    vi.spyOn(userService, 'me').mockResolvedValue(payloadWithSecrets)

    const wrapper = mountProfile()
    await flushPromises()

    const values = getInputValues(wrapper)
    expect(values).toContain('Usuário Seguro')
    expect(values).toContain('seguro@ufc.br')

    const fullOutput = wrapper.html() + ' ' + values.join(' ')
    expect(fullOutput).not.toContain('PlainPassword123!')
    expect(fullOutput).not.toContain('scrypt:1111:2222')
    expect(fullOutput).not.toContain('scrypt:3333:4444')
    expect(fullOutput).not.toContain('secret-jwt-token-999')
  })

  it('P10 — Requisições desnecessárias: atualizações reativas normais não disparam novas consultas sem motivo', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Nome Inicial Guard' })

    const meSpy = vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Nome Atualizado API' }))

    mountProfile()
    await flushPromises()

    expect(meSpy).toHaveBeenCalledTimes(1)

    ui.notifySuccess('Notificação externa')
    await nextTick()
    ui.dismissSnackbar()
    await nextTick()

    expect(meSpy).toHaveBeenCalledTimes(1)
  })

  it('P11 — Contrato de edição da Etapa 02: nome e telefone são editáveis, e-mail e papel continuam readonly, existe botão Salvar e não há campos de senha', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(makeUser())

    const wrapper = mountProfile()
    await flushPromises()

    const nameInput = wrapper.find('input#profile-name')
    const phoneInput = wrapper.find('input#profile-phone')
    const emailInput = wrapper.find('input#profile-email')
    const roleInput = wrapper.find('input#profile-role')

    expect(nameInput.attributes('readonly')).toBeUndefined()
    expect(phoneInput.attributes('readonly')).toBeUndefined()
    expect(emailInput.attributes('readonly')).toBeDefined()
    expect(roleInput.attributes('readonly')).toBeDefined()

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('type')).not.toBe('password')
    }

    const buttons = wrapper.findAll('button')
    expect(buttons.some((btn) => btn.text().includes('Salvar'))).toBe(true)
    expect(wrapper.text()).not.toContain('Alterar senha')
    expect(wrapper.text()).not.toContain('Nova senha')
  })
})

describe('ProfileView (Etapa 02 — Concorrência na leitura do perfil)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('R01 — Logout durante a leitura: resposta antiga não restaura usuário nem token após logout', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Ana A' })
    localStorage.setItem('achadex.token', 'token-a')

    let resolveMe!: (value: User) => void
    vi.spyOn(userService, 'me').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolveMe = resolve
        }),
    )

    const wrapper = mountProfile()
    await nextTick()

    auth.logout()
    await nextTick()

    resolveMe(makeUser({ id: 1, name: 'Ana A' }))
    await flushPromises()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(ui.snackbar.show).toBe(false)
    expect(wrapper.text()).not.toContain('Ana A')
    expect(getInputValues(wrapper)).not.toContain('Ana A')
  })

  it('R02 — Troca de conta durante a leitura: resposta da conta A não sobrescreve sessão da conta B', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })

    let resolveMe!: (value: User) => void
    vi.spyOn(userService, 'me').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolveMe = resolve
        }),
    )

    const wrapper = mountProfile()
    await nextTick()

    auth.token = 'token-b'
    auth.user = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    await nextTick()

    resolveMe(makeUser({ id: 1, name: 'Conta A Atualizada', email: 'a@ufc.br' }))
    await flushPromises()

    expect(auth.user?.id).toBe(2)
    expect(auth.user?.name).toBe('Conta B')
    expect(wrapper.text()).not.toContain('Conta A Atualizada')
    expect(getInputValues(wrapper)).not.toContain('Conta A Atualizada')
  })

  it('R03 — Respostas fora de ordem: resposta mais antiga não sobrescreve a mais recente', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Inicial' })

    let resolveOlder!: (value: User) => void
    let resolveNewer!: (value: User) => void
    const meSpy = vi
      .spyOn(userService, 'me')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveOlder = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveNewer = resolve
          }),
      )

    const wrapper = mountProfile()
    await flushPromises()

    const retryBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Tentar novamente'))
    expect(retryBtn).toBeDefined()

    await Promise.all([retryBtn!.trigger('click'), retryBtn!.trigger('click')])
    expect(meSpy).toHaveBeenCalledTimes(3)

    resolveNewer(makeUser({ id: 1, name: 'Versão Mais Recente' }))
    await flushPromises()

    resolveOlder(makeUser({ id: 1, name: 'Versão Antiga' }))
    await flushPromises()

    expect(auth.user?.name).toBe('Versão Mais Recente')
    expect(getInputValues(wrapper)).toContain('Versão Mais Recente')
    expect(getInputValues(wrapper)).not.toContain('Versão Antiga')
  })

  it('R04 — Desmontagem do componente: resposta tardia após unmount não altera estado compartilhado', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Estado Atual' })

    let resolveMe!: (value: User) => void
    vi.spyOn(userService, 'me').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolveMe = resolve
        }),
    )

    const wrapper = mountProfile()
    await nextTick()

    wrapper.unmount()

    resolveMe(makeUser({ id: 1, name: 'Resposta Tardia' }))
    await flushPromises()

    expect(auth.user?.name).toBe('Estado Atual')
    expect(ui.snackbar.show).toBe(false)
  })

  it('R05 — Falha de rede ou HTTP 500: exibe erro recuperável sem encerrar a sessão', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Sessão Ativa' })
    localStorage.setItem('achadex.token', 'token-a')

    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500, data: { success: false, message: 'Erro interno' } },
    })
    vi.spyOn(userService, 'me').mockRejectedValue(serverError)

    const wrapper = mountProfile()
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível carregar os dados')
    expect(wrapper.text()).toContain('Tentar novamente')
    expect(auth.token).toBe('token-a')
    expect(auth.user?.name).toBe('Sessão Ativa')
    expect(ui.snackbar.show).toBe(false)
  })
})

describe('ProfileView (Etapa 02 — Edição de nome e telefone com PATCH /users/me)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  function findSaveButton(wrapper: ReturnType<typeof mountProfile>) {
    return wrapper.findAll('button').find((btn) => btn.text().includes('Salvar'))
  }

  it('E01 — Formulário preenchido: exibe nome e telefone retornados pela API nos campos editáveis', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(
      makeUser({ name: 'Maria Souza', phone: '(11) 99999-1234' }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Maria Souza')
    expect((wrapper.find('input#profile-phone').element as HTMLInputElement).value).toBe(
      '(11) 99999-1234',
    )
  })

  it('E02 — Edição de nome: envia somente o nome alterado via userService.updateMe()', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockResolvedValue(makeUser({ name: 'Ana Silva', phone: '(88) 99999-0000' }))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('  Ana Silva  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ name: 'Ana Silva' })
  })

  it('E03 — Edição de telefone: envia somente o telefone alterado e preserva o nome', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 98888-7777' }))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-phone').setValue('(88) 98888-7777')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ phone: '(88) 98888-7777' })
    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Ana Beatriz')
  })

  it('E04 — Remover telefone: ao apagar o telefone envia { phone: null } e exibe "Não informado" após sucesso', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: null }))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-phone').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ phone: null })

    const phoneInput = wrapper.find('input#profile-phone')
    expect((phoneInput.element as HTMLInputElement).value).toBe('')
    expect(phoneInput.attributes('placeholder')).toBe('Não informado')
  })

  it('E05 — Formulário sem alterações: desabilita Salvar, não chama PATCH e não exibe snackbar', async () => {
    const ui = useUiStore()
    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    const updateSpy = vi.spyOn(userService, 'updateMe')

    const wrapper = mountProfile()
    await flushPromises()

    const saveBtn = findSaveButton(wrapper)
    expect(saveBtn).toBeDefined()
    expect(saveBtn!.attributes('disabled')).toBeDefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(ui.snackbar.show).toBe(false)
  })

  it('E06 — Nome inválido: rejeita nome menor que 3 ou maior que 150 caracteres após trim com mensagem clara', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const updateSpy = vi.spyOn(userService, 'updateMe')

    const wrapper = mountProfile()
    await flushPromises()

    const nameInput = wrapper.find('input#profile-name')
    await nameInput.setValue('  ab  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Nome deve possuir entre 3 e 150 caracteres.')

    await nameInput.setValue('a'.repeat(151))
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Nome deve possuir entre 3 e 150 caracteres.')
  })

  it('E07 — Telefone inválido: rejeita telefone fora do contrato do backend e aceita formato válido', async () => {
    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ phone: '(88) 99999-0000' }))
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockResolvedValue(makeUser({ phone: '+55 (11) 99999-1234' }))

    const wrapper = mountProfile()
    await flushPromises()

    const phoneInput = wrapper.find('input#profile-phone')
    await phoneInput.setValue('abc12345')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Telefone inválido.')

    await phoneInput.setValue('1234567')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).not.toHaveBeenCalled()

    await phoneInput.setValue('+55 (11) 99999-1234')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ phone: '+55 (11) 99999-1234' })
  })

  it('E08 — Sucesso: aplica resposta do backend, atualiza authStore, mostra snackbar e não refaz GET', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' })

    const meSpy = vi
      .spyOn(userService, 'me')
      .mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    vi.spyOn(userService, 'updateMe').mockResolvedValue(
      makeUser({ name: 'Ana Normalizada', phone: '(88) 98888-7777' }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Editada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Ana Normalizada')
    expect(auth.user?.name).toBe('Ana Normalizada')
    expect(auth.user?.phone).toBe('(88) 98888-7777')
    expect(ui.snackbar.show).toBe(true)
    expect(ui.snackbar.color).toBe('success')
    expect(ui.snackbar.message).toContain('Perfil atualizado')
    expect(meSpy).toHaveBeenCalledTimes(1)
  })

  it('E09 — Erro HTTP 400: exibe erro, preserva valores digitados, não altera authStore e não mostra snackbar', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const badRequest = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: { success: false, data: null, error: { code: 400, details: 'Telefone inválido.' } },
      },
    })
    vi.spyOn(userService, 'updateMe').mockRejectedValue(badRequest)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Tentativa')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Telefone inválido.')
    expect(auth.user?.name).toBe('Ana Beatriz')
    expect(ui.snackbar.show).toBe(false)
    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Ana Tentativa')
  })

  it('E10 — Erro HTTP 500 ou rede: não faz logout, preserva formulário e permite tentar novamente', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })
    localStorage.setItem('achadex.token', 'jwt-token')

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: {
        status: 500,
        data: { success: false, data: null, error: { code: 500, details: 'Erro interno' } },
      },
    })
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(makeUser({ name: 'Ana Persistida' }))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Persistida')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.token).toBe('jwt-token')
    expect(auth.user?.name).toBe('Ana Beatriz')
    expect(ui.snackbar.show).toBe(false)
    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Ana Persistida')
    expect(wrapper.text()).toContain('Não foi possível')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(auth.user?.name).toBe('Ana Persistida')
    expect(ui.snackbar.show).toBe(true)
  })

  it('E11 — Duplo clique em Salvar: impede submissões simultâneas e desabilita botão durante envio', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    let resolvePatch!: (value: User) => void
    const updateSpy = vi.spyOn(userService, 'updateMe').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolvePatch = resolve
        }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Nova')

    await Promise.all([
      wrapper.find('form').trigger('submit'),
      wrapper.find('form').trigger('submit'),
    ])

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(findSaveButton(wrapper)!.attributes('disabled')).toBeDefined()

    resolvePatch(makeUser({ name: 'Ana Nova' }))
    await flushPromises()

    expect(auth.user?.name).toBe('Ana Nova')
  })

  it('E12 — Logout durante o PATCH: resposta tardia não restaura usuário nem mostra snackbar', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Ana Beatriz' })
    localStorage.setItem('achadex.token', 'token-a')

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ id: 1, name: 'Ana Beatriz' }))
    let resolvePatch!: (value: User) => void
    vi.spyOn(userService, 'updateMe').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolvePatch = resolve
        }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Alterada')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await nextTick()

    resolvePatch(makeUser({ id: 1, name: 'Ana Alterada' }))
    await flushPromises()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(ui.snackbar.show).toBe(false)
  })

  it('E13 — Troca de conta durante o PATCH: resposta da conta A não sobrescreve conta B', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' }))
    let resolvePatch!: (value: User) => void
    vi.spyOn(userService, 'updateMe').mockImplementation(
      () =>
        new Promise<User>((resolve) => {
          resolvePatch = resolve
        }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Conta A Editada')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.token = 'token-b'
    auth.user = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    await nextTick()

    resolvePatch(makeUser({ id: 1, name: 'Conta A Editada', email: 'a@ufc.br' }))
    await flushPromises()

    expect(auth.user?.id).toBe(2)
    expect(auth.user?.name).toBe('Conta B')
    expect(ui.snackbar.show).toBe(false)
  })

  it('E14 — Resposta GET antiga após atualização: leitura obsoleta não sobrescreve dados confirmados pelo PATCH', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    auth.user = makeUser({ id: 1, name: 'Nome Antigo' })

    let resolveStaleGet!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveStaleGet = resolve
          }),
      )
      .mockResolvedValueOnce(makeUser({ id: 1, name: 'Nome Antigo' }))

    vi.spyOn(userService, 'updateMe').mockResolvedValue(makeUser({ id: 1, name: 'Nome Confirmado PATCH' }))

    const wrapper1 = mountProfile()
    await nextTick()
    wrapper1.unmount()

    const wrapper2 = mountProfile()
    await flushPromises()

    await wrapper2.find('input#profile-name').setValue('Nome Confirmado PATCH')
    await wrapper2.find('form').trigger('submit')
    await flushPromises()

    expect(auth.user?.name).toBe('Nome Confirmado PATCH')

    resolveStaleGet(makeUser({ id: 1, name: 'Nome Antigo' }))
    await flushPromises()

    expect(auth.user?.name).toBe('Nome Confirmado PATCH')
    expect((wrapper2.find('input#profile-name').element as HTMLInputElement).value).toBe(
      'Nome Confirmado PATCH',
    )
  })

  it('E15 — Segurança e permissões: PATCH nunca envia role, email ou password e mantém campos bloqueados', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', email: 'ana@ufc.br', role: 'USER' })

    vi.spyOn(userService, 'me').mockResolvedValue(
      makeUser({ name: 'Ana Beatriz', email: 'ana@ufc.br', role: 'USER' }),
    )
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockResolvedValue(makeUser({ name: 'Ana Segura', email: 'ana@ufc.br', role: 'USER' }))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Segura')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const sentPayload = updateSpy.mock.calls[0][0] as Record<string, unknown>
    expect(sentPayload).toEqual({ name: 'Ana Segura' })
    expect(sentPayload).not.toHaveProperty('email')
    expect(sentPayload).not.toHaveProperty('role')
    expect(sentPayload).not.toHaveProperty('password')
    expect(wrapper.find('input#profile-email').attributes('readonly')).toBeDefined()
    expect(wrapper.find('input#profile-role').attributes('readonly')).toBeDefined()
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('E16 — Sincronização de estado: componentes consumidores do authStore recebem os novos dados reativamente', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Inicial' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Inicial' }))
    vi.spyOn(userService, 'updateMe').mockResolvedValue(makeUser({ name: 'Ana Sincronizada' }))

    const wrapper = mountProfile()
    await flushPromises()

    const Consumer = {
      template: '<span data-test="header-name">{{ auth.user?.name }}</span>',
      setup() {
        return { auth: useAuthStore() }
      },
    }
    const consumerWrapper = mount(Consumer)
    expect(consumerWrapper.find('[data-test="header-name"]').text()).toBe('Ana Inicial')

    await wrapper.find('input#profile-name').setValue('Ana Sincronizada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(consumerWrapper.find('[data-test="header-name"]').text()).toBe('Ana Sincronizada')
  })
})

describe('ProfileView (Etapa 02.1 — Contrato real de erros HTTP)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('H01 — HTTP 400 com error.details: exibe exatamente error.details, preserva inputs e não altera authStore', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz', phone: '(88) 99999-0000' }))
    const badRequest = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          success: false,
          data: null,
          error: {
            code: 400,
            details: 'Telefone inválido.',
          },
        },
      },
    })
    vi.spyOn(userService, 'updateMe').mockRejectedValue(badRequest)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Editada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Telefone inválido.')
    expect((wrapper.find('input#profile-name').element as HTMLInputElement).value).toBe('Ana Editada')
    expect(auth.user?.name).toBe('Ana Beatriz')
    expect(ui.snackbar.show).toBe(false)
  })

  it('H02 — HTTP 409 com error.details: exibe a descrição retornada pelo backend', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const conflictError = Object.assign(new Error('Request failed with status code 409'), {
      response: {
        status: 409,
        data: {
          success: false,
          data: null,
          error: {
            code: 409,
            details: 'Conflito ao atualizar os dados do usuário.',
          },
        },
      },
    })
    vi.spyOn(userService, 'updateMe').mockRejectedValue(conflictError)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Conflito')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Conflito ao atualizar os dados do usuário.')
  })

  it('H03 — HTTP 500: não expõe detalhes internos e exibe fallback genérico', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: {
        status: 500,
        data: {
          success: false,
          data: null,
          error: {
            code: 500,
            details: 'SQLITE_ERROR: syntax error at line 1; stack trace secret',
          },
        },
      },
    })
    vi.spyOn(userService, 'updateMe').mockRejectedValue(serverError)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Erro 500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const alertText = wrapper.find('[role="alert"]').text()
    expect(alertText).toContain('Não foi possível atualizar o perfil. Tente novamente.')
    expect(alertText).not.toContain('SQLITE_ERROR')
    expect(alertText).not.toContain('stack trace')
  })

  it('H04 — Erro de rede: sem response, usa fallback genérico e mantém sessão ativa', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })
    localStorage.setItem('achadex.token', 'jwt-token')

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    vi.spyOn(userService, 'updateMe').mockRejectedValue(new Error('Network Error'))

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Sem Rede')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'Não foi possível atualizar o perfil. Tente novamente.',
    )
    expect(auth.token).toBe('jwt-token')
    expect(auth.user?.name).toBe('Ana Beatriz')
  })

  it('H05 — Payload inválido: error.details ausente, vazio ou não-string usa fallback sem exceções', async () => {
    const auth = useAuthStore()
    auth.token = 'jwt-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })

    vi.spyOn(userService, 'me').mockResolvedValue(makeUser({ name: 'Ana Beatriz' }))
    const malformedPayloads = [
      { response: { status: 400, data: { success: false, data: null, error: null } } },
      { response: { status: 400, data: { success: false, data: null, error: { code: 400, details: '   ' } } } },
      { response: { status: 400, data: { success: false, data: null, error: { code: 400, details: 12345 } } } },
      { response: { status: 422, data: 'invalid-body' } },
    ]

    const updateSpy = vi.spyOn(userService, 'updateMe')
    for (const payload of malformedPayloads) {
      updateSpy.mockRejectedValueOnce(Object.assign(new Error('Bad Request'), payload))
    }

    const wrapper = mountProfile()
    await flushPromises()

    for (let i = 0; i < malformedPayloads.length; i++) {
      await wrapper.find('input#profile-name').setValue(`Ana Caso ${i}`)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('[role="alert"]').text()).toContain(
        'Não foi possível atualizar o perfil. Tente novamente.',
      )
    }
  })

  it('H06 — HTTP 401 no PATCH: preserva tratamento centralizado de autenticação existente', async () => {
    const auth = useAuthStore()
    auth.token = 'expired-token'
    auth.user = makeUser({ name: 'Ana Beatriz' })
    localStorage.setItem('achadex.token', 'expired-token')

    vi.spyOn(auth, 'fetchMe').mockResolvedValue()
    await router.push('/perfil')
    await router.isReady()

    const pushSpy = vi.spyOn(router, 'push')
    vi.spyOn(userService, 'me').mockResolvedValueOnce(makeUser({ name: 'Ana Beatriz' }))

    const wrapper = mountProfile()
    await flushPromises()

    const originalAdapter = api.defaults.adapter
    api.defaults.adapter = async (config) => {
      throw Object.assign(new Error('Request failed with status code 401'), {
        config,
        response: {
          status: 401,
          data: { success: false, data: null, error: { code: 401, details: 'Não autenticado' } },
        },
      })
    }

    try {
      await wrapper.find('input#profile-name').setValue('Ana Expirada')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(auth.token).toBeNull()
      expect(auth.user).toBeNull()
      expect(pushSpy).toHaveBeenCalledWith({
        name: 'login',
        query: { redirect: '/perfil' },
      })
    } finally {
      api.defaults.adapter = originalAdapter
    }
  })
})

describe('ProfileView (Etapa 02.2 — Geração de sessão)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('G01 — GET com JWT reutilizado: resposta da geração anterior não sobrescreve sessão nova', async () => {
    const auth = useAuthStore()
    const sameJwt = 'reused-jwt-token'
    const session1User = makeUser({ id: 1, name: 'Ana Sessão 1' })
    const session2User = makeUser({ id: 1, name: 'Ana Sessão 2' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: session1User })
      .mockResolvedValueOnce({ token: sameJwt, user: session2User })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    let resolveOldGet!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveOldGet = resolve
          }),
      )
      .mockResolvedValueOnce(session2User)

    const wrapper = mountProfile()
    await nextTick()

    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await nextTick()

    resolveOldGet(makeUser({ id: 1, name: 'Ana Tardia Sessão 1' }))
    await flushPromises()

    expect(auth.token).toBe(sameJwt)
    expect(auth.user).toEqual(session2User)
    expect(wrapper.text()).not.toContain('Ana Tardia Sessão 1')
    expect(getInputValues(wrapper)).not.toContain('Ana Tardia Sessão 1')
    expect(wrapper.text()).not.toContain('Carregando perfil...')
  })

  it('G02 — PATCH com JWT reutilizado: sucesso antigo não atualiza store nem exibe snackbar', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    const sameJwt = 'reused-jwt-patch'
    const session1User = makeUser({ id: 1, name: 'Ana Sessão 1' })
    const session2User = makeUser({ id: 1, name: 'Ana Sessão 2' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: session1User })
      .mockResolvedValueOnce({ token: sameJwt, user: session2User })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me').mockResolvedValueOnce(session1User).mockResolvedValueOnce(session2User)

    let resolveOldPatch!: (value: User) => void
    vi.spyOn(userService, 'updateMe').mockImplementationOnce(
      () =>
        new Promise<User>((resolve) => {
          resolveOldPatch = resolve
        }),
    )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Edição Antiga')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await nextTick()

    resolveOldPatch(makeUser({ id: 1, name: 'Ana Edição Antiga' }))
    await flushPromises()

    expect(auth.user).toEqual(session2User)
    expect(ui.snackbar.show).toBe(false)
    const saveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Salvar'))
    expect(saveButton?.attributes('aria-busy')).not.toBe('true')
  })

  it('G03 — GET antigo após nova autenticação direta: mudança de geração bloqueia resposta mesmo sem mudar token ou userId', async () => {
    const auth = useAuthStore()
    const sameJwt = 'same-jwt-reauth'
    const initialUser = makeUser({ id: 1, name: 'Ana Inicial' })
    const reauthUser = makeUser({ id: 1, name: 'Ana Reautenticada' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: initialUser })
      .mockResolvedValueOnce({ token: sameJwt, user: reauthUser })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    let resolveOldGet!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveOldGet = resolve
          }),
      )
      .mockResolvedValueOnce(reauthUser)

    const wrapper = mountProfile()
    await nextTick()

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await nextTick()

    resolveOldGet(makeUser({ id: 1, name: 'Ana Antiga Sobrescrevendo' }))
    await flushPromises()

    expect(auth.user).toEqual(reauthUser)
    expect(getInputValues(wrapper)).not.toContain('Ana Antiga Sobrescrevendo')
  })

  it('G04 — Falha antiga após nova autenticação não exibe erro na sessão nova', async () => {
    const auth = useAuthStore()
    const sameJwt = 'reused-jwt-error'
    const session1User = makeUser({ id: 1, name: 'Ana Sessão 1' })
    const session2User = makeUser({ id: 1, name: 'Ana Sessão 2' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: session1User })
      .mockResolvedValueOnce({ token: sameJwt, user: session2User })
      .mockResolvedValueOnce({ token: sameJwt, user: session2User })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    // Falha antiga no GET após nova autenticação
    let rejectOldGet!: (reason?: unknown) => void
    const meSpy = vi
      .spyOn(userService, 'me')
      .mockImplementationOnce(
        () =>
          new Promise<User>((_, reject) => {
            rejectOldGet = reject
          }),
      )
      .mockResolvedValueOnce(session2User)
      .mockResolvedValueOnce(session1User)
      .mockResolvedValueOnce(session2User)

    const wrapperGet = mountProfile()
    await nextTick()

    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await nextTick()

    rejectOldGet(new Error('Falha antiga no GET'))
    await flushPromises()

    expect(wrapperGet.text()).not.toContain('Não foi possível carregar os dados do perfil.')
    wrapperGet.unmount()

    // Falha antiga no PATCH após nova autenticação
    let rejectOldPatch!: (reason?: unknown) => void
    vi.spyOn(userService, 'updateMe').mockImplementationOnce(
      () =>
        new Promise<User>((_, reject) => {
          rejectOldPatch = reject
        }),
    )

    const wrapperPatch = mountProfile()
    await flushPromises()

    await wrapperPatch.find('input#profile-name').setValue('Ana Falha Antiga')
    await wrapperPatch.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await flushPromises()

    rejectOldPatch(
      Object.assign(new Error('Bad Request'), {
        response: {
          status: 400,
          data: { success: false, data: null, error: { code: 400, details: 'Erro da geração anterior' } },
        },
      }),
    )
    await flushPromises()

    expect(meSpy).toHaveBeenCalledTimes(4)
    expect(wrapperPatch.text()).not.toContain('Erro da geração anterior')
    expect(wrapperPatch.find('[role="alert"]').exists()).toBe(false)
  })

  it('G05 — GET e PATCH normais continuam carregando, salvando e sincronizando quando geração não muda', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    const initialUser = makeUser({ id: 1, name: 'Ana Normal', phone: '(88) 98888-1111' })
    const updatedUser = makeUser({ id: 1, name: 'Ana Salva', phone: '(88) 97777-2222' })

    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      token: 'jwt-normal',
      user: initialUser,
    })
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    vi.spyOn(userService, 'me').mockResolvedValueOnce(initialUser)
    const updateSpy = vi.spyOn(userService, 'updateMe').mockResolvedValueOnce(updatedUser)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Ana Salva')
    await wrapper.find('input#profile-phone').setValue('(88) 97777-2222')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith({ name: 'Ana Salva', phone: '(88) 97777-2222' })
    expect(auth.user).toEqual(updatedUser)
    expect(ui.snackbar.show).toBe(true)
    expect(ui.snackbar.message).toBe('Perfil atualizado com sucesso.')
  })

  it('G06 — Regressão de concorrência: mudança de sessão não deixa loading ou saving bloqueados e mantém proteções', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    const sameJwt = 'reused-jwt-regressao'
    const session1User = makeUser({ id: 1, name: 'Ana Sessão 1' })
    const session2User = makeUser({ id: 1, name: 'Ana Sessão 2' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: session1User })
      .mockResolvedValueOnce({ token: sameJwt, user: session2User })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me').mockResolvedValueOnce(session1User).mockResolvedValueOnce(session2User)

    let resolveOldPatch!: (value: User) => void
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveOldPatch = resolve
          }),
      )
      .mockResolvedValueOnce(makeUser({ id: 1, name: 'Ana Nova Sessão 2' }))

    const wrapper = mountProfile()
    await flushPromises()

    // Dispara PATCH na sessão 1 (permanece pendente)
    await wrapper.find('input#profile-name').setValue('Ana Pendente Sessão 1')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    // Sessão muda com mesmo JWT enquanto PATCH 1 ainda está em aberto e recarrega a sessão 2
    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await flushPromises()

    // Nova sessão não pode ficar bloqueada por saving=true da geração anterior
    await wrapper.find('input#profile-name').setValue('Ana Nova Sessão 2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(auth.user?.name).toBe('Ana Nova Sessão 2')
    expect(ui.snackbar.show).toBe(true)

    // Resposta antiga finalmente chega depois da atualização da sessão 2
    ui.dismissSnackbar()
    resolveOldPatch(makeUser({ id: 1, name: 'Ana Pendente Sessão 1' }))
    await flushPromises()

    expect(auth.user?.name).toBe('Ana Nova Sessão 2')
    expect(ui.snackbar.show).toBe(false)
  })
})

describe('ProfileView (Etapa 02.3 — Isolamento completo entre sessões)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('S01 — Logout limpa o formulário, oculta dados privados, bloqueia salvamento e não dispara GET sem sessão', async () => {
    const auth = useAuthStore()
    const userA = makeUser({
      id: 1,
      name: 'Ana Conta A',
      email: 'ana.a@ufc.br',
      phone: '(88) 91111-2222',
      role: 'USER',
    })

    vi.spyOn(authService, 'login').mockResolvedValueOnce({ token: 'token-a', user: userA })
    await auth.login({ email: 'ana.a@ufc.br', password: 'secret' })

    const meSpy = vi.spyOn(userService, 'me').mockResolvedValueOnce(userA)
    const updateSpy = vi.spyOn(userService, 'updateMe')

    const wrapper = mountProfile()
    await flushPromises()

    expect(getInputValues(wrapper)).toContain('Ana Conta A')
    expect(getInputValues(wrapper)).toContain('ana.a@ufc.br')

    await wrapper.find('input#profile-name').setValue('Rascunho A')
    await nextTick()

    auth.logout()
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('input#profile-name').exists()).toBe(false)
    expect(wrapper.findAll('button').some((btn) => btn.text().includes('Salvar'))).toBe(false)
    expect(wrapper.text()).not.toContain('Ana Conta A')
    expect(wrapper.text()).not.toContain('ana.a@ufc.br')
    expect(wrapper.text()).not.toContain('(88) 91111-2222')
    expect(wrapper.text()).not.toContain('Rascunho A')
    expect(updateSpy).not.toHaveBeenCalled()
    expect(meSpy).toHaveBeenCalledTimes(1)
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('S02 — Troca de conta limpa os dados da conta A imediatamente antes da recuperação de B', async () => {
    const auth = useAuthStore()
    const userA = makeUser({
      id: 1,
      name: 'Maria Igual',
      email: 'maria.a@ufc.br',
      phone: '(88) 91111-0000',
    })
    const userB = makeUser({
      id: 2,
      name: 'Maria Igual',
      email: 'maria.b@ufc.br',
      phone: '(88) 92222-0000',
    })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'maria.a@ufc.br', password: 'secret' })

    let resolveGetB!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockResolvedValueOnce(userA)
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveGetB = resolve
          }),
      )

    const wrapper = mountProfile()
    await flushPromises()
    expect(getInputValues(wrapper)).toContain('maria.a@ufc.br')

    await auth.login({ email: 'maria.b@ufc.br', password: 'secret' })
    await nextTick()

    // Enquanto B ainda não respondeu, nenhum dado ou formulário de A pode permanecer disponível
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('input#profile-name').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('maria.a@ufc.br')
    expect(wrapper.text()).not.toContain('(88) 91111-0000')
    expect(wrapper.findAll('button').some((btn) => btn.text().includes('Salvar'))).toBe(false)

    resolveGetB?.(userB)
    await flushPromises()
  })

  it('S03 — Nova sessão carrega seu próprio perfil uma única vez e ignora resposta antiga de A', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br', phone: '(88) 95555-6666' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: 'secret' })

    let resolveGetA!: (value: User) => void
    let resolveGetB!: (value: User) => void
    const meSpy = vi
      .spyOn(userService, 'me')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveGetA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveGetB = resolve
          }),
      )

    const wrapper = mountProfile()
    await nextTick()

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await nextTick()

    expect(meSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Carregando perfil...')

    resolveGetA(makeUser({ id: 1, name: 'Conta A Tardia', email: 'a@ufc.br' }))
    await flushPromises()
    expect(auth.user?.id).toBe(2)
    expect(wrapper.text()).not.toContain('Conta A Tardia')

    resolveGetB(userB)
    await flushPromises()

    expect(meSpy).toHaveBeenCalledTimes(2)
    expect(auth.user).toEqual(userB)
    expect(getInputValues(wrapper)).toContain('Conta B')
    expect(getInputValues(wrapper)).toContain('b@ufc.br')
    expect(getInputValues(wrapper)).toContain('(88) 95555-6666')
  })

  it('S04 — Mesmo JWT e mesmo usuário: nova geração descarta rascunho, recarrega GET e ignora resposta obsoleta', async () => {
    const auth = useAuthStore()
    const sameJwt = 'same-jwt-same-user'
    const gen1User = makeUser({ id: 1, name: 'Ana Gen 1', phone: '(88) 91111-1111' })
    const gen2User = makeUser({ id: 1, name: 'Ana Gen 2', phone: '(88) 93333-4444' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: sameJwt, user: gen1User })
      .mockResolvedValueOnce({ token: sameJwt, user: gen2User })

    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    let resolveGet2!: (value: User) => void
    const meSpy = vi
      .spyOn(userService, 'me')
      .mockResolvedValueOnce(gen1User)
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveGet2 = resolve
          }),
      )

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Rascunho Gen 1')
    await nextTick()

    auth.logout()
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })
    await nextTick()

    expect(meSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(false)

    resolveGet2(gen2User)
    await flushPromises()

    expect(auth.user).toEqual(gen2User)
    expect(getInputValues(wrapper)).toContain('Ana Gen 2')
    expect(getInputValues(wrapper)).toContain('(88) 93333-4444')
    expect(getInputValues(wrapper)).not.toContain('Rascunho Gen 1')
    expect(getInputValues(wrapper)).not.toContain('Ana Gen 1')
  })

  it('S05 — PATCH pendente durante troca de sessão não vaza para conta B e permite B editar normalmente', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    const userBUpdated = makeUser({ id: 2, name: 'Conta B Editada', email: 'b@ufc.br' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me').mockResolvedValueOnce(userA).mockResolvedValueOnce(userB)

    let resolvePatchA!: (value: User) => void
    const updateSpy = vi
      .spyOn(userService, 'updateMe')
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolvePatchA = resolve
          }),
      )
      .mockResolvedValueOnce(userBUpdated)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Nome Alterado A')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await flushPromises()

    resolvePatchA(makeUser({ id: 1, name: 'Nome Alterado A', email: 'a@ufc.br' }))
    await flushPromises()

    expect(auth.user).toEqual(userB)
    expect(getInputValues(wrapper)).toContain('Conta B')
    expect(getInputValues(wrapper)).not.toContain('Nome Alterado A')
    expect(ui.snackbar.show).toBe(false)

    await wrapper.find('input#profile-name').setValue('Conta B Editada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenNthCalledWith(2, { name: 'Conta B Editada' })
    expect(auth.user).toEqual(userBUpdated)
    expect(ui.snackbar.show).toBe(true)
  })

  it('S06 — Rascunho não salvo de A não migra para B e não contamina o PATCH de B', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br', phone: '(88) 91111-1111' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br', phone: '(88) 92222-2222' })
    const userBUpdated = makeUser({
      id: 2,
      name: 'Conta B Limpa',
      email: 'b@ufc.br',
      phone: '(88) 92222-2222',
    })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me').mockResolvedValueOnce(userA).mockResolvedValueOnce(userB)
    const updateSpy = vi.spyOn(userService, 'updateMe').mockResolvedValueOnce(userBUpdated)

    const wrapper = mountProfile()
    await flushPromises()

    await wrapper.find('input#profile-name').setValue('Rascunho Secreto A')
    await wrapper.find('input#profile-phone').setValue('(88) 90000-0001')

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await flushPromises()

    expect(getInputValues(wrapper)).toContain('Conta B')
    expect(getInputValues(wrapper)).toContain('(88) 92222-2222')
    expect(getInputValues(wrapper)).not.toContain('Rascunho Secreto A')
    expect(getInputValues(wrapper)).not.toContain('(88) 90000-0001')

    await wrapper.find('input#profile-name').setValue('Conta B Limpa')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ name: 'Conta B Limpa' })
  })

  it('S07 — Erros antigos (GET, saveError e validação) desaparecem após troca de sessão', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    // Parte 1: erro de carregamento em A desaparece ao trocar para B
    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    let resolveGetB!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockRejectedValueOnce(new Error('Falha GET A'))
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveGetB = resolve
          }),
      )

    const wrapper1 = mountProfile()
    await flushPromises()
    expect(wrapper1.text()).toContain('Não foi possível carregar os dados do perfil.')

    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await nextTick()
    expect(wrapper1.text()).not.toContain('Não foi possível carregar os dados do perfil.')
    resolveGetB!(userB)
    await flushPromises()
    wrapper1.unmount()

    // Parte 2: saveError e erro de validação de A desaparecem ao trocar para B
    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me').mockResolvedValueOnce(userA).mockResolvedValueOnce(userB)
    vi.spyOn(userService, 'updateMe').mockRejectedValueOnce(
      Object.assign(new Error('Bad Request'), {
        response: {
          status: 400,
          data: { success: false, data: null, error: { code: 400, details: 'Telefone inválido.' } },
        },
      }),
    )

    const wrapper2 = mountProfile()
    await flushPromises()

    await wrapper2.find('input#profile-name').setValue('ab')
    await wrapper2.find('form').trigger('submit')
    await nextTick()
    expect(wrapper2.text()).toContain('Nome deve possuir entre 3 e 150 caracteres.')

    await wrapper2.find('input#profile-name').setValue('Conta A Válida')
    await wrapper2.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper2.find('[role="alert"]').text()).toContain('Telefone inválido.')

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await flushPromises()

    expect(wrapper2.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper2.text()).not.toContain('Telefone inválido.')
    expect(wrapper2.text()).not.toContain('Nome deve possuir entre 3 e 150 caracteres.')
  })

  it('S08 — Falha ao carregar nova sessão B exibe erro recuperável, não exibe A nem store silencioso e preserva sessão B', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B Store', email: 'b@ufc.br' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    vi.spyOn(userService, 'me')
      .mockResolvedValueOnce(userA)
      .mockRejectedValueOnce(
        Object.assign(new Error('Server Error'), {
          response: {
            status: 500,
            data: { success: false, data: null, error: { code: 500, details: 'Erro interno' } },
          },
        }),
      )
      .mockResolvedValueOnce(userB)

    const wrapper = mountProfile()
    await flushPromises()

    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Conta A')
    expect(wrapper.text()).not.toContain('a@ufc.br')
    expect(wrapper.text()).not.toContain('Conta B Store')
    expect(wrapper.text()).toContain('Não foi possível carregar os dados do perfil.')
    expect(auth.token).toBe('token-b')
    expect(auth.user).toEqual(userB)

    const retryBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Tentar novamente'))
    expect(retryBtn).toBeDefined()
    await retryBtn!.trigger('click')
    await flushPromises()

    expect(getInputValues(wrapper)).toContain('Conta B Store')
    expect(getInputValues(wrapper)).toContain('b@ufc.br')
  })

  it('S09 — Logout sem novo login não realiza GET /users/me e mantém view sem dados privados', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Ana Privada', email: 'privada@ufc.br', phone: '(88) 99999-1111' })

    vi.spyOn(authService, 'login').mockResolvedValueOnce({ token: 'token-a', user: userA })
    await auth.login({ email: 'privada@ufc.br', password: 'secret' })

    const meSpy = vi.spyOn(userService, 'me').mockResolvedValueOnce(userA)

    const wrapper = mountProfile()
    await flushPromises()

    auth.logout()
    await flushPromises()

    expect(meSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Ana Privada')
    expect(wrapper.text()).not.toContain('privada@ufc.br')
    expect(wrapper.text()).not.toContain('(88) 99999-1111')
  })

  it('S10 — Requisições e gerações fora de ordem: apenas sessão C aplica dados após A, B e C', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    const userC = makeUser({ id: 3, name: 'Conta C', email: 'c@ufc.br', phone: '(88) 93333-3333' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })
      .mockResolvedValueOnce({ token: 'token-c', user: userC })

    let resolveA!: (value: User) => void
    let resolveB!: (value: User) => void
    let resolveC!: (value: User) => void
    vi.spyOn(userService, 'me')
      .mockImplementationOnce(() => new Promise<User>((r) => (resolveA = r)))
      .mockImplementationOnce(() => new Promise<User>((r) => (resolveB = r)))
      .mockImplementationOnce(() => new Promise<User>((r) => (resolveC = r)))

    await auth.login({ email: 'a@ufc.br', password: 'secret' })
    const wrapper = mountProfile()
    await nextTick()

    auth.logout()
    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await nextTick()

    auth.logout()
    await auth.login({ email: 'c@ufc.br', password: 'secret' })
    await nextTick()

    resolveB(userB)
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(auth.user).toEqual(userC)

    resolveA(userA)
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(auth.user).toEqual(userC)

    resolveC(userC)
    await flushPromises()

    expect(auth.user).toEqual(userC)
    expect(getInputValues(wrapper)).toContain('Conta C')
    expect(getInputValues(wrapper)).toContain('c@ufc.br')
    expect(wrapper.text()).not.toContain('Conta A')
    expect(wrapper.text()).not.toContain('Conta B')
  })

  it('S11 — Ordem de atualização do authStore.login(): novo GET só captura sessão após token e user atualizados', async () => {
    const auth = useAuthStore()
    const userA = makeUser({ id: 1, name: 'Conta A', email: 'a@ufc.br' })
    const userB = makeUser({ id: 2, name: 'Conta B', email: 'b@ufc.br' })
    const userBApi = makeUser({ id: 2, name: 'Conta B API', email: 'b@ufc.br' })

    vi.spyOn(authService, 'login')
      .mockResolvedValueOnce({ token: 'token-a', user: userA })
      .mockResolvedValueOnce({ token: 'token-b', user: userB })

    await auth.login({ email: 'a@ufc.br', password: 'secret' })

    let capturedTokenOnSecondGet: string | null = null
    let capturedUserIdOnSecondGet: number | null = null
    vi.spyOn(userService, 'me')
      .mockResolvedValueOnce(userA)
      .mockImplementationOnce(async () => {
        capturedTokenOnSecondGet = auth.token
        capturedUserIdOnSecondGet = auth.user?.id ?? null
        return userBApi
      })

    const wrapper = mountProfile()
    await flushPromises()

    await auth.login({ email: 'b@ufc.br', password: 'secret' })
    await flushPromises()

    expect(capturedTokenOnSecondGet).toBe('token-b')
    expect(capturedUserIdOnSecondGet).toBe(2)
    expect(auth.user).toEqual(userBApi)
    expect(getInputValues(wrapper)).toContain('Conta B API')
    expect(getInputValues(wrapper)).toContain('b@ufc.br')
  })

  it('S12 — Regressão do Perfil: carregamento, edição, validação, PATCH e snackbar seguem intactos em sessão estável', async () => {
    const auth = useAuthStore()
    const ui = useUiStore()
    const user = makeUser({ id: 1, name: 'Ana Regressão', phone: null, email: 'ana@ufc.br', role: 'USER' })
    const updated = makeUser({
      id: 1,
      name: 'Ana Confirmada',
      phone: '(88) 99999-8888',
      email: 'ana@ufc.br',
      role: 'USER',
    })

    vi.spyOn(authService, 'login').mockResolvedValueOnce({ token: 'token-ok', user })
    await auth.login({ email: 'ana@ufc.br', password: 'secret' })

    vi.spyOn(userService, 'me').mockResolvedValueOnce(user)
    const updateSpy = vi.spyOn(userService, 'updateMe').mockResolvedValueOnce(updated)

    const wrapper = mountProfile()
    await flushPromises()

    expect(wrapper.find('input#profile-email').attributes('readonly')).toBeDefined()
    expect(wrapper.find('input#profile-role').attributes('readonly')).toBeDefined()

    await wrapper.find('input#profile-name').setValue('Ana Confirmada')
    await wrapper.find('input#profile-phone').setValue('(88) 99999-8888')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith({
      name: 'Ana Confirmada',
      phone: '(88) 99999-8888',
    })
    expect(auth.user).toEqual(updated)
    expect(ui.snackbar.show).toBe(true)
    expect(ui.snackbar.message).toBe('Perfil atualizado com sucesso.')
  })
})
