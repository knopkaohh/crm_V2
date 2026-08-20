'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import {
  SALES_REPORT_CHANNEL_GROUPS,
  SALES_REPORT_CHANNELS,
  SALES_REPORT_CHANNEL_LABELS,
  formatDateRu,
  formatPeriodLabel,
  getCurrentMonthInput,
  todayDateInput,
  type SalesReportChannelId,
} from '@/lib/sales-report'
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Plus,
  UserRound,
  X,
  Trash2,
} from 'lucide-react'

interface ChannelStat {
  channel: string
  label: string
  applications: number
  interested: number
  orders: number
  conversionPercent: number
}

interface DayRow {
  date: string
  channels: ChannelStat[]
  totals: {
    applications: number
    interested: number
    orders: number
    conversionPercent: number
  }
}

interface ManagerBlock {
  managerId: string
  firstName: string
  lastName: string
  monthTotals: {
    applications: number
    interested: number
    orders: number
    conversionPercent: number
  }
  days: DayRow[]
}

interface DashboardPayload {
  period: string
  summary: {
    totalApplications: number
    totalInterested: number
    totalOrders: number
    conversionPercent: number
    byChannel: ChannelStat[]
  }
  managers: ManagerBlock[]
}

interface Participant {
  id: string
  firstName: string
  lastName: string
  email: string
}

type ViewMode = 'all' | 'my'

interface FormEntry {
  channel: SalesReportChannelId
  applications: string
  interested: string
  orders: string
}

function emptyFormEntries(): FormEntry[] {
  return SALES_REPORT_CHANNELS.map((channel) => ({
    channel,
    applications: '0',
    interested: '0',
    orders: '0',
  }))
}

export default function SalesReportPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentMonthInput())
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [managerFilter, setManagerFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set())
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportDate, setReportDate] = useState(todayDateInput())
  const [formEntries, setFormEntries] = useState<FormEntry[]>(emptyFormEntries())
  const [formCanEdit, setFormCanEdit] = useState(true)
  const [savingReport, setSavingReport] = useState(false)
  const [deletingDayKey, setDeletingDayKey] = useState<string | null>(null)

  const isAdmin = currentUser?.role === 'ADMIN'

  useEffect(() => {
    void auth.getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null))
    void api.get('/sales-reports/participants').then((res) => setParticipants(res.data ?? []))
  }, [])

  const isParticipant = useMemo(
    () => participants.some((p) => p.id === currentUser?.id),
    [participants, currentUser?.id],
  )

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { period: selectedPeriod }
      if (viewMode === 'my' && currentUser?.id) {
        params.managerId = currentUser.id
      } else if (managerFilter !== 'all') {
        params.managerId = managerFilter
      }
      if (channelFilter !== 'all') params.channel = channelFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo

      const res = await api.get('/sales-reports/dashboard', {
        params,
        headers: { 'X-Skip-Cache': 'true' },
      })
      setData(res.data)
    } catch (e) {
      console.error('Failed to load sales dashboard:', e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedPeriod, viewMode, currentUser?.id, managerFilter, channelFilter, dateFrom, dateTo])

  useEffect(() => {
    if (viewMode === 'my' && !currentUser) return
    loadDashboard()
  }, [loadDashboard, viewMode, currentUser])

  const openReportModal = async () => {
    const date = todayDateInput()
    setReportDate(date)
    setReportModalOpen(true)
    try {
      const res = await api.get('/sales-reports/day', { params: { date } })
      const entries = res.data?.entries ?? []
      setFormCanEdit(Boolean(res.data?.canEdit))
      setFormEntries(
        SALES_REPORT_CHANNELS.map((ch) => {
          const row = entries.find((e: { channel: string }) => e.channel === ch)
          return {
            channel: ch,
            applications: String(row?.applications ?? 0),
            interested: String(row?.interested ?? 0),
            orders: String(row?.orders ?? 0),
          }
        }),
      )
    } catch {
      setFormEntries(emptyFormEntries())
      setFormCanEdit(true)
    }
  }

  const loadFormForDate = async (date: string) => {
    try {
      const res = await api.get('/sales-reports/day', { params: { date } })
      const entries = res.data?.entries ?? []
      setFormCanEdit(Boolean(res.data?.canEdit))
      setFormEntries(
        SALES_REPORT_CHANNELS.map((ch) => {
          const row = entries.find((e: { channel: string }) => e.channel === ch)
          return {
            channel: ch,
            applications: String(row?.applications ?? 0),
            interested: String(row?.interested ?? 0),
            orders: String(row?.orders ?? 0),
          }
        }),
      )
    } catch {
      setFormCanEdit(false)
    }
  }

  const handleSaveReport = async () => {
    setSavingReport(true)
    try {
      const entries = formEntries.map((e) => ({
        channel: e.channel,
        applications: parseInt(e.applications, 10) || 0,
        interested: parseInt(e.interested, 10) || 0,
        orders: parseInt(e.orders, 10) || 0,
      }))
      await api.post('/sales-reports', { date: reportDate, entries })
      setReportModalOpen(false)
      await loadDashboard()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Не удалось сохранить отчёт')
    } finally {
      setSavingReport(false)
    }
  }

  const periodLabel =
    selectedPeriod === getCurrentMonthInput()
      ? 'Текущий месяц'
      : formatPeriodLabel(selectedPeriod)

  const summary = data?.summary

  const toggleManager = (id: string) => {
    setExpandedManagers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleDeleteDayReport = async (managerId: string, date: string, managerName: string) => {
    if (
      !confirm(
        `Удалить отчёт ${formatDateRu(date)} для ${managerName}?\n\nВсе данные за этот день будут удалены.`,
      )
    ) {
      return
    }
    const dayKey = `${managerId}-${date}`
    setDeletingDayKey(dayKey)
    try {
      await api.delete('/sales-reports/day', { params: { managerId, date } })
      await loadDashboard()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Не удалось удалить отчёт')
    } finally {
      setDeletingDayKey(null)
    }
  }

  if (loading && !data) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Отчёт по продажам</h1>
            </div>
            <p className="text-sm text-gray-600 mt-0.5 ml-9">
              {periodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <CalendarRange className="h-4 w-4 text-gray-500" />
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="text-sm border-0 bg-transparent focus:ring-0 text-gray-800"
              />
            </div>
            <button
              type="button"
              onClick={() => setViewMode('my')}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                viewMode === 'my'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Мой отчёт
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('all')
                setManagerFilter('all')
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                viewMode === 'all'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Все менеджеры
            </button>
            {isParticipant && (
              <button
                type="button"
                onClick={() => void openReportModal()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Добавить отчёт
              </button>
            )}
          </div>
        </div>

        {/* KPI + каналы — компактный блок */}
        {summary && (
          <div className="flex-shrink-0 space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Заявки</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mt-1">
                  {summary.totalApplications.toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Заинтересованные
                </p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mt-1">
                  {summary.totalInterested.toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Заказы</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mt-1">
                  {summary.totalOrders.toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-primary-700 uppercase tracking-wide">
                  Конверсия
                </p>
                <p className="text-2xl font-bold text-primary-800 tabular-nums leading-tight mt-1">
                  {summary.conversionPercent}%
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                По каналам
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
                {summary.byChannel.map((ch) => (
                  <div
                    key={ch.channel}
                    className="rounded-lg border border-gray-100 bg-gray-50/90 px-2.5 py-2 min-w-0"
                  >
                    <p className="text-xs font-medium text-gray-600 leading-tight truncate" title={ch.label}>
                      {ch.label}
                    </p>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <span className="text-base font-bold text-gray-900 tabular-nums">{ch.applications}</span>
                      <span className="text-xs font-semibold text-primary-700">{ch.conversionPercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 flex-shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <label className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-gray-400" />
            <select
              value={viewMode === 'my' ? currentUser?.id ?? 'all' : managerFilter}
              disabled={viewMode === 'my'}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-300 rounded-xl bg-white"
            >
              <option value="all">Все менеджеры</option>
              {participants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
          </label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-300 rounded-xl bg-white"
          >
            <option value="all">Все каналы</option>
            {SALES_REPORT_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {SALES_REPORT_CHANNEL_LABELS[ch]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-300 rounded-xl"
            placeholder="С"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-300 rounded-xl"
            placeholder="По"
          />
        </div>

        {/* Managers table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-lg shadow-primary-900/5 flex flex-col max-h-[48vh] min-h-[280px]">
          <div className="flex-1 min-h-0 overflow-auto">
          {!data?.managers?.length ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              Нет данных за выбранный период
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.managers.map((manager) => {
                const open = expandedManagers.has(manager.managerId)
                const name = `${manager.firstName} ${manager.lastName}`
                return (
                  <div key={manager.managerId}>
                    <button
                      type="button"
                      onClick={() => toggleManager(manager.managerId)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      {open ? (
                        <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          за месяц: {manager.monthTotals.applications} заявок ·{' '}
                          {manager.monthTotals.interested} заинт. · конверсия{' '}
                          {manager.monthTotals.conversionPercent}%
                        </p>
                      </div>
                      <div className="text-right text-sm tabular-nums text-gray-700 shrink-0">
                        <span className="font-semibold">{manager.monthTotals.orders}</span> заказов
                      </div>
                    </button>
                    {open && (
                      <div className="px-5 pb-4 bg-gray-50/50">
                        {manager.days.length === 0 ? (
                          <p className="text-sm text-gray-500 py-3">Нет дневных отчётов</p>
                        ) : (
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="text-xs uppercase tracking-wide text-gray-500">
                                <th className="py-2 pr-3 text-left w-8" />
                                <th className="py-2 pr-3 text-left">Дата</th>
                                <th className="py-2 pr-3 text-right">Заявки</th>
                                <th className="py-2 pr-3 text-right">Заинтерес.</th>
                                <th className="py-2 pr-3 text-right">Заказы</th>
                                <th className="py-2 pr-3 text-right">Конверсия</th>
                                {isAdmin && <th className="py-2 w-10" aria-label="Удалить" />}
                              </tr>
                            </thead>
                            <tbody>
                              {manager.days.map((day) => {
                                const dayKey = `${manager.managerId}-${day.date}`
                                const dayOpen = expandedDays.has(dayKey)
                                return (
                                  <Fragment key={dayKey}>
                                    <tr className="border-t border-gray-100 hover:bg-white/80">
                                      <td className="py-2 pr-2">
                                        <button
                                          type="button"
                                          onClick={() => toggleDay(dayKey)}
                                          className="p-1 rounded hover:bg-gray-200"
                                        >
                                          {dayOpen ? (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </td>
                                      <td className="py-2 pr-3 font-medium text-gray-800">
                                        {formatDateRu(day.date)}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums">
                                        {day.totals.applications}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums">
                                        {day.totals.interested}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums">
                                        {day.totals.orders}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums font-medium text-primary-700">
                                        {day.totals.conversionPercent}%
                                      </td>
                                      {isAdmin && (
                                        <td className="py-2 text-right">
                                          <button
                                            type="button"
                                            disabled={deletingDayKey === dayKey}
                                            onClick={() =>
                                              void handleDeleteDayReport(manager.managerId, day.date, name)
                                            }
                                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                            title="Удалить отчёт за день"
                                          >
                                            {deletingDayKey === dayKey ? (
                                              <div className="h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <Trash2 className="h-4 w-4" />
                                            )}
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                    {dayOpen &&
                                      day.channels
                                        .filter((c) => c.applications > 0 || c.orders > 0 || c.interested > 0)
                                        .map((ch) => (
                                          <tr
                                            key={`${dayKey}-${ch.channel}`}
                                            className="bg-white/60 text-xs text-gray-600"
                                          >
                                            <td />
                                            <td className="py-1.5 pr-3 pl-2">{ch.label}</td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">
                                              {ch.applications}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">
                                              {ch.interested}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">
                                              {ch.orders}
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums">
                                              {ch.conversionPercent}%
                                            </td>
                                            {isAdmin && <td />}
                                          </tr>
                                        ))}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Report modal */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingReport && setReportModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Дневной отчёт</h3>
                <p className="text-sm text-gray-500">Заявки, заинтересованные и заказы по каналам</p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Дата отчёта</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => {
                    setReportDate(e.target.value)
                    void loadFormForDate(e.target.value)
                  }}
                  className="mt-1 w-full py-2 px-3 border border-gray-300 rounded-xl text-sm"
                />
              </label>
              {!formCanEdit && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Эту дату можно редактировать только администратору или руководителю
                </p>
              )}
              {SALES_REPORT_CHANNEL_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    {group.title}
                  </h4>
                  <div className="space-y-2">
                    {group.channels.map((chId) => {
                      const idx = formEntries.findIndex((e) => e.channel === chId)
                      const entry = formEntries[idx]
                      if (!entry) return null
                      const displayLabel = SALES_REPORT_CHANNEL_LABELS[chId]
                      return (
                        <div
                          key={chId}
                          className="grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-2 items-center rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2"
                        >
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {displayLabel}
                          </span>
                          <input
                            type="number"
                            min={0}
                            disabled={!formCanEdit}
                            value={entry.applications}
                            onChange={(e) => {
                              const next = [...formEntries]
                              next[idx] = { ...entry, applications: e.target.value }
                              setFormEntries(next)
                            }}
                            className="py-1.5 px-2 text-sm border border-gray-300 rounded-lg text-center"
                            placeholder="Заявки"
                          />
                          <input
                            type="number"
                            min={0}
                            disabled={!formCanEdit}
                            value={entry.interested}
                            onChange={(e) => {
                              const next = [...formEntries]
                              next[idx] = { ...entry, interested: e.target.value }
                              setFormEntries(next)
                            }}
                            className="py-1.5 px-2 text-sm border border-gray-300 rounded-lg text-center"
                            placeholder="Заинт."
                          />
                          <input
                            type="number"
                            min={0}
                            disabled={!formCanEdit}
                            value={entry.orders}
                            onChange={(e) => {
                              const next = [...formEntries]
                              next[idx] = { ...entry, orders: e.target.value }
                              setFormEntries(next)
                            }}
                            className="py-1.5 px-2 text-sm border border-gray-300 rounded-lg text-center"
                            placeholder="Заказы"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!formCanEdit || savingReport}
                onClick={() => void handleSaveReport()}
                className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50"
              >
                {savingReport ? 'Сохранение…' : 'Сохранить отчёт'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
