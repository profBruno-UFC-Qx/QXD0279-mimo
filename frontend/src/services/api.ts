import axios, { type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import router from '@/router'

interface RequestAuthSnapshot {
  token: string | null
  storeToken: string | null
  generation: number
}

interface TrackedRequestConfig extends InternalAxiosRequestConfig {
  _authSession?: RequestAuthSnapshot
}

function isCurrentAuthenticatedSession(config?: TrackedRequestConfig): boolean {
  const snapshot = config?._authSession
  if (!snapshot?.token) return false

  const auth = useAuthStore()
  const currentStorageToken = localStorage.getItem('achadex.token')

  if (currentStorageToken !== snapshot.token) return false
  if (auth.sessionGeneration !== snapshot.generation) return false
  if (auth.token !== snapshot.storeToken) return false
  if (auth.token !== null && auth.token !== snapshot.token) return false

  return true
}

const DEFAULT_API_BASE_URL = '/api/v1'

export function resolveApiBaseUrl(configuredValue: unknown): string {
  if (configuredValue === undefined || configuredValue === null) {
    return DEFAULT_API_BASE_URL
  }
  if (typeof configuredValue !== 'string') {
    throw new Error('Configuração inválida para VITE_API_URL.')
  }

  const trimmed = configuredValue.trim()
  if (trimmed === '') {
    return DEFAULT_API_BASE_URL
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed === '/' || /\s/.test(trimmed)) {
      throw new Error('Configuração inválida para VITE_API_URL.')
    }
    return trimmed.replace(/\/+$/, '')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Configuração inválida para VITE_API_URL.')
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname || /\s/.test(trimmed)) {
    throw new Error('Configuração inválida para VITE_API_URL.')
  }

  return trimmed.replace(/\/+$/, '')
}

// Instância HTTP compartilhada pelos services (componentes e views chamam os services)
export const api = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL),
  headers: {
    'Content-Type': 'application/json',
  },
})

// Intercepta cada requisição. Tenta recuperar o token, quando existe o envia no cabeçalho Authorization
api.interceptors.request.use((config: TrackedRequestConfig) => {
  const auth = useAuthStore()
  const token = localStorage.getItem('achadex.token')
  config._authSession = {
    token,
    storeToken: auth.token,
    generation: auth.sessionGeneration,
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  // Intercepta respostas antes de chegarem ao service. Se o backend
  // usar o envelope { success, data }, expõe somente o conteúdo de data.
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data && 'data' in res.data) {
      return { ...res, data: res.data.data }
    }
    return res
  },
  // Intercepta erros antes de chegarem ao service. Em 401 numa rota protegida,
  // encerra a sessão apenas se a requisição ainda pertencer à sessão autenticada atual.
  (err) => {
    if (
      err.response?.status === 401 &&
      router.currentRoute.value.meta.requiresAuth &&
      isCurrentAuthenticatedSession(err.config as TrackedRequestConfig | undefined)
    ) {
      useAuthStore().logout()
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return Promise.reject(err)
  },
)
