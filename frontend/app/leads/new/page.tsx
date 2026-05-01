'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth } from '@/lib/auth'

export default function NewLeadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    source: 'Сайт',
    comment: '',
    taskType: 'PROCESS_CLIENT' as 'PROCESS_CLIENT' | 'MAKE_OFFER' | 'CALL_LATER',
    callLaterOption: 'HOUR' as 'HOUR' | 'TOMORROW' | 'WEEK' | 'CUSTOM',
    callLaterCustom: '',
  })

  // Убрали загрузку клиентов для оптимизации - она не используется в форме

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.clientName) {
      alert('Укажите имя клиента')
      return
    }

    setLoading(true)

    try {
      // Always create a new client from provided name/phone
      const resClient = await api.post('/clients', {
        name: formData.clientName,
        phone: formData.clientPhone || null,
        source: formData.source,
      })
      const clientId = resClient.data.id

      // Create lead with minimal fields
      const leadRes = await api.post('/leads', {
        clientId,
        status: 'NEW_LEAD',
        source: formData.source,
        description: formData.comment || null,
      })

      // Auto create task for current manager
      const currentUser = await auth.getCurrentUser()
      const titleMap: Record<string, string> = {
        PROCESS_CLIENT: 'Обработать клиента',
        MAKE_OFFER: 'Сформировать КП',
        CALL_LATER: 'Связаться с клиентом позже',
      }

      let dueDate: string | undefined
      if (formData.taskType === 'CALL_LATER') {
        const now = new Date()
        if (formData.callLaterOption === 'HOUR') now.setHours(now.getHours() + 1)
        if (formData.callLaterOption === 'TOMORROW') now.setDate(now.getDate() + 1)
        if (formData.callLaterOption === 'WEEK') now.setDate(now.getDate() + 7)
        if (formData.callLaterOption === 'CUSTOM' && formData.callLaterCustom) {
          const custom = new Date(formData.callLaterCustom)
          if (!isNaN(custom.getTime())) {
            dueDate = custom.toISOString()
          }
        } else {
          dueDate = now.toISOString()
        }
      }

      await api.post('/tasks', {
        title: titleMap[formData.taskType],
        description: `Клиент: ${formData.clientName || 'Новый клиент'}`,
        priority: 1,
        assigneeId: currentUser?.id,
        dueDate,
      })

      router.push('/leads')
    } catch (error: any) {
      console.error('Failed to create lead:', error)
      alert(error.response?.data?.error || 'Ошибка при создании лида')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Новый лид</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Имя клиента</label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="Введите имя клиента"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Номер телефона (необязательно)</label>
              <input
                type="tel"
                value={formData.clientPhone}
                onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                placeholder="+7..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Источник</label>
            <select
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="Сайт">Сайт</option>
              <option value="Avito">Avito</option>
              <option value="Холодные обзвоны">Холодные обзвоны</option>
              <option value="Сарафанное радио">Сарафанное радио</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Комментарий</label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Дополнительная информация о лиде..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Задача</label>
            <select
              value={formData.taskType}
              onChange={(e) => setFormData({ ...formData, taskType: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="PROCESS_CLIENT">Обработать клиента</option>
              <option value="MAKE_OFFER">Сформировать КП</option>
              <option value="CALL_LATER">Связаться с клиентом позже</option>
            </select>
          </div>

          {formData.taskType === 'CALL_LATER' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Когда связаться</label>
                <select
                  value={formData.callLaterOption}
                  onChange={(e) => setFormData({ ...formData, callLaterOption: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="HOUR">Через час</option>
                  <option value="TOMORROW">Завтра</option>
                  <option value="WEEK">Через неделю</option>
                  <option value="CUSTOM">Указать время</option>
                </select>
              </div>
              {formData.callLaterOption === 'CUSTOM' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Дата и время</label>
                  <input
                    type="datetime-local"
                    value={formData.callLaterCustom}
                    onChange={(e) => setFormData({ ...formData, callLaterCustom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Создание...' : 'Создать лид'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}

