import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import router from '@/router'

// Instância HTTP compartilhada pelos services (componentes e views chamam os services)
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Intercepta cada requisição. Tenta recuperar o token, quando existe o envia no cabeçalho Authorization
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('achadex.token')
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
  // encerra a sessão e envia o usuário ao login, preservando a rota de retorno.
  (err) => {
    if (err.response?.status === 401 && router.currentRoute.value.meta.requiresAuth) {
      useAuthStore().logout()
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return Promise.reject(err)
  },
)
