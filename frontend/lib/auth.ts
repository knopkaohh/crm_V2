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

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  },
}
