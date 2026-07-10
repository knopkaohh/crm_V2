import api from './api'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  role: 'SALES_MANAGER' | 'TECHNOLOGIST' | 'EXECUTIVE' | 'ADMIN'
  isActive: boolean
}

export interface LoginResponse {
  token: string
  user: User
}

export const auth = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/auth/me')
    return response.data
  },

  getCachedUser: (): User | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return null
      return JSON.parse(raw) as User
    } catch {
      return null
    }
  },

  isAdmin: (user: User | null | undefined): boolean => user?.role === 'ADMIN',

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  },
}
