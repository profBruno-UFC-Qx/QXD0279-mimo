import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, LoginPayload, RegisterPayload } from '../types'
import { authService } from '../services/auth.service'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('achadex_token'))

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN' || user.value?.role === 'SUPERADMIN')
  const isSuperAdmin = computed(() => user.value?.role === 'SUPERADMIN')

  async function login(payload: LoginPayload) {
    const res = await authService.login(payload)
    token.value = res.accessToken
    user.value = res.user
    localStorage.setItem('achadex_token', res.accessToken)
  }

  async function register(payload: RegisterPayload) {
    await authService.register(payload)
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      user.value = await authService.me()
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('achadex_token')
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    login,
    register,
    fetchMe,
    logout,
  }
})
