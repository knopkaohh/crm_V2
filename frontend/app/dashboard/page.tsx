'use client'

import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { CalendarRange } from 'lucide-react'

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
  /** Активные менеджеры продаж (как на сервере) — порядок и id для планов */
  salesManagers?: Array<{ managerId: string; name: string }>
  currentMonth: {
    ordersTotal: number
    revenueTotal: number
    averageCheck: number
    producedUnitsTotal: number
    leadsTotal: number
    leadsBySource: {
      site: number
      avito: number
      calls: number
      projectSales: number
    }
    managerRevenue: Array<{
      managerId: string
      name: string
      assemblyRevenue: number
      packageRevenue: number
    }>
  }
}

interface ManagerStat {
  managerId?: string
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

/** Сравнение «Иван Петров» / «Петров Иван» для привязки строк таблицы к данным API и сохранения плана по managerId */
function normalizePersonNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('|')
}

/** Все слова более короткого ФИО содержатся в более длинном (отчество в CRM: «Антон Юрьевич Федотов» vs «Антон Федотов»). */
function personNamesMatch(canonicalName: string, apiName: string): boolean {
  const a = canonicalName.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const b = apiName.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (a.length === 0 || b.length === 0) return false
  if (normalizePersonNameKey(canonicalName) === normalizePersonNameKey(apiName)) return true
  const sa = new Set(a)
  const sb = new Set(b)
  if (a.length >= 2 && a.every((t) => sb.has(t))) return true
  if (b.length >= 2 && b.every((t) => sa.has(t))) return true
  return false
}

function findMatchingApiManager<
  T extends { managerId: string; name: string },
>(apiManagers: T[], candidateDisplayName: string): T | undefined {
  return apiManagers.find((m) => personNamesMatch(candidateDisplayName, m.name))
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
  }, [])

  useEffect(() => {
    loadPlansForPeriod(selectedPeriod)
  }, [selectedPeriod])

  const getManagerPlanKey = (manager: { managerId?: string; name: string }) => manager.managerId || manager.name

  const loadPlansForPeriod = async (period: string) => {
    try {
      const response = await api.get('/analytics/manager-plans', {
        params: { period },
        headers: { 'X-Skip-Cache': 'true' },
      })
      const entries = Array.isArray(response.data?.plans) ? response.data.plans : []
      const mapped = entries.reduce((acc: Record<string, number>, item: { managerId: string; planAmount: number }) => {
        acc[item.managerId] = Number(item.planAmount || 0)
        return acc
      }, {})
      setPlansByPeriod((prev) => ({ ...prev, [period]: mapped }))
    } catch (error) {
      console.error('Failed to load manager plans:', error)
      setPlansByPeriod((prev) => ({ ...prev, [period]: prev[period] ?? {} }))
    }
  }

  const openPlanModal = () => {
    const initialDrafts: Record<string, number> = {}
    managerRows.forEach((manager) => {
      const key = getManagerPlanKey(manager)
      initialDrafts[key] =
        plansForPeriod[key] ?? manager.plan ?? defaultPlanForManager(manager.name)
    })
    setDraftPlans(initialDrafts)
    setIsPlanModalOpen(true)
  }

  const resolveManagerIdForPlan = (manager: {
    managerId?: string
    name: string
  }): string | undefined => {
    if (manager.managerId) return manager.managerId
    const fromRegistry = data?.salesManagers?.find((m) => personNamesMatch(manager.name, m.name))
    if (fromRegistry) return fromRegistry.managerId
    const fromRevenue = data?.currentMonth?.managerRevenue?.find((m) =>
      personNamesMatch(manager.name, m.name),
    )
    return fromRevenue?.managerId
  }

  const applyDraftPlans = async () => {
    const payloadPlans = managerRows
      .map((manager) => {
        const managerId = resolveManagerIdForPlan(manager)
        if (!managerId) return null
        const key = getManagerPlanKey(manager)
        return {
          managerId,
          planAmount: Number(draftPlans[key] ?? 0),
        }
      })
      .filter((row): row is { managerId: string; planAmount: number } => row !== null)

    if (payloadPlans.length === 0) {
      alert(
        'Не удалось определить id менеджеров для сохранения плана. Обновите страницу или войдите под руководителем/администратором.',
      )
      return
    }

    try {
      const saveRes = await api.post('/analytics/manager-plans', {
        period: selectedPeriod,
        plans: payloadPlans,
      })
      const saved = Array.isArray(saveRes.data?.plans) ? saveRes.data.plans : []
      const mappedFromSave = saved.reduce(
        (acc: Record<string, number>, item: { managerId: string; planAmount: number }) => {
          acc[item.managerId] = Number(item.planAmount ?? 0)
          return acc
        },
        {},
      )
      setPlansByPeriod((prev) => ({ ...prev, [selectedPeriod]: mappedFromSave }))
      await loadPlansForPeriod(selectedPeriod)
      setIsPlanModalOpen(false)
    } catch (error: unknown) {
      console.error('Failed to save manager plans:', error)
      const ax = error as { response?: { data?: { error?: string }; status?: number } }
      const msg =
        ax.response?.data?.error ||
        (ax.response?.status === 403
          ? 'Недостаточно прав: назначать план могут только руководитель и администратор'
          : 'Не удалось сохранить план')
      alert(msg)
    }
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

  const monthlyRevenue = useMemo(() => data?.currentMonth.revenueTotal ?? 0, [data?.currentMonth.revenueTotal])

  const plansForPeriod = plansByPeriod[selectedPeriod] ?? {}

  const defaultPlanForManager = (name: string) => {
    const defaults: Record<string, number> = {
      'Роман Хрусталёв': 500000,
      'Гинтарас Палтарацкас': 900000,
      'Георгий Мониава': 1000000,
      'Антон Федотов': 1600000,
      'Никита Царьков': 200000,
      'Нариман Алескеров': 250000,
      'Максим Шалагинов': 50000,
    }
    return defaults[name] ?? 600000
  }

  const managerRows = useMemo(() => {
    const managerRevenueFromApi = data?.currentMonth.managerRevenue ?? []
    const apiByManagerId = managerRevenueFromApi.reduce((acc, manager) => {
      acc[manager.managerId] = manager
      return acc
    }, {} as Record<string, (typeof managerRevenueFromApi)[number]>)

    /** Реестр из API нужен для id при сохранении планов; строки таблицы всегда строим из MANAGERS + выручка,
     * иначе при непустом salesManagers пропадали менеджеры, которых нет в этой выборке БД. */
    const registry = data?.salesManagers ?? []

    const apiManagersList = Object.values(apiByManagerId)

    const baseRows = MANAGERS.map((manager) => {
      const apiManager = findMatchingApiManager(apiManagersList, manager.name)
      const fromRegistry = registry.find((m) => personNamesMatch(manager.name, m.name))
      /** Без id ключ плана — имя, а в БД планы по uuid → после сохранения цифры «не меняются». */
      const resolvedManagerId = apiManager?.managerId ?? fromRegistry?.managerId

      const assemblyRevenue = apiManager?.assemblyRevenue ?? manager.assemblyRevenue
      const packageRevenue = apiManager?.packageRevenue ?? manager.packageRevenue
      const salesRevenue = assemblyRevenue + packageRevenue
      const revenue = salesRevenue
      const key = getManagerPlanKey({ managerId: resolvedManagerId, name: manager.name })
      const plan = plansForPeriod[key] ?? defaultPlanForManager(manager.name)
      const percent = plan > 0 ? Number(((revenue / plan) * 100).toFixed(2)) : 0
      return {
        ...manager,
        managerId: resolvedManagerId,
        assemblyRevenue,
        packageRevenue,
        salesRevenue,
        revenue,
        plan,
        percent,
      }
    })

    const extraRows = managerRevenueFromApi
      .filter((manager) => !MANAGERS.some((fixed) => personNamesMatch(fixed.name, manager.name)))
      .map((manager) => {
        const salesRevenue = manager.assemblyRevenue + manager.packageRevenue
        const plan = plansForPeriod[manager.managerId] ?? defaultPlanForManager(manager.name)
        const percent = plan > 0 ? Number(((salesRevenue / plan) * 100).toFixed(2)) : 0
        return {
          managerId: manager.managerId,
          name: manager.name,
          shortName: manager.name.split(' ')[0] || manager.name,
          assemblyRevenue: manager.assemblyRevenue,
          packageRevenue: manager.packageRevenue,
          salesRevenue,
          revenue: salesRevenue,
          plan,
          percent,
        }
      })

    const merged = [...baseRows, ...extraRows]
    const coveredIds = new Set(merged.map((r) => r.managerId).filter(Boolean) as string[])

    for (const sm of registry) {
      if (sm.managerId && coveredIds.has(sm.managerId)) continue
      if (merged.some((r) => personNamesMatch(r.name, sm.name))) continue
      coveredIds.add(sm.managerId)
      const rev = apiByManagerId[sm.managerId]
      const assemblyRevenue = rev?.assemblyRevenue ?? 0
      const packageRevenue = rev?.packageRevenue ?? 0
      const salesRevenue = assemblyRevenue + packageRevenue
      const plan = plansForPeriod[sm.managerId] ?? defaultPlanForManager(sm.name)
      const percent = plan > 0 ? Number(((salesRevenue / plan) * 100).toFixed(2)) : 0
      const shortName = sm.name.trim().split(/\s+/)[0] || sm.name
      merged.push({
        managerId: sm.managerId,
        name: sm.name,
        shortName,
        assemblyRevenue,
        packageRevenue,
        salesRevenue,
        revenue: salesRevenue,
        plan,
        percent,
      })
    }

    return merged
  }, [data?.salesManagers, data?.currentMonth.managerRevenue, plansForPeriod])

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
    { title: 'Общее кол-во заказов', value: data?.currentMonth.ordersTotal ?? 0 },
    { title: 'Средний чек', value: formatMoney(data?.currentMonth.averageCheck ?? 0) },
    { title: 'Всего произведено единиц', value: data?.currentMonth.producedUnitsTotal ?? 0 },
    { title: 'Общее кол-во лидов', value: data?.currentMonth.leadsTotal ?? 0 },
    { title: 'Лиды с сайта', value: data?.currentMonth.leadsBySource.site ?? 0 },
    { title: 'Лиды с Авито', value: data?.currentMonth.leadsBySource.avito ?? 0 },
    { title: 'Лиды с обзвонов', value: data?.currentMonth.leadsBySource.calls ?? 0 },
    { title: 'Лиды с проектных продаж', value: data?.currentMonth.leadsBySource.projectSales ?? 0 },
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
              <p className="text-sm text-gray-600">Общая выручка за текущий месяц</p>
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
                <tr
                  key={manager.managerId ?? manager.name}
                  className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors"
                >
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
                <tr
                  key={manager.managerId ?? manager.name}
                  className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors"
                >
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
                <tr
                  key={manager.managerId ?? manager.name}
                  className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/40 transition-colors"
                >
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
              <tr
                key={manager.managerId ?? manager.name}
                className="border-b border-gray-100 even:bg-gray-50/40 hover:bg-primary-50/30 transition-colors"
              >
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {extraStats.map((item) => (
            <div key={item.title} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 min-h-[2.5rem]">{item.title}</p>
              <p className="mt-2 text-xl font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
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
              {managerRows.map((manager) => (
                <div key={manager.managerId ?? manager.name} className="grid grid-cols-2 items-center gap-3">
                  <p className="text-sm text-gray-700">{manager.name}</p>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={draftPlans[getManagerPlanKey(manager)] ?? 0}
                    onChange={(event) =>
                      setDraftPlans((prev) => ({
                        ...prev,
                        [getManagerPlanKey(manager)]: Number(event.target.value || 0),
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