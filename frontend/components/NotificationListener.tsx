'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useToast } from './ToastProvider'
import { auth } from '@/lib/auth'
import api from '@/lib/api'
import { getSocketBaseUrl } from '@/lib/url'

export function NotificationListener() {
  const { showToast } = useToast()
  const socketRef = useRef<Socket | null>(null)
  const notificationSettingsRef = useRef<any>(null)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    // Предотвращаем дублирование инициализации (особенно в React Strict Mode)
    if (isInitializedRef.current) {
      return
    }
    isInitializedRef.current = true

    // Загрузить настройки уведомлений
    const loadSettings = async () => {
      try {
        const response = await api.get('/notifications/settings')
        notificationSettingsRef.current = response.data
      } catch (error) {
        console.error('Failed to load notification settings:', error)
        // Установить дефолтные настройки
        notificationSettingsRef.current = {
          enabled: true,
          desktop: true,
        }
      }
    }

    // Инициализировать Socket.io только один раз
    const initializeSocket = async () => {
      try {
        await loadSettings()

        const user = await auth.getCurrentUser()
        if (!user) {
          isInitializedRef.current = false
          return
        }

        // Проверяем, не создан ли уже сокет
        if (socketRef.current?.connected) {
          console.log('Socket already connected, skipping initialization')
          return
        }

        // Отключаем старый сокет если он существует
        if (socketRef.current) {
          socketRef.current.disconnect()
          socketRef.current = null
        }

        const socketUrl = getSocketBaseUrl()
        const newSocket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
        })

        newSocket.on('connect', () => {
          console.log('Socket connected')
          newSocket.emit('join-user-room', user.id)
        })

        newSocket.on('disconnect', () => {
          console.log('Socket disconnected')
        })

        newSocket.on('notification', (notification: any) => {
          console.log('Notification received:', notification)
          
          // Проверить настройки уведомлений
          const settings = notificationSettingsRef.current
          const shouldShow = settings?.enabled !== false

          if (shouldShow && settings?.desktop) {
            const typeMap: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
              task: 'info',
              order: 'success',
              lead: 'info',
              general: 'info',
            }

            showToast({
              title: notification.title,
              message: notification.message,
              type: typeMap[notification.type] || 'info',
              duration: 5000,
            })
          }

          // Обновить счетчик непрочитанных
          window.dispatchEvent(new CustomEvent('notification-received'))
        })

        socketRef.current = newSocket
      } catch (error) {
        console.error('Failed to initialize socket:', error)
        isInitializedRef.current = false
      }
    }

    initializeSocket()

    return () => {
      console.log('Cleaning up NotificationListener')
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      isInitializedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Пустой массив зависимостей - инициализация только один раз

  // Обновлять настройки при изменении
  useEffect(() => {
    const handleSettingsUpdate = () => {
      const loadSettings = async () => {
        try {
          const response = await api.get('/notifications/settings')
          notificationSettingsRef.current = response.data
        } catch (error) {
          console.error('Failed to reload notification settings:', error)
        }
      }
      loadSettings()
    }

    window.addEventListener('notification-settings-updated', handleSettingsUpdate)
    return () => {
      window.removeEventListener('notification-settings-updated', handleSettingsUpdate)
    }
  }, [])

  return null
}

