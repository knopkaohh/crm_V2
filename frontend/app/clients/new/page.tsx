'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'

export default function NewClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryPhone = searchParams.get('phone')
  const querySource = searchParams.get('source')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    brand: '',
    phone: queryPhone || '',
    additionalContactType: '',
    additionalContactValue: '',
    source: querySource || 'Avito',
  })

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    let formatted = numbers.startsWith('8') ? '7' + numbers.slice(1) : numbers
    if (!formatted.startsWith('7')) {
      formatted = '7' + formatted
    }
    formatted = formatted.slice(0, 11)

    let result = '+7'
    if (formatted.length > 1) {
      result += ' ' + formatted.slice(1, 4)
    }
    if (formatted.length > 4) {
      result += ' ' + formatted.slice(4, 7)
    }
    if (formatted.length > 7) {
      result += '-' + formatted.slice(7, 9)
    }
    if (formatted.length > 9) {
      result += '-' + formatted.slice(9, 11)
    }

    return result
  }

  const buildNotes = () => {
    const notes: string[] = []
    notes.push(`Источник: ${formData.source}`)

    if (formData.additionalContactType && formData.additionalContactValue.trim()) {
      notes.push(
        `Дополнительная форма связи (${formData.additionalContactType}): ${formData.additionalContactValue.trim()}`
      )
    }

    return notes.join('\n')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.lastName.trim() || !formData.firstName.trim()) {
      alert('Укажите фамилию и имя клиента')
      return
    }
    if (!formData.phone.trim()) {
      alert('Укажите номер телефона клиента')
      return
    }

    setLoading(true)

    try {
      const payload: any = {
        name: [formData.lastName, formData.firstName, formData.middleName].filter(Boolean).join(' ').trim(),
        company: formData.brand.trim() || null,
        phone: formData.phone,
        contactMethod: formData.additionalContactType || null,
        notes: buildNotes() || null,
      }

      if (formData.additionalContactType === 'Telegram' && formData.additionalContactValue.trim()) {
        payload.telegram = formData.additionalContactValue.trim().startsWith('@')
          ? formData.additionalContactValue.trim()
          : `@${formData.additionalContactValue.trim()}`
      }

      if (formData.additionalContactType === 'Почта' && formData.additionalContactValue.trim()) {
        payload.email = formData.additionalContactValue.trim()
      }

      if (formData.additionalContactType === 'WhatsApp' && formData.additionalContactValue.trim()) {
        payload.whatsapp = formData.additionalContactValue.trim()
      }

      await api.post('/clients', payload)
      router.push('/clients')
    } catch (error: any) {
      console.error('Failed to create client:', error)
      alert(error.response?.data?.error || 'Ошибка при создании клиента')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Новый клиент</h1>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-sm shadow-primary-100">
          <section className="space-y-4">
            <header className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">Контакт</h3>
              <p className="text-sm text-gray-600">Основные данные клиента в стиле формы нового лида.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Фамилия <span className="text-primary-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Иванов"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Имя <span className="text-primary-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Иван"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Отчество</label>
                <input
                  type="text"
                  value={formData.middleName}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                  placeholder="Иванович"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Бренд</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="Компания или бренд"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Номер телефона <span className="text-primary-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                  placeholder="+7 916 354-92-87"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">Формат автоматически приводим к +7 XXX XXX-XX-XX</p>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-gray-900">Дополнительная форма связи</label>
                <select
                  value={formData.additionalContactType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      additionalContactType: e.target.value,
                      additionalContactValue: '',
                    })
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Не выбрано</option>
                  <option value="Telegram">Telegram</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Почта">Почта</option>
                  <option value="MAX">MAX</option>
                </select>
                {formData.additionalContactType ? (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={formData.additionalContactValue}
                      onChange={(e) => setFormData({ ...formData, additionalContactValue: e.target.value })}
                      placeholder={
                        formData.additionalContactType === 'Почта'
                          ? 'Введите email'
                          : `Введите контакт для ${formData.additionalContactType}`
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-gray-900">Источник</label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="Avito">Avito</option>
                  <option value="Сайт">Сайт</option>
                  <option value="Проектные продажи">Проектные продажи</option>
                  <option value="Теплые обзвоны">Теплые обзвоны</option>
                  <option value="Постоянные клиенты">Постоянные клиенты</option>
                  <option value="Сарафанное радио">Сарафанное радио</option>
                </select>
              </div>
            </div>
          </section>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Создание...' : 'Создать клиента'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}







