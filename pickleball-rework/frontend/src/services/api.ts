import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const API_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '69420',
  },
  timeout: 25000,
})

api.interceptors.request.use(
  (config) => {
    const { token, user } = useAuthStore.getState()
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (user?.id) config.headers['x-user-id'] = user.id
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (!error.config?.url?.includes('/auth/login') && !error.config?.url?.includes('/auth/verify')) {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

export default api
