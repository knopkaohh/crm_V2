'use client'

import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Phone, RefreshCcw, BarChart3, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Call {
  id: string
  phoneNumber: string
  status: string
  source: string | null
  phoneReceivedAt: string | null
  callbackAt: string | null
  callComment: string | null
  assignedManagerId: string | null
  assignedManager: {
    id: string
    firstName: string
    lastName: string
  } | null
}

const statusOptions = [
  { value: 'WILL_ORDER', label: 'Оформит заказ' },
  { value: 'HOT_CONTACT', label: 'Горячий контакт' },
  { value: 'NO_ANSWER', label: 'Недозвон' },
  { value: 'REPLACEMENT', label: 'Замена' },
  { value: 'NOT_OUR_CLIENT', label: 'Не наш клиент' },
]

const WARM_CALLS_SOURCE = 'Теплые обзвоны'

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

const getTomorrowNoon = () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(12, 0, 0, 0)
  const y = tomorrow.getFullYear()
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const d = String(tomorrow.getDate()).padStart(2, '0')
  const h = String(tomorrow.getHours()).padStart(2, '0')
  const min = String(tomorrow.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function CallsPage() {
  const router = useRouter()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('')
  const [phoneDate, setPhoneDate] = useState('')
  const [sourceOptions, setSourceOptions] = useState<string[]>([])
  const [actionByCall, setActionByCall] = useState<Record<string, { status: string; comment: string; started: boolean }>>({})
  const [postActionsByCall, setPostActionsByCall] = useState<Record<string, { showOrder: boolean; showLead: boolean }>>({})
  const [showQuickLeadModal, setShowQuickLeadModal] = useState(false)
  const [quickLeadSubmitting, setQuickLeadSubmitting] = useState(false)
  const [quickLeadForm, setQuickLeadForm] = useState({
    callId: '',
    firstName: '',
    lastName: '',
    middleName: '',
    brand: '',
    phone: '',
    source: WARM_CALLS_SOURCE,
    nextContactDate: getTomorrowNoon(),
    contactPurpose: '',
    notes: '',
  })

  useEffect(() => {
    void loadData(true)
  }, [sourceFilter, phoneDate])

  const loadData = async (showPageLoader = false) => {
    if (showPageLoader) {
      setLoading(true)
    }
    try {
      const params: any = {}
      if (sourceFilter) params.source = sourceFilter
      if (phoneDate) {
        params.dateFrom = phoneDate
        params.dateTo = phoneDate
      }

      const callsResponse = await api.get('/calls', { params })

      const callsData: Call[] = callsResponse.data || []
      setCalls(callsData)
      setSourceOptions(Array.from(new Set(callsData.map((c) => c.source).filter(Boolean) as string[])))
    } catch (error) {
      console.error('Failed to load calls:', error)
      alert('Не удалось загрузить холодные обзвоны')
    } finally {
      if (showPageLoader) {
        setLoading(false)
      }
    }
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const res = await api.post('/calls/sync/google-sheets')
      alert(`Синхронизация завершена. Импортировано: ${res.data.imported}, пропущено: ${res.data.skipped}`)
      await loadData(false)
    } catch (e: any) {
      console.error('Failed to sync sheets:', e)
      alert(e?.response?.data?.error || 'Нет доступа или ошибка синхронизации')
    } finally {
      setSyncing(false)
    }
  }

  const handleStartCall = async (id: string) => {
    try {
      await api.post(`/calls/${id}/start`)
      setActionByCall((prev) => ({
        ...prev,
        [id]: {
          status: prev[id]?.status || 'NO_ANSWER',
          comment: prev[id]?.comment || '',
          started: true,
        },
      }))
      await loadData(false)
    } catch (e) {
      console.error('Failed to start call:', e)
      alert('Не удалось закрепить номер')
    }
  }

  const handleFinishCall = async (id: string) => {
    const action = actionByCall[id]
    if (!action?.status) {
      alert('Выберите статус')
      return
    }

    try {
      const response = await api.post(`/calls/${id}/finish`, {
        status: action.status,
        comment: action.comment,
      })

      if (response.data?.canCreateOrder) {
        const call = calls.find((c) => c.id === id)
        if (call) {
          setActionByCall((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          setPostActionsByCall((prev) => ({
            ...prev,
            [id]: { showOrder: true, showLead: true },
          }))
          return
        }
      }

      if (response.data?.canCreateLead) {
        const call = calls.find((c) => c.id === id)
        if (call) {
          handleOpenQuickLead(call)
          return
        }
      }

      await loadData(false)
      setActionByCall((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch (e: any) {
      console.error('Failed to finish call:', e)
      alert(e.response?.data?.error || 'Не удалось сохранить результат звонка')
    }
  }

  const handleOpenOrderForm = (call: Call) => {
    const params = new URLSearchParams({
      clientPhone: call.phoneNumber,
      source: WARM_CALLS_SOURCE,
    })
    router.push(`/orders/new?${params.toString()}`)
  }

  const handleOpenQuickLead = (call: Call) => {
    setQuickLeadForm({
      callId: call.id,
      firstName: '',
      lastName: '',
      middleName: '',
      brand: '',
      phone: call.phoneNumber,
      source: WARM_CALLS_SOURCE,
      nextContactDate: getTomorrowNoon(),
      contactPurpose: '',
      notes: '',
    })
    setShowQuickLeadModal(true)
  }

  const handleCreateQuickLead = async () => {
    if (!quickLeadForm.firstName.trim() && !quickLeadForm.lastName.trim()) {
      alert('Укажите хотя бы имя или фамилию клиента')
      return
    }
    if (!quickLeadForm.phone.trim()) {
      alert('Укажите телефон')
      return
    }
    if (!quickLeadForm.nextContactDate) {
      alert('Укажите дату следующего контакта')
      return
    }

    setQuickLeadSubmitting(true)
    try {
      const fullName = [quickLeadForm.lastName, quickLeadForm.firstName, quickLeadForm.middleName]
        .filter(Boolean)
        .join(' ')
        .trim()

      const clientResponse = await api.post('/clients', {
        name: fullName || quickLeadForm.firstName.trim() || quickLeadForm.lastName.trim(),
        phone: quickLeadForm.phone.trim(),
        company: quickLeadForm.brand.trim() || null,
        notes: `Источник: ${quickLeadForm.source}`,
      })

      let description = ''
      if (quickLeadForm.contactPurpose.trim()) {
        description = `Цель контакта: ${quickLeadForm.contactPurpose.trim()}`
      }
      if (quickLeadForm.notes.trim()) {
        description += `${description ? '\n\n' : ''}Заметки: ${quickLeadForm.notes.trim()}`
      }

      const leadResponse = await api.post('/leads', {
        clientId: clientResponse.data.id,
        source: quickLeadForm.source,
        status: 'NEW_LEAD',
        nextContactDate: new Date(quickLeadForm.nextContactDate).toISOString(),
        description: description || null,
      })

      if (quickLeadForm.callId) {
        await api.delete(`/calls/${quickLeadForm.callId}/remove`)
      }

      setShowQuickLeadModal(false)
      await loadData(false)
    } catch (error: any) {
      console.error('Failed to create quick lead:', error)
      alert(error?.response?.data?.error || 'Не удалось создать быстрый лид')
    } finally {
      setQuickLeadSubmitting(false)
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Теплые обзвоны</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Телефон, источник, дата поступления и результат звонка</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Синхронизация...' : 'Синхронизировать из Google Sheets'}</span>
            </button>
            <Link
              href="/calls/stats"
              className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm transition hover:bg-primary-100"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Статистика</span>
            </Link>
            <Link href="/clients" className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
              Закрытые номера
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-primary-50/30 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Фильтры обзвонов</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 shadow-sm">
              Быстрый поиск
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={phoneDate}
              onChange={(e) => setPhoneDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Все источники</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Телефон
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Источник
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Дата поступления
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{call.phoneNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.source || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(call.phoneReceivedAt)}
                    </td>
                    <td className="px-6 py-4 text-sm min-w-[340px]">
                      {(postActionsByCall[call.id]?.showOrder || postActionsByCall[call.id]?.showLead) ? (
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {postActionsByCall[call.id]?.showOrder ? (
                            <button
                              type="button"
                              onClick={() => handleOpenOrderForm(call)}
                              className="inline-flex items-center rounded-xl bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700"
                            >
                              Оформить заказ
                            </button>
                          ) : null}
                          {postActionsByCall[call.id]?.showLead ? (
                            <button
                              type="button"
                              onClick={() => handleOpenQuickLead(call)}
                              className="inline-flex items-center rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700 shadow-sm transition hover:bg-primary-100"
                            >
                              Назначить контакт
                            </button>
                          ) : null}
                        </div>
                      ) : !actionByCall[call.id]?.started ? (
                        <button
                          type="button"
                          onClick={() => handleStartCall(call.id)}
                          className="inline-flex items-center rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
                        >
                          Позвонить
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <select
                            value={actionByCall[call.id]?.status || 'NO_ANSWER'}
                            onChange={(e) =>
                              setActionByCall((prev) => ({
                                ...prev,
                                [call.id]: {
                                  ...prev[call.id],
                                  status: e.target.value,
                                  started: true,
                                },
                              }))
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded"
                          >
                            {statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <textarea
                            value={actionByCall[call.id]?.comment || ''}
                            onChange={(e) =>
                              setActionByCall((prev) => ({
                                ...prev,
                                [call.id]: {
                                  ...prev[call.id],
                                  comment: e.target.value,
                                  started: true,
                                },
                              }))
                            }
                            rows={2}
                            placeholder="Комментарий по звонку"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500">
                              {call.assignedManager
                                ? `Закреплен: ${call.assignedManager.firstName} ${call.assignedManager.lastName}`
                                : 'Без закрепления'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleFinishCall(call.id)}
                              className="inline-flex items-center rounded-xl bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {calls.length === 0 && (
              <div className="text-center py-12 text-gray-500">Нет звонков</div>
            )}
          </div>
        </div>
      </div>

      {showQuickLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Быстрый лид</h3>
              <button
                type="button"
                onClick={() => setShowQuickLeadModal(false)}
                className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Фамилия"
                  value={quickLeadForm.lastName}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Имя"
                  value={quickLeadForm.firstName}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Отчество"
                  value={quickLeadForm.middleName}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, middleName: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Бренд"
                  value={quickLeadForm.brand}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, brand: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Телефон"
                  value={quickLeadForm.phone}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 sm:col-span-2"
                />
                <input
                  type="text"
                  placeholder="Источник"
                  value={quickLeadForm.source}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, source: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="datetime-local"
                  value={quickLeadForm.nextContactDate}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, nextContactDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <textarea
                  rows={2}
                  placeholder="Цель контакта"
                  value={quickLeadForm.contactPurpose}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, contactPurpose: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 sm:col-span-2"
                />
                <textarea
                  rows={3}
                  placeholder="Заметки"
                  value={quickLeadForm.notes}
                  onChange={(e) => setQuickLeadForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 sm:col-span-2"
                />
              </div>
            </div>
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickLeadModal(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCreateQuickLead}
                  disabled={quickLeadSubmitting}
                  className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {quickLeadSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать лид'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
