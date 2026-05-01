'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { BarChart3 } from 'lucide-react'

interface CallStats {
  managerId: string
  managerName: string
  total: number
  WILL_ORDER: number
  HOT_CONTACT: number
  NO_ANSWER: number
  REPLACEMENT: number
  NOT_OUR_CLIENT: number
  CONVERTED_TO_LEAD: number
}

type DateRangePreset = 'today' | 'week' | 'month' | 'custom'

const formatDateInput = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getTodayRange = () => {
  const today = new Date()
  const value = formatDateInput(today)
  return { dateFrom: value, dateTo: value }
}

const getWeekRange = () => {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - 6)
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(today) }
}

const getMonthRange = () => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(today) }
}

export default function CallsStatsPage() {
  const todayRange = getTodayRange()
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(todayRange.dateFrom)
  const [dateTo, setDateTo] = useState(todayRange.dateTo)
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today')
  const [stats, setStats] = useState<CallStats[]>([])

  useEffect(() => {
    void loadStats()
  }, [dateFrom, dateTo])

  const loadStats = async () => {
    setLoading(true)
    try {
      const response = await api.get('/calls/stats/summary', {
        params: { dateFrom, dateTo },
      })
      setStats(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load cold calls stats:', error)
      alert('Не удалось загрузить статистику')
    } finally {
      setLoading(false)
    }
  }

  const setPresetRange = (preset: DateRangePreset) => {
    setDatePreset(preset)
    if (preset === 'custom') {
      return
    }

    if (preset === 'today') {
      const range = getTodayRange()
      setDateFrom(range.dateFrom)
      setDateTo(range.dateTo)
      return
    }

    if (preset === 'week') {
      const range = getWeekRange()
      setDateFrom(range.dateFrom)
      setDateTo(range.dateTo)
      return
    }

    const range = getMonthRange()
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Статистика обзвонов</h1>
            <p className="text-gray-600">
              Сводка по менеджерам и статусам холодных звонков
            </p>
          </div>
          <Link
            href="/calls"
            className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Назад к обзвонам
          </Link>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-primary-50/30 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Фильтры статистики</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 shadow-sm">
              Период
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPresetRange('today')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                datePreset === 'today'
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('week')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                datePreset === 'week'
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              За неделю
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('month')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                datePreset === 'month'
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              За месяц
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('custom')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                datePreset === 'custom'
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Свой период
            </button>
          </div>
          {datePreset === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          {datePreset !== 'custom' && (
            <p className="mt-3 text-xs text-gray-500">
              Период: {dateFrom} — {dateTo}
            </p>
          )}
          {datePreset === 'custom' && (
            <p className="mt-3 text-xs text-gray-500">
              Выберите диапазон вручную
            </p>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => loadStats()}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Обновить
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {!stats.length ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <BarChart3 className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                <p className="font-medium text-gray-700">Нет данных за выбранный период</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Менеджер</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Всего</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Оформит заказ</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Горячий</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Недозвон</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Замена</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Не наш клиент</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {stats.map((item) => (
                        <tr key={item.managerId} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">{item.managerName}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.total}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.WILL_ORDER}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.HOT_CONTACT}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.NO_ANSWER}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.REPLACEMENT}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.NOT_OUR_CLIENT}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
