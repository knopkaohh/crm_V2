'use client'

import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Bell, Save, CheckCircle } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'

interface NotificationSettings {
  enabled: boolean
  desktop: boolean
  task: {
    assigned: boolean
    completed: boolean
    dueSoon: boolean
    overdue: boolean
  }
  order: {
    created: boolean
    statusChanged: boolean
    ready: boolean
    delivered: boolean
  }
  lead: {
    created: boolean
    statusChanged: boolean
    converted: boolean
  }
  general: {
    system: boolean
  }
}

export default function NotificationSettingsPage() {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await api.get('/notifications/settings')
      setSettings(response.data)
    } catch (error) {
      console.error('Failed to load settings:', error)
      showToast({
        title: 'Ошибка',
        message: 'Не удалось загрузить настройки',
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    try {
      await api.put('/notifications/settings', settings)
      showToast({
        title: 'Успешно',
        message: 'Настройки уведомлений сохранены',
        type: 'success',
      })
      // Уведомить NotificationListener об обновлении настроек
      window.dispatchEvent(new CustomEvent('notification-settings-updated'))
    } catch (error) {
      console.error('Failed to save settings:', error)
      showToast({
        title: 'Ошибка',
        message: 'Не удалось сохранить настройки',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (path: string, value: boolean) => {
    if (!settings) return

    const keys = path.split('.')
    const newSettings = { ...settings }

    if (keys.length === 1) {
      ;(newSettings as any)[keys[0]] = value
    } else if (keys.length === 2) {
      ;(newSettings as any)[keys[0]] = {
        ...(newSettings as any)[keys[0]],
        [keys[1]]: value,
      }
    }

    setSettings(newSettings)
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

  if (!settings) {
    return (
      <Layout>
        <div className="text-center py-12 text-gray-500">Не удалось загрузить настройки</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Bell className="h-8 w-8" />
              Настройки уведомлений
            </h1>
            <p className="text-gray-600 mt-1">
              Выберите, какие уведомления вы хотите получать
            </p>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Сохранение...</span>
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>Сохранить</span>
              </>
            )}
          </button>
        </div>

        {/* Общие настройки */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Общие настройки</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Включить уведомления</span>
                <p className="text-sm text-gray-500">Получать все уведомления</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSetting('enabled', e.target.checked)}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Всплывающие уведомления</span>
                <p className="text-sm text-gray-500">
                  Показывать всплывающие окна при получении уведомлений
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.desktop}
                onChange={(e) => updateSetting('desktop', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Уведомления о задачах */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Задачи</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Назначена задача</span>
                <p className="text-sm text-gray-500">Когда вам назначают новую задачу</p>
              </div>
              <input
                type="checkbox"
                checked={settings.task.assigned}
                onChange={(e) => updateSetting('task.assigned', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Задача выполнена</span>
                <p className="text-sm text-gray-500">Когда задача отмечена как выполненная</p>
              </div>
              <input
                type="checkbox"
                checked={settings.task.completed}
                onChange={(e) => updateSetting('task.completed', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Скоро срок задачи</span>
                <p className="text-sm text-gray-500">За день до истечения срока задачи</p>
              </div>
              <input
                type="checkbox"
                checked={settings.task.dueSoon}
                onChange={(e) => updateSetting('task.dueSoon', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Просрочена задача</span>
                <p className="text-sm text-gray-500">Когда срок задачи истек</p>
              </div>
              <input
                type="checkbox"
                checked={settings.task.overdue}
                onChange={(e) => updateSetting('task.overdue', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Уведомления о заказах */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Заказы</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Создан новый заказ</span>
                <p className="text-sm text-gray-500">Когда создается новый заказ</p>
              </div>
              <input
                type="checkbox"
                checked={settings.order.created}
                onChange={(e) => updateSetting('order.created', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Изменен статус заказа</span>
                <p className="text-sm text-gray-500">Когда изменяется статус заказа</p>
              </div>
              <input
                type="checkbox"
                checked={settings.order.statusChanged}
                onChange={(e) => updateSetting('order.statusChanged', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Заказ готов</span>
                <p className="text-sm text-gray-500">Когда заказ готов к выдаче</p>
              </div>
              <input
                type="checkbox"
                checked={settings.order.ready}
                onChange={(e) => updateSetting('order.ready', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Заказ доставлен</span>
                <p className="text-sm text-gray-500">Когда заказ доставлен клиенту</p>
              </div>
              <input
                type="checkbox"
                checked={settings.order.delivered}
                onChange={(e) => updateSetting('order.delivered', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Уведомления о лидах */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Лиды</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Создан новый лид</span>
                <p className="text-sm text-gray-500">Когда создается новый лид</p>
              </div>
              <input
                type="checkbox"
                checked={settings.lead.created}
                onChange={(e) => updateSetting('lead.created', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Изменен статус лида</span>
                <p className="text-sm text-gray-500">Когда изменяется статус лида</p>
              </div>
              <input
                type="checkbox"
                checked={settings.lead.statusChanged}
                onChange={(e) => updateSetting('lead.statusChanged', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Лид переведен в заказ</span>
                <p className="text-sm text-gray-500">Когда лид конвертируется в заказ</p>
              </div>
              <input
                type="checkbox"
                checked={settings.lead.converted}
                onChange={(e) => updateSetting('lead.converted', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Общие уведомления */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Системные уведомления</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-gray-900">Системные сообщения</span>
                <p className="text-sm text-gray-500">Важные системные уведомления</p>
              </div>
              <input
                type="checkbox"
                checked={settings.general.system}
                onChange={(e) => updateSetting('general.system', e.target.checked)}
                disabled={!settings.enabled}
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>
      </div>
    </Layout>
  )
}

