'use client'

import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { BarChart3, Download, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react'

interface ManagerReport {
  manager: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  leads: number
  convertedLeads: number
  conversionRate: string
  orders: number
  revenue: number
}

export default function AnalyticsPage() {
  const [report, setReport] = useState<ManagerReport[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadReport()
  }, [])

  const loadReport = async () => {
    try {
      const params: any = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate

      const response = await api.get('/analytics/managers', { params })
      setReport(response.data)
    } catch (error) {
      console.error('Failed to load analytics:', error)
      alert('Ошибка при загрузке аналитики')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (type: 'excel' | 'csv', dataType: 'leads' | 'orders') => {
    try {
      const params: any = { type: dataType }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate

      const response = await api.get(`/analytics/export/${type}`, {
        params,
        responseType: 'blob',
      })

      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${dataType}-${new Date().toISOString().split('T')[0]}.${type === 'excel' ? 'xlsx' : 'csv'}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Ошибка при экспорте')
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

  const totalRevenue = report.reduce((sum, r) => sum + r.revenue, 0)
  const totalLeads = report.reduce((sum, r) => sum + r.leads, 0)
  const totalOrders = report.reduce((sum, r) => sum + r.orders, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Аналитика</h1>
            <p className="text-gray-600 mt-1">Отчеты по менеджерам и продажам</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата начала
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата окончания
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={loadReport}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Применить фильтр
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Общая выручка</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                  }).format(totalRevenue)}
                </p>
              </div>
              <DollarSign className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Всего лидов</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{totalLeads}</p>
              </div>
              <TrendingUp className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Всего заказов</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{totalOrders}</p>
              </div>
              <BarChart3 className="h-12 w-12 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Экспорт данных</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => handleExport('excel', 'leads')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Экспорт лидов (Excel)</span>
            </button>
            <button
              onClick={() => handleExport('csv', 'leads')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Экспорт лидов (CSV)</span>
            </button>
            <button
              onClick={() => handleExport('excel', 'orders')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Экспорт заказов (Excel)</span>
            </button>
            <button
              onClick={() => handleExport('csv', 'orders')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Экспорт заказов (CSV)</span>
            </button>
          </div>
        </div>

        {/* Managers Report */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Отчет по менеджерам</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Менеджер
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Лиды
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Преобразовано
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Конверсия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Заказы
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Выручка
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {report.map((item) => (
                  <tr key={item.manager.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.manager.firstName} {item.manager.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{item.manager.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.leads}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.convertedLeads}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {item.conversionRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.orders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {new Intl.NumberFormat('ru-RU', {
                        style: 'currency',
                        currency: 'RUB',
                      }).format(item.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.length === 0 && (
              <div className="text-center py-12 text-gray-500">Нет данных</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}







