import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('achadex_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
