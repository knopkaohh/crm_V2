'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { auth, User } from '@/lib/auth'
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  ShoppingCart,
  ClipboardList,
  Phone,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  Clock,
  FileSpreadsheet,
  Kanban,
} from 'lucide-react'
import api from '@/lib/api'
import { getApiBaseUrl } from '@/lib/url'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showTodayContactsModal, setShowTodayContactsModal] = useState(false)
  const [todayContacts, setTodayContacts] = useState<any[]>([])
  const [loadingTodayContacts, setLoadingTodayContacts] = useState(false)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) {
          router.replace('/login')
          return
        }
        const userData = await auth.getCurrentUser()
        setUser(userData)
      } catch (error) {
        // Не вызываем logout здесь, чтобы избежать бесконечного цикла
        // Просто перенаправляем на страницу входа
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.replace('/login')
      } finally {
        setInitializing(false)
      }
    }
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Force light theme only (no toggle)
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    // Загрузка уведомлений
    const loadNotifications = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const apiUrl = getApiBaseUrl()
        const response = await fetch(`${apiUrl}/notifications/unread-count`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          setUnreadCount(data.count)
        }
      } catch (error) {
        console.error('Failed to load notifications:', error)
      }
    }

    if (user) {
      loadNotifications()
      // Увеличен интервал до 60 секунд для уменьшения нагрузки
      const interval = setInterval(loadNotifications, 60000) // Каждые 60 секунд
      
      // Слушать события получения уведомлений
      const handleNotificationReceived = () => {
        loadNotifications()
      }
      window.addEventListener('notification-received', handleNotificationReceived)
      
      return () => {
        clearInterval(interval)
        window.removeEventListener('notification-received', handleNotificationReceived)
      }
    }
  }, [user])

  // Загрузка контактов на сегодня для менеджеров
  useEffect(() => {
    const loadTodayContacts = async () => {
      if (!user || user.role !== 'SALES_MANAGER') return

      // Проверяем, показывали ли уже модальное окно сегодня
      const today = new Date().toDateString()
      const lastShown = localStorage.getItem('todayContactsModalShown')
      if (lastShown === today) return

      setLoadingTodayContacts(true)
      try {
        // Загружаем задачи на сегодня, связанные с лидами
        const response = await api.get('/tasks', {
          params: {
            dueDate: 'today',
            assigneeId: user.id,
          },
        })

        // Фильтруем только задачи, связанные с лидами (leadId не null) и не выполненные
        const tasksWithLeads = response.data.filter(
          (task: any) => task.leadId && task.lead && task.lead.client && task.status !== 'COMPLETED'
        )

        if (tasksWithLeads.length > 0) {
          // Группируем задачи по клиентам
          const contactsByClient = new Map()
          tasksWithLeads.forEach((task: any) => {
            const client = task.lead.client
            const clientId = client.id
            if (!contactsByClient.has(clientId)) {
              contactsByClient.set(clientId, {
                client: client,
                tasks: [],
                lead: task.lead,
              })
            }
            contactsByClient.get(clientId).tasks.push(task)
          })

          const contactsList = Array.from(contactsByClient.values())
          setTodayContacts(contactsList)

          // Показываем модальное окно только если есть контакты
          if (contactsList.length > 0) {
            setShowTodayContactsModal(true)
            localStorage.setItem('todayContactsModalShown', today)
          }
        }
      } catch (error) {
        console.error('Failed to load today contacts:', error)
      } finally {
        setLoadingTodayContacts(false)
      }
    }

    if (user) {
      loadTodayContacts()
    }
  }, [user])

  if (initializing) {
    return null
  }
  if (!user) {
    return null
  }

  const menuItems = [
    { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
    { href: '/leads', label: 'Контакты', icon: TrendingUp },
    { href: '/orders', label: 'Заказы', icon: ShoppingCart },
    { href: '/orders/accounting', label: 'Учёт заказов', icon: FileSpreadsheet },
    { href: '/clients', label: 'Клиенты', icon: Users },
    { href: '/project-sales', label: 'Проектные продажи', icon: Kanban },
    { href: '/calls', label: 'Теплые обзвоны', icon: Phone },
  ]

  if (user.role === 'EXECUTIVE' || user.role === 'ADMIN') {
    menuItems.push({ href: '/analytics', label: 'Аналитика', icon: BarChart3 })
  }

  if (user.role === 'ADMIN') {
    menuItems.push({ href: '/admin', label: 'Админ-панель', icon: Settings })
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } transition-transform duration-300 ease-in-out`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center border-b border-gray-200 relative" style={{ height: '60px' }}>
            <Link 
              href="/dashboard" 
              className="hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              <span className="text-lg md:text-xl lg:text-2xl font-bold text-gray-700 tracking-tight">
                BIRKA MARKET
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden absolute right-4 text-gray-500 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive(item.href)
                          ? 'bg-primary-50 text-primary-600 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* User info */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-primary-600 font-semibold">
                  {user.firstName[0]}{user.lastName[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => auth.logout()}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex-1"></div>
            <div className="flex items-center gap-4">
              <Link
                href="/notifications"
                className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/settings/notifications"
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                title="Настройки уведомлений"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Today Contacts Modal */}
      {showTodayContactsModal && todayContacts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowTodayContactsModal(false)}></div>
          <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Контакты на сегодня
                </h3>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {todayContacts.length}
                </span>
              </div>
              <button
                onClick={() => setShowTodayContactsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingTodayContacts ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                todayContacts.map((contact, index) => (
                  <div
                    key={contact.client.id || index}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{contact.client.name}</h4>
                        {contact.client.phone && (
                          <p className="text-sm text-gray-600 mt-1">{contact.client.phone}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 mt-3">
                      {contact.tasks.map((task: any) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-2 text-sm bg-blue-50 p-2 rounded"
                        >
                          <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 font-medium">{task.title}</p>
                            {task.dueDate && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(task.dueDate).toLocaleTimeString('ru-RU', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {contact.lead && (
                      <Link
                        href={`/leads/${contact.lead.id}`}
                        className="text-xs text-primary-600 hover:text-primary-700 mt-2 inline-block"
                      >
                        Открыть контакт →
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 p-4">
              <button
                onClick={() => setShowTodayContactsModal(false)}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
