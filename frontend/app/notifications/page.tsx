'use client'

import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Bell, Check, Trash2, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  link: string | null
  createdAt: string
}

const typeLabels: Record<string, string> = {
  task: 'Задача',
  order: 'Заказ',
  lead: 'Лид',
  general: 'Общее',
}

const typeColors: Record<string, string> = {
  task: 'bg-blue-100 text-blue-800',
  order: 'bg-green-100 text-green-800',
  lead: 'bg-purple-100 text-purple-800',
  general: 'bg-gray-100 text-gray-800',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    loadNotifications()
  }, [filter, typeFilter])

  const loadNotifications = async () => {
    try {
      const params: any = {}
      if (filter === 'unread') params.read = 'false'
      if (filter === 'read') params.read = 'true'
      if (typeFilter) params.type = typeFilter

      const response = await api.get('/notifications', { params })
      setNotifications(response.data)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </Layout>
    )
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Bell className="h-8 w-8" />
              Уведомления
            </h1>
            <p className="text-gray-600 mt-1">
              {unreadCount > 0
                ? `${unreadCount} непрочитанных уведомлений`
                : 'Нет непрочитанных уведомлений'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Check className="h-5 w-5" />
              <span>Отметить все как прочитанные</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'unread' | 'read')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">Все уведомления</option>
              <option value="unread">Непрочитанные</option>
              <option value="read">Прочитанные</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Все типы</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="divide-y divide-gray-200">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>Нет уведомлений</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          typeColors[notification.type] || typeColors.general
                        }`}
                      >
                        <Bell className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3
                              className={`text-sm font-semibold ${
                                !notification.read ? 'text-gray-900' : 'text-gray-700'
                              }`}
                            >
                              {notification.title}
                            </h3>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                            )}
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded ${
                                typeColors[notification.type] || typeColors.general
                              }`}
                            >
                              {typeLabels[notification.type] || notification.type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(notification.createdAt), 'dd MMMM yyyy, HH:mm', {
                              locale: ru,
                            })}
                          </p>
                          {notification.link && (
                            <Link
                              href={notification.link}
                              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 mt-2"
                              onClick={() => !notification.read && markAsRead(notification.id)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Перейти
                            </Link>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                              title="Отметить как прочитанное"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}






