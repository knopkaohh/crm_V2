'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Package, 
  Calendar as CalendarIcon,
  ArrowLeft,
  Info,
  X
} from 'lucide-react'

interface OrderItem {
  id: string
  name: string
  quantity: number
  material: string | null
  productionStartDate: string
  productionEndDate: string
  productionComments: string | null
  order: {
    id: string
    orderNumber: string
    status: string
    client: {
      id: string
      name: string
      company: string | null
    }
    manager: {
      id: string
      firstName: string
      lastName: string
    } | null
  }
}

interface DayItem {
  id: string
  name: string
  quantity: number
  material: string | null
  productionComments: string | null
  baseColor: string | null
  printColor: string | null
  cutting: string | null
  productionStartDate: string
  productionEndDate: string
  order: {
    id: string
    orderNumber: string
    client: {
      name: string
      company: string | null
      phone: string | null
    }
    manager: {
      firstName: string
      lastName: string
    } | null
  }
}

export default function ProductionCalendarPage() {
  const router = useRouter()
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ourProductionOnly, setOurProductionOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<'production' | 'readiness'>('production')
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    return monday
  })
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayItems, setDayItems] = useState<DayItem[]>([])
  const [loadingDay, setLoadingDay] = useState(false)

  const loadCalendarData = async () => {
    try {
      setLoading(true)
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0)
      
      const params: any = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }
      
      if (ourProductionOnly) {
        params.ourProduction = 'true'
      }
      
      const response = await api.get('/production-calendar', { params })
      setItems(response.data)
    } catch (error) {
      console.error('Failed to load calendar data:', error)
      alert('Ошибка при загрузке данных календаря')
    } finally {
      setLoading(false)
    }
  }

  const loadDayData = async (date: string) => {
    try {
      setLoadingDay(true)
      const params: any = {}
      if (ourProductionOnly) {
        params.ourProduction = 'true'
      }
      const response = await api.get(`/production-calendar/day/${date}`, { params })
      
      if (activeTab === 'readiness') {
        const filtered = response.data.filter((item: DayItem) => {
          const endDate = new Date(item.productionEndDate).toISOString().split('T')[0]
          return endDate === date
        })
        setDayItems(filtered)
      } else {
        setDayItems(response.data)
      }
    } catch (error) {
      console.error('Failed to load day data:', error)
      alert('Ошибка при загрузке данных за день')
    } finally {
      setLoadingDay(false)
    }
  }

  useEffect(() => {
    loadCalendarData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, ourProductionOnly])

  useEffect(() => {
    if (selectedDate) {
      loadDayData(selectedDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, ourProductionOnly, activeTab])

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    setCurrentWeekStart(monday)
  }

  const goToPreviousWeek = () => {
    const newWeek = new Date(currentWeekStart)
    newWeek.setDate(newWeek.getDate() - 7)
    setCurrentWeekStart(newWeek)
  }

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeekStart)
    newWeek.setDate(newWeek.getDate() + 7)
    setCurrentWeekStart(newWeek)
  }

  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart)
      day.setDate(currentWeekStart.getDate() + i)
      days.push(day)
    }
    return days
  }, [currentWeekStart])

  const weekRangeLabel = useMemo(() => {
    const start = currentWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const end = new Date(currentWeekStart)
    end.setDate(currentWeekStart.getDate() + 6)
    const endStr = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${start} - ${endStr}`
  }, [currentWeekStart])

  const monthLabel = currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7
    
    const days: (Date | null)[] = []
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    
    return days
  }, [currentMonth])

  const getMaterialColor = (material: string | null): string => {
    if (!material) return 'bg-gray-400'
    
    const colors: Record<string, string> = {
      'Сатин классический': 'bg-blue-500',
      'Сатин премиум': 'bg-indigo-500',
      'Силикон': 'bg-purple-500',
      'Нейлон': 'bg-pink-500',
      'Хлопок': 'bg-green-500',
      'Жаккард': 'bg-yellow-500',
      'Картон': 'bg-orange-500',
      'ZIP-Lock пакет': 'bg-teal-500'
    }
    
    return colors[material] || 'bg-gray-400'
  }

  const formatDateKey = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const isToday = (date: Date): boolean => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/orders')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Производственный календарь
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-1">
                Планирование и контроль производства
              </p>
            </div>
          </div>
          <button
            onClick={() => setOurProductionOnly(!ourProductionOnly)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
              ourProductionOnly
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Filter className="h-5 w-5" />
            <span>Наше производство</span>
          </button>
        </div>

        <div className="rounded-lg shadow border surface">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('production')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'production'
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-b-2 border-primary-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              📅 Производство (по неделям)
            </button>
            <button
              onClick={() => setActiveTab('readiness')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'readiness'
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border-b-2 border-primary-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              ✅ Готовность (по месяцам)
            </button>
          </div>
        </div>

        <div className="rounded-lg shadow p-4 border surface">
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-5 w-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Материалы</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { name: 'Сатин классический', color: 'bg-blue-500' },
              { name: 'Сатин премиум', color: 'bg-indigo-500' },
              { name: 'Силикон', color: 'bg-purple-500' },
              { name: 'Нейлон', color: 'bg-pink-500' },
              { name: 'Хлопок', color: 'bg-green-500' },
              { name: 'Жаккард', color: 'bg-yellow-500' },
              { name: 'Картон', color: 'bg-orange-500' },
              { name: 'ZIP-Lock', color: 'bg-teal-500' }
            ].map(({ name, color }) => (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${color}`} />
                <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {activeTab === 'production' && (
          <div className="rounded-lg shadow border surface">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={goToPreviousWeek}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <h2 className="text-xl font-bold">{weekRangeLabel}</h2>
                <button
                  onClick={goToNextWeek}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>

              <div className="flex justify-center mb-4">
                <button
                  onClick={goToToday}
                  className="px-4 py-2 text-sm bg-primary-100 text-primary-700 hover:bg-primary-200 rounded-lg font-medium transition-colors"
                >
                  Текущая неделя
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-300 dark:border-gray-600 p-3 text-left font-bold">
                        Бренд
                      </th>
                      {weekDays.map((day, idx) => {
                        const todayClass = isToday(day) ? 'bg-primary-100 dark:bg-primary-900' : ''
                        return (
                          <th
                            key={idx}
                            className={`border border-gray-300 dark:border-gray-600 p-3 text-center ${todayClass}`}
                          >
                            <div className="font-bold text-sm">
                              {day.toLocaleDateString('ru-RU', { weekday: 'short' })}
                            </div>
                            <div className="text-lg font-bold mt-1">
                              {day.getDate()}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {day.toLocaleDateString('ru-RU', { month: 'short' })}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      items.reduce((acc, item) => {
                        const brand = item.order.client.company || item.order.client.name
                        if (!acc.has(brand)) {
                          acc.set(brand, [])
                        }
                        acc.get(brand)!.push(item)
                        return acc
                      }, new Map<string, OrderItem[]>())
                    ).map(([brand, brandItems]) => {
                      const hasItemsThisWeek = weekDays.some(day => {
                        const dateKey = formatDateKey(day)
                        return brandItems.some(item => {
                          const start = new Date(item.productionStartDate)
                          const end = new Date(item.productionEndDate)
                          const current = new Date(dateKey)
                          return current >= start && current <= end
                        })
                      })

                      if (!hasItemsThisWeek) return null

                      return (
                        <tr key={brand} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="border border-gray-300 dark:border-gray-600 p-3 font-semibold">
                            {brand}
                          </td>
                          {weekDays.map((day, idx) => {
                            const dateKey = formatDateKey(day)
                            const dayItems = brandItems.filter(item => {
                              const start = new Date(item.productionStartDate)
                              const end = new Date(item.productionEndDate)
                              const current = new Date(dateKey)
                              return current >= start && current <= end
                            })

                            return (
                              <td
                                key={idx}
                                className={`border border-gray-300 dark:border-gray-600 p-2 ${
                                  isToday(day) ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                }`}
                              >
                                {dayItems.length > 0 && (
                                  <div className="space-y-1">
                                    {dayItems.map(item => (
                                      <div
                                        key={item.id}
                                        className={`text-xs px-2 py-1 rounded text-white font-medium cursor-pointer hover:opacity-80 ${getMaterialColor(item.material)}`}
                                        onClick={() => router.push(`/orders/${item.order.id}`)}
                                        title={`${item.name} (${item.quantity} шт.)`}
                                      >
                                        {item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'readiness' && (
          <div className="rounded-lg shadow p-6 border surface">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={goToPreviousMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <h2 className="text-2xl font-bold capitalize">{monthLabel}</h2>
              <button
                onClick={goToNextMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            <div className="flex justify-center mb-4">
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm bg-primary-100 text-primary-700 hover:bg-primary-200 rounded-lg font-medium transition-colors"
              >
                Сегодня
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                <div key={day} className="text-center font-bold text-gray-700 dark:text-gray-300 py-2 text-sm">
                  {day}
                </div>
              ))}

              {calendarDays.map((day, idx) => {
                if (!day) {
                  return <div key={idx} className="min-h-[90px]" />
                }

                const dateKey = formatDateKey(day)
                const readyItems = items.filter(item => {
                  const endDate = formatDateKey(new Date(item.productionEndDate))
                  return endDate === dateKey
                })
                const todayClass = isToday(day) ? 'ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : ''
                const hasItems = readyItems.length > 0

                const brandGroups = new Map<string, OrderItem[]>()
                readyItems.forEach(item => {
                  const brand = item.order.client.company || item.order.client.name
                  if (!brandGroups.has(brand)) {
                    brandGroups.set(brand, [])
                  }
                  brandGroups.get(brand)!.push(item)
                })

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (hasItems) {
                        setSelectedDate(dateKey)
                      }
                    }}
                    className={`min-h-[90px] p-2 rounded-lg border transition-all ${todayClass} ${
                      hasItems
                        ? 'border-green-300 hover:border-green-500 hover:shadow-lg cursor-pointer bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                    } ${
                      selectedDate === dateKey ? 'bg-green-100 dark:bg-green-900/40 border-green-500 shadow-md' : ''
                    }`}
                    disabled={!hasItems}
                  >
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-base font-bold ${
                          isToday(day) ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {day.getDate()}
                        </span>
                        {hasItems && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-600 text-white">
                            {readyItems.length}
                          </span>
                        )}
                      </div>
                      {hasItems && (
                        <div className="flex-1 space-y-1 overflow-hidden">
                          {Array.from(brandGroups.entries()).slice(0, 3).map(([brand, items], i) => {
                            return (
                              <div
                                key={`${brand}-${i}`}
                                className="text-xs px-1.5 py-1 rounded bg-green-600 text-white font-semibold truncate"
                                title={`${brand}: ${items.map(it => it.name).join(', ')}`}
                              >
                                ✅ {brand}
                                {items.length > 1 && (
                                  <span className="ml-1 text-[10px] opacity-90">
                                    ({items.length})
                                  </span>
                                )}
                              </div>
                            )
                          })}
                          {brandGroups.size > 3 && (
                            <div className="text-xs text-green-700 dark:text-green-400 font-semibold text-center">
                              +{brandGroups.size - 3} ещё
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selectedDate && (
          <div className="rounded-lg shadow-xl border-2 border-primary-200 surface">
            <div className={`px-6 py-5 flex items-center justify-between rounded-t-lg ${
              activeTab === 'readiness'
                ? 'bg-gradient-to-r from-green-600 to-green-700'
                : 'bg-gradient-to-r from-primary-600 to-primary-700'
            }`}>
              <div>
                <h3 className="text-2xl font-bold text-white">
                  {new Date(selectedDate).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </h3>
                <p className={`text-sm mt-1 ${
                  activeTab === 'readiness' ? 'text-green-100' : 'text-primary-100'
                }`}>
                  {activeTab === 'readiness' ? 'Готовы к выдаче' : 'В производстве'}: {dayItems.length} {dayItems.length === 1 ? 'позиция' : dayItems.length < 5 ? 'позиции' : 'позиций'}
                </p>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              {loadingDay ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : dayItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">Нет позиций на эту дату</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dayItems.map(item => (
                    <div
                      key={item.id}
                      className={`border-2 rounded-xl p-5 hover:shadow-lg transition-all cursor-pointer ${
                        activeTab === 'readiness'
                          ? 'border-green-300 hover:border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 bg-white dark:bg-gray-800'
                      }`}
                      onClick={() => router.push(`/orders/${item.order.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">
                              {activeTab === 'readiness' ? '✅' : '🏭'}
                            </span>
                            <span className="font-bold text-xl text-gray-900 dark:text-gray-100">
                              {item.order.client.company || item.order.client.name}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Заказ №{item.order.orderNumber}
                          </p>
                        </div>
                        {item.material && (
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${getMaterialColor(item.material)}`}>
                            {item.material}
                          </span>
                        )}
                      </div>

                      <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-start gap-3">
                          <Package className="h-5 w-5 text-primary-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              <span className="font-medium">{item.quantity} шт.</span>
                            </p>
                          </div>
                        </div>

                        {(item.baseColor || item.printColor || item.cutting) && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {item.baseColor && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md font-medium">
                                Основа: {item.baseColor}
                              </span>
                            )}
                            {item.printColor && (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded-md font-medium">
                                Печать: {item.printColor}
                              </span>
                            )}
                            {item.cutting && (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-md font-medium">
                                Резка: {item.cutting}
                              </span>
                            )}
                          </div>
                        )}

                        {item.productionComments && (
                          <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                              💬 {item.productionComments}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}




