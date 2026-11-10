import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('achadex.token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data && 'data' in res.data) {
      return { ...res, data: res.data.data }
    }
    return res
  },
  (err) => {
    if (err.response?.status === 401 && router.currentRoute.value.meta.requiresAuth) {
      useAuthStore().logout()
      router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return Promise.reject(err)
  },
)
