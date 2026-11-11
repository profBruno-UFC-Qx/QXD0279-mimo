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

  // getters: Valores derivados do estado para controlar acesso e exibir ações conforme a sessão e o perfil.
  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAuthenticated = computed(() => isLoggedIn.value)
  const role = computed(() => user.value?.role || null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN' || user.value?.role === 'SUPERADMIN')
  const isSuperAdmin = computed(() => user.value?.role === 'SUPERADMIN')

  // actions: Funções que atualizam o estado reativo e interagem com os serviços de autenticação.
  async function login(payload: LoginPayload) {
    const res = await authService.login(payload)
    const accessToken = res.accessToken || (res as any).token
    const userData = res.user
    token.value = accessToken
    user.value = userData
    if (accessToken) {
      localStorage.setItem('achadex.token', accessToken)
    }
  }

  // Registra a conta.
  async function register(payload: RegisterPayload) {
    const res = await authService.register(payload)
    if (res && (res as any).accessToken) {
      const accessToken = (res as any).accessToken
      const userData = (res as any).user
      token.value = accessToken
      user.value = userData
      localStorage.setItem('achadex.token', accessToken)
    }
  }

  // Se o tokne não for mais válido encerra a sessão.
  async function fetchMe() {
    if (!token.value) return
    try {
      user.value = await authService.me()
    } catch {
      logout()
    }
  }

  // Limpa os dados em memória e o token persistido para encerrar completamente a sessão.
  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('achadex.token')
  }

  return {
    user,
    token,
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
