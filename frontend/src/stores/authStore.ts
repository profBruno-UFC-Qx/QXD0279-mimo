import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, LoginPayload, RegisterPayload } from '../types'
import { authService } from '../services/auth.service'

// Store global de autenticação: compartilha sessão, usuário e permissões.
export const useAuthStore = defineStore('auth', () => {

  // state
  const user = ref<User | null>(null)
  const token = ref<string | null>(
    localStorage.getItem('achadex.token')
  )
  const sessionGeneration = ref(0)

  // getters: Valores derivados do estado para controlar acesso e exibir ações conforme a sessão e o perfil.
  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAuthenticated = computed(() => isLoggedIn.value)
  const role = computed(() => user.value?.role || null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN' || user.value?.role === 'SUPERADMIN')
  const isSuperAdmin = computed(() => user.value?.role === 'SUPERADMIN')

  // actions: Funções que atualizam o estado reativo e interagem com os serviços de autenticação.
  async function login(payload: LoginPayload) {
    const res = await authService.login(payload)
    sessionGeneration.value += 1
    token.value = res.token
    user.value = res.user
    localStorage.setItem('achadex.token', res.token)
  }

  // Registra a conta.
  async function register(payload: RegisterPayload) {
    return authService.register(payload)
  }

  function isUnauthorizedError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null || !('response' in err)) return false
    const response = (err as { response?: { status?: unknown } }).response
    return response?.status === 401
  }

  // Recupera os dados da sessão atual ignorando respostas obsoletas e preservando a sessão em falhas recuperáveis.
  async function fetchMe() {
    if (!token.value) return
    const requestToken = token.value
    const requestGeneration = sessionGeneration.value
    const isSameSession = () =>
      token.value === requestToken && sessionGeneration.value === requestGeneration

    try {
      const me = await authService.me()
      if (!isSameSession()) return
      user.value = me
    } catch (err: unknown) {
      if (!isSameSession()) return
      if (isUnauthorizedError(err)) {
        logout()
      }
    }
  }

  // Limpa os dados em memória e o token persistido para encerrar completamente a sessão.
  function logout() {
    sessionGeneration.value += 1
    token.value = null
    user.value = null
    localStorage.removeItem('achadex.token')
  }

  return {
    user,
    token,
    sessionGeneration,
    isLoggedIn,
    isAuthenticated,
    role,
    isAdmin,
    isSuperAdmin,
    login,
    register,
    fetchMe,
    logout,
  }
})
