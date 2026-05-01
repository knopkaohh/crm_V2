'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'

interface Client {
  id: string
  name: string
  phone: string
}

export default function NewCallPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [formData, setFormData] = useState({
    clientId: '',
    phoneNumber: '',
    status: 'NO_ANSWER',
    duration: '',
    notes: '',
    callbackAt: '',
  })

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      const response = await api.get('/clients')
      setClients(response.data)
    } catch (error) {
      console.error('Failed to load clients:', error)
    }
  }

  const handleClientChange = (clientId: string) => {
    setFormData({ ...formData, clientId })
    const client = clients.find((c) => c.id === clientId)
    if (client) {
      setFormData({ ...formData, clientId, phoneNumber: client.phone })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.phoneNumber) {
      alert('Введите номер телефона')
      return
    }

    setLoading(true)

    try {
      const payload = {
        ...formData,
        clientId: formData.clientId || null,
        duration: formData.duration ? parseInt(formData.duration) : null,
        callbackAt: formData.callbackAt || null,
      }

      await api.post('/calls', payload)
      router.push('/calls')
    } catch (error: any) {
      console.error('Failed to create call:', error)
      alert(error.response?.data?.error || 'Ошибка при создании звонка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Новый звонок</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Клиент (опционально)</label>
            <select
              value={formData.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Новый номер</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} - {client.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Номер телефона <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="NO_ANSWER">Нет ответа</option>
              <option value="NOT_INTERESTED">Не заинтересован</option>
              <option value="CALLBACK_REQUESTED">Запросил обратный звонок</option>
              <option value="INTERESTED">Заинтересован</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Длительность (секунды)</label>
            <input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Заметки</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Обратный звонок</label>
            <input
              type="datetime-local"
              value={formData.callbackAt}
              onChange={(e) => setFormData({ ...formData, callbackAt: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Создание...' : 'Создать звонок'}
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







