'use client'

import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { CalendarRange, TrendingUp, Package } from 'lucide-react'

interface DashboardData {
  leads: {
    total: number
    new: number
    converted: number
    conversionRate: string
  }
  orders: {
    total: number
    new: number
    inProduction: number
    ready: number
  }
  tasks: {
    today: number
    overdue: number
  }
  revenue: {
    total: number
  }
}

interface ManagerStat {
  name: string
  shortName: string
  assemblyRevenue: number
  packageRevenue: number
}

const MANAGERS: ManagerStat[] = [
  { name: 'Роман Хрусталёв', shortName: 'Роман', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Гинтарас Палтарацкас', shortName: 'Гинтар', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Георгий Мониава', shortName: 'Георгий', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Антон Федотов', shortName: 'Антон', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Никита Царьков', shortName: 'Никита', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Нариман Алескеров', shortName: 'Нариман', assemblyRevenue: 0, packageRevenue: 0 },
  { name: 'Максим Шалагинов', shortName: 'Максим', assemblyRevenue: 0, packageRevenue: 0 },
]

const YEAR_REVENUE = [
  { month: 'Янв', value: 2950000 },
  { month: 'Фев', value: 3260000 },
  { month: 'Мар', value: 3550000 },
  { month: 'Апр', value: 3720000 },
  { month: 'Май', value: 3860000 },
  { month: 'Июн', value: 4010000 },
  { month: 'Июл', value: 4170000 },
  { month: 'Авг', value: 4320000 },
  { month: 'Сен', value: 4460000 },
  { month: 'Окт', value: 4620000 },
  { month: 'Ноя', value: 4790000 },
  { month: 'Дек', value: 4950000 },
]

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)

const getCurrentMonthInput = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentMonthInput())
  const [plansByPeriod, setPlansByPeriod] = useState<Record<string, Record<string, number>>>({})
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [draftPlans, setDraftPlans] = useState<Record<string, number>>({})

  useEffect(() => {
    loadDashboardData()
    loadSavedPlans()
  }, [])

  const loadSavedPlans = () => {
    try {
      const saved = localStorage.getItem('monthly-manager-plans')
      if (!saved) return
      const parsed = JSON.parse(saved) as Record<string, Record<string, number>>
      setPlansByPeriod(parsed)
    } catch (error) {
      console.error('Failed to read manager plans:', error)
    }
  }

  const savePlan = (name: string, value: number) => {
    const nextPlansByPeriod = {
      ...plansByPeriod,
      [selectedPeriod]: {
        ...(plansByPeriod[selectedPeriod] ?? {}),
        [name]: value,
      },
    }
    setPlansByPeriod(nextPlansByPeriod)
    localStorage.setItem('monthly-manager-plans', JSON.stringify(nextPlansByPeriod))
  }

  const openPlanModal = () => {
    const initialDrafts: Record<string, number> = {}
    MANAGERS.forEach((manager) => {
      initialDrafts[manager.name] = plansForPeriod[manager.name] ?? defaultPlanForManager(manager.name)
    })
    setDraftPlans(initialDrafts)
    setIsPlanModalOpen(true)
  }

  const applyDraftPlans = () => {
    const nextPlansByPeriod = {
      ...plansByPeriod,
      [selectedPeriod]: draftPlans,
    }
    setPlansByPeriod(nextPlansByPeriod)
    localStorage.setItem('monthly-manager-plans', JSON.stringify(nextPlansByPeriod))
    setIsPlanModalOpen(false)
  }

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/analytics/dashboard')
      setData(response.data)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const monthlyRevenue = useMemo(() => {
    const base =
      data?.revenue.total ??
      MANAGERS.reduce(
        (sum, manager) => sum + manager.assemblyRevenue + manager.packageRevenue,
        0
      )
    return selectedPeriod === getCurrentMonthInput() ? base : Math.round(base * 0.9)
  }, [data?.revenue.total, selectedPeriod])

  const plansForPeriod = plansByPeriod[selectedPeriod] ?? {}

  const defaultPlanForManager = (name: string) => {
    const defaults: Record<string, number> = {
      'Роман Хрусталёв': 500000,
      'Гинтарас Палтарацкас': 900000,
      'Георгий Мониава': 1000000,
      'Антон Федотов': 1400000,
      'Никита Царьков': 200000,
      'Нариман Алескеров': 250000,
      'Максим Шалагинов': 50000,
    }
    return defaults[name] ?? 600000
  }

  const managerRows = useMemo(() => {
    return MANAGERS.map((manager) => {
      const salesRevenue = manager.assemblyRevenue + manager.packageRevenue
      const revenue = salesRevenue
      const plan = plansForPeriod[manager.name] ?? defaultPlanForManager(manager.name)
      const percent = plan > 0 ? Number(((revenue / plan) * 100).toFixed(2)) : 0
      return { ...manager, salesRevenue, revenue, plan, percent }
    })
  }, [plansForPeriod])

  const maxTrendValue = Math.max(...YEAR_REVENUE.map((item) => item.value))
  const minTrendValue = Math.min(...YEAR_REVENUE.map((item) => item.value))
  const trendRange = Math.max(maxTrendValue - minTrendValue, 1)

  const getTrendY = (value: number) => {
    // Keep margins top/bottom so line breathes inside chart.
    return 85 - ((value - minTrendValue) / trendRange) * 65
  }

  const trendPoints = YEAR_REVENUE.map((item, index) => {
    const x = (index / (YEAR_REVENUE.length - 1)) * 100
    const y = getTrendY(item.value)
    return `${x},${y}`
  }).join(' ')

  const trendAreaPath = `${trendPoints} 100,92 0,92`

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </Layout>
    )
  }

  const extraStats = [
    { title: 'Общее количество заказов', value: data?.orders.total ?? 214 },
    { title: 'Общее количество обработанных лидов', value: data?.leads.total ?? 487 },
    { title: 'Общее количество теплых обзвонов', value: 326 },
    { title: 'Общее количество лидов с Авито', value: 182 },
    { title: 'Общее количество лидов с Проектных продаж', value: 96 },
    { title: 'Общее количество лидов с сайта', value: 209 },
    { title: 'Общее количество произведенных единиц продукции', value: 1342 },
    { title: 'Средний чек', value: formatMoney(51200) },
    { title: 'Средний цикл сделки', value: '11.2 дня' },
    { title: 'Доля повторных клиентов', value: '34%' },
  ]

  const getCompletionClassName = (percent: number) => {
    if (percent >= 100) return 'bg-emerald-100 text-emerald-800'
    if (percent >= 60) return 'bg-green-100 text-green-800'
    if (percent >= 25) return 'bg-amber-100 text-amber-800'
    return 'bg-rose-100 text-rose-700'
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-b from-primary-50 to-white border border-primary-100 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Главная</h1>
              <p className="text-gray-600 mt-1">Ключевые показатели по продажам и эффективности команды</p>
            </div>
            <label className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 w-fit text-gray-700 shadow-sm">
              <CalendarRange className="h-4 w-4" />
              <input
                type="month"
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-4 py-3 shadow-sm">
            <div className="h-11 w-11 rounded-xl bg-primary-100 flex items-center justify-center">
              <span className="text-primary-700 text-xl font-bold leading-none">₽</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">Общая выручка за период</p>
              <p className="text-3xl font-bold text-gray-900">{formatMoney(monthlyRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-primary-50/70 px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800">Выручка с продаж</h2>
            </div>
            <table className="w-full text-sm">
              {managerRows.map((manager) => (
                <tr key={manager.name} className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors">
                  <td className="px-4 py-2 text-gray-700">{manager.shortName}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(manager.salesRevenue)}</td>
                </tr>
              ))}
              <tr className="bg-gray-100/80 font-semibold">
                <td className="px-4 py-2 text-gray-800">Итого</td>
                <td className="px-4 py-2 text-right text-gray-900">
                  {formatMoney(managerRows.reduce((sum, manager) => sum + manager.salesRevenue, 0))}
                </td>
              </tr>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-primary-50/70 px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800">Выручка с бирок</h2>
            </div>
            <table className="w-full text-sm">
              {managerRows.map((manager) => (
                <tr key={manager.name} className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors">
                  <td className="px-4 py-2 text-gray-700">{manager.shortName}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(manager.assemblyRevenue)}</td>
                </tr>
              ))}
              <tr className="bg-gray-100/80 font-semibold">
                <td className="px-4 py-2 text-gray-800">Итого</td>
                <td className="px-4 py-2 text-right text-gray-900">
                  {formatMoney(managerRows.reduce((sum, manager) => sum + manager.assemblyRevenue, 0))}
                </td>
              </tr>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-primary-50/70 px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800">Выручка с пакетов</h2>
            </div>
            <table className="w-full text-sm">
              {managerRows.map((manager) => (
                <tr key={manager.name} className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors">
                  <td className="px-4 py-2 text-gray-700">{manager.shortName}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(manager.packageRevenue)}</td>
                </tr>
              ))}
              <tr className="bg-gray-100/80 font-semibold">
                <td className="px-4 py-2 text-gray-800">Итого</td>
                <td className="px-4 py-2 text-right text-gray-900">
                  {formatMoney(managerRows.reduce((sum, manager) => sum + manager.packageRevenue, 0))}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-12">
            <div className="col-span-7 bg-primary-50/70 px-4 py-3 border-b border-r border-gray-200">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800">
                План продаж на {selectedPeriod}
              </h2>
            </div>
            <div className="col-span-5 bg-primary-100/70 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800">Выполнение</h2>
              <button
                onClick={openPlanModal}
                className="text-xs font-medium bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                Назначить план
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            {managerRows.map((manager) => (
              <tr key={manager.name} className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/30 transition-colors">
                <td className="px-4 py-2 text-gray-700 w-[28%]">{manager.shortName}</td>
                <td className="px-4 py-2 w-[30%] text-right text-gray-900 font-medium">{formatMoney(manager.plan)}</td>
                <td className="px-4 py-2 text-right w-[42%]">
                  <span className={`inline-flex min-w-[96px] justify-center rounded-md px-2 py-1 font-medium ${getCompletionClassName(manager.percent)}`}>
                    {manager.percent.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
            <tr className="bg-gray-100/80 font-semibold">
              <td className="px-4 py-2 text-gray-800">Итого</td>
              <td className="px-4 py-2 text-right text-gray-900">
                {formatMoney(managerRows.reduce((sum, manager) => sum + manager.plan, 0))}
              </td>
              <td className="px-4 py-2 text-right text-gray-900">
                {(
                  (managerRows.reduce((sum, manager) => sum + manager.revenue, 0) /
                    Math.max(managerRows.reduce((sum, manager) => sum + manager.plan, 0), 1)) *
                  100
                ).toFixed(2)}
                %
              </td>
            </tr>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Тренд выручки за календарный год</h2>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-56">
              <defs>
                <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
                </linearGradient>
              </defs>
              <polyline fill="none" stroke="#d1d5db" strokeWidth="0.6" points="0,92 100,92" />
              <polyline fill="none" stroke="#d1d5db" strokeWidth="0.6" points="0,74 100,74" />
              <polyline fill="none" stroke="#d1d5db" strokeWidth="0.6" points="0,56 100,56" />
              <polyline fill="none" stroke="#d1d5db" strokeWidth="0.6" points="0,38 100,38" />
              <polyline fill="none" stroke="#d1d5db" strokeWidth="0.6" points="0,20 100,20" />
              <polygon fill="url(#trendArea)" points={trendAreaPath} />
              <polyline fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={trendPoints} />
              {YEAR_REVENUE.map((point, index) => {
                const x = (index / (YEAR_REVENUE.length - 1)) * 100
                const y = getTrendY(point.value)
                return <circle key={point.month} cx={x} cy={y} r="1.4" fill="#2563eb" />
              })}
            </svg>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2 mt-2 text-xs text-gray-600">
              {YEAR_REVENUE.map((item) => (
                <div key={item.month} className="text-center">
                  <p>{item.month}</p>
                  <p className="font-medium">{(item.value / 1000000).toFixed(2)} млн</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {extraStats.map((item) => (
            <div key={item.title} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 min-h-[2.5rem]">{item.title}</p>
              <p className="mt-2 text-xl font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500">Прогноз выручки к концу месяца</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{formatMoney(monthlyRevenue * 1.12)}</p>
            <p className="text-sm text-emerald-600 mt-1">+12% при текущем темпе</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500">Загрузка производства</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">78%</p>
            <p className="text-sm text-gray-600 mt-1">Оптимальная зона 70-85%</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-600" />
              <p className="text-sm text-gray-500">Готово к отгрузке</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{data?.orders.ready ?? 39} заказов</p>
            <p className="text-sm text-gray-600 mt-1">В производстве: {data?.orders.inProduction ?? 28}</p>
          </div>
        </div>
      </div>

      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsPlanModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white border border-gray-200 rounded-xl shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Назначить план на {selectedPeriod}</h3>
            </div>
            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
              {MANAGERS.map((manager) => (
                <div key={manager.name} className="grid grid-cols-2 items-center gap-3">
                  <p className="text-sm text-gray-700">{manager.name}</p>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={draftPlans[manager.name] ?? 0}
                    onChange={(event) =>
                      setDraftPlans((prev) => ({
                        ...prev,
                        [manager.name]: Number(event.target.value || 0),
                      }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-right"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={applyDraftPlans}
                className="px-4 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}