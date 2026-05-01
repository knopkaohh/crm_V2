'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Plus, Search, Package, Trash2, FileText, CheckCircle2, Clock3 } from 'lucide-react'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'

interface Order {
  id: string
  orderNumber: string
  status: string
  client: {
    id: string
    name: string
    // optional phone from backend
    phone?: string
    company?: string | null
    contactMethod?: string | null
    telegram?: string | null
  }
  manager: {
    id: string
    firstName: string
    lastName: string
  } | null
  totalAmount: number
  // optional source from backend
  source?: string
  designTakenAt?: string | null
  designTakenBy?: string | null
  items: Array<{
    id: string
    name: string
    quantity: number
    price: number
    desiredDeadline?: string | null
  }> | null
  deadline: string | null
  createdAt: string
  _count?: {
    comments?: number
    files?: number
  }
}

const statusLabels: Record<string, string> = {
  NEW_ORDER: 'Новый заказ',
  DESIGN_APPROVAL: 'Утверждение дизайна',
  AWAITING_MATERIALS: 'Готовы к запуску',
  IN_PRODUCTION: 'В производстве',
  ORDER_READY: 'Заказ готов',
  ORDER_DELIVERED: 'Заказ доставлен',
}

const statusColors: Record<string, string> = {
  NEW_ORDER: 'bg-blue-100 text-blue-800',
  DESIGN_APPROVAL: 'bg-yellow-100 text-yellow-800',
  AWAITING_MATERIALS: 'bg-orange-100 text-orange-800',
  IN_PRODUCTION: 'bg-purple-100 text-purple-800',
  ORDER_READY: 'bg-green-100 text-green-800',
  ORDER_DELIVERED: 'bg-gray-100 text-gray-800',
}

export default function OrdersPage() {
  type DesignStage = 'IN_DEVELOPMENT' | 'ON_APPROVAL'
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialStatusFilter = searchParams.get('status') ?? ''
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 500) // Debounce на 500ms
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter)
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const [designStageMap, setDesignStageMap] = useState<Record<string, DesignStage>>({})
  const [designRevisionMap, setDesignRevisionMap] = useState<Record<string, boolean>>({})

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = {
        page: 1,
        limit: 200,
      }
      if (statusFilter) params.status = statusFilter
      if (debouncedSearch) params.search = debouncedSearch // Используем debounced search

      const response = await api.get('/orders', { params })
      
      // Поддержка нового формата с пагинацией и старого формата без пагинации
      let ordersData = response.data.data || response.data
      
      // Если это массив, используем его, иначе это может быть объект
      if (!Array.isArray(ordersData)) {
        ordersData = []
      }
      
      // Filter out "deleted" orders (stored in localStorage)
      const deletedIds = JSON.parse(localStorage.getItem('deletedOrders') || '[]')
      const filteredOrders = ordersData.filter((order: Order) => !deletedIds.includes(order.id))
      
      setOrders(filteredOrders)
    } catch (error) {
      console.error('Failed to load orders:', error)
      console.error('Error details:', error)
      // Показываем ошибку пользователю
      alert('Ошибка при загрузке заказов. Проверьте консоль для деталей.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, debouncedSearch])

  // Загружаем заказы при изменении фильтра или поиска (с debounce)
  useEffect(() => {
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch])

  useEffect(() => {
    const statusParam = searchParams.get('status') ?? ''
    setStatusFilter((prev) => (prev === statusParam ? prev : statusParam))
  }, [searchParams])

  useEffect(() => {
    const savedStages = localStorage.getItem('orderDesignStageMap')
    const savedRevisions = localStorage.getItem('orderDesignRevisionMap')
    if (savedStages) setDesignStageMap(JSON.parse(savedStages))
    if (savedRevisions) setDesignRevisionMap(JSON.parse(savedRevisions))
  }, [])

  const getDesignStage = useCallback((orderId: string): DesignStage => {
    return designStageMap[orderId] || 'IN_DEVELOPMENT'
  }, [designStageMap])

  const setDesignStage = useCallback((orderId: string, stage: DesignStage) => {
    setDesignStageMap((prev) => {
      const next = { ...prev, [orderId]: stage }
      localStorage.setItem('orderDesignStageMap', JSON.stringify(next))
      return next
    })
  }, [])

  const setDesignNeedsRevision = useCallback((orderId: string, needsRevision: boolean) => {
    setDesignRevisionMap((prev) => {
      const next = { ...prev, [orderId]: needsRevision }
      localStorage.setItem('orderDesignRevisionMap', JSON.stringify(next))
      return next
    })
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, orderId: string) => {
    setDraggedOrder(orderId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null)
  }, [])

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    setDragOverStatus(null)
    
    if (!draggedOrder) return

    const order = orders.find((o) => o.id === draggedOrder)
    if (!order) {
      setDraggedOrder(null)
      return
    }

    const targetStatus =
      newStatus === 'DESIGN_IN_DEVELOPMENT' || newStatus === 'DESIGN_ON_APPROVAL'
        ? 'DESIGN_APPROVAL'
        : newStatus

    if (
      order.status === targetStatus &&
      !(
        targetStatus === 'DESIGN_APPROVAL' &&
        ((newStatus === 'DESIGN_IN_DEVELOPMENT' && getDesignStage(order.id) !== 'IN_DEVELOPMENT') ||
          (newStatus === 'DESIGN_ON_APPROVAL' && getDesignStage(order.id) !== 'ON_APPROVAL'))
      )
    ) {
      setDraggedOrder(null)
      return
    }

    // Оптимистичное обновление - сразу обновляем локальное состояние
    const previousStatus = order.status
    setOrders((prevOrders) =>
      prevOrders.map((o) =>
        o.id === draggedOrder ? { ...o, status: targetStatus } : o
      )
    )
    if (targetStatus === 'DESIGN_APPROVAL') {
      if (newStatus === 'DESIGN_ON_APPROVAL') {
        setDesignStage(order.id, 'ON_APPROVAL')
        setDesignNeedsRevision(order.id, false)
      }
      if (newStatus === 'DESIGN_IN_DEVELOPMENT') setDesignStage(order.id, 'IN_DEVELOPMENT')
    }
    setDraggedOrder(null)

    try {
      await api.put(`/orders/${draggedOrder}`, { status: targetStatus })
      // Успешно обновлено - состояние уже обновлено оптимистично
    } catch (error) {
      console.error('Failed to update order status:', error)
      // Откатываем изменения при ошибке
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === draggedOrder ? { ...o, status: previousStatus } : o
        )
      )
      if (targetStatus === 'DESIGN_APPROVAL') {
        setDesignStage(order.id, getDesignStage(order.id))
      }
      alert('Ошибка при изменении статуса заказа')
    }
  }

  const getOrderIndicatorColor = (order: Order) => {
    if (!order) return { border: 'border-l-gray-300', bg: 'bg-gray-50' }

    // Индикатор только по стадии заказа (без "магии" от побочных флагов).
    if (order.status === 'NEW_ORDER') return { border: 'border-l-blue-400', bg: 'bg-blue-50/40' }
    if (order.status === 'DESIGN_APPROVAL' && designRevisionMap[order.id]) return { border: 'border-l-red-500', bg: 'bg-red-50/50' }
    if (order.status === 'DESIGN_APPROVAL') return { border: 'border-l-yellow-400', bg: 'bg-yellow-50/40' }
    if (order.status === 'AWAITING_MATERIALS') return { border: 'border-l-orange-400', bg: 'bg-orange-50/40' }
    if (order.status === 'IN_PRODUCTION') {
      const effectiveDeadline = getEffectiveDeadline(order)
      if (!effectiveDeadline) return { border: 'border-l-emerald-400', bg: 'bg-emerald-50/40' }

      const today = new Date()
      const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      const deadlineDate = new Date(effectiveDeadline)
      const deadline = new Date(
        deadlineDate.getFullYear(),
        deadlineDate.getMonth(),
        deadlineDate.getDate()
      ).getTime()
      const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))

      if (daysLeft <= 0) return { border: 'border-l-red-500', bg: 'bg-red-50/50' }
      if (daysLeft <= 2) return { border: 'border-l-yellow-400', bg: 'bg-yellow-50/50' }
      return { border: 'border-l-emerald-400', bg: 'bg-emerald-50/40' }
    }
    if (order.status === 'ORDER_READY') return { border: 'border-l-green-600', bg: 'bg-green-100/40' }
    if (order.status === 'ORDER_DELIVERED') return { border: 'border-l-gray-500', bg: 'bg-gray-100/40' }
    return { border: 'border-l-gray-300', bg: 'bg-gray-50' }
  }

  const chipClass = (tone: 'success' | 'warning' | 'info' | 'neutral') => {
    if (tone === 'success') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    if (tone === 'warning') return 'bg-amber-50 text-amber-800 border-amber-200'
    if (tone === 'info') return 'bg-blue-50 text-blue-800 border-blue-200'
    return 'bg-gray-50 text-gray-700 border-gray-200'
  }

  const getOrderProgressChips = (order: Order) => {
    const chips: Array<{ label: string; tone: 'success' | 'warning' | 'info' | 'neutral'; icon: 'file' | 'clock' | 'check' }> = []

    const filesCount = Number(order._count?.files || 0)
    if (filesCount > 0) chips.push({ label: `Файлы: ${filesCount}`, tone: 'success', icon: 'file' })
    else if (order.designTakenAt) chips.push({ label: 'Файлы: не загружены', tone: 'warning', icon: 'file' })
    else chips.push({ label: 'Файлы: нет', tone: 'neutral', icon: 'file' })

    if (order.status === 'ORDER_READY') chips.push({ label: 'Готов', tone: 'success', icon: 'check' })
    if (order.status === 'ORDER_DELIVERED') chips.push({ label: 'Доставлен', tone: 'success', icon: 'check' })

    return chips
  }

  const handleTakeDesign = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    // Оптимистичное обновление
    const previousDesignTakenAt = order.designTakenAt
    setOrders((prevOrders) =>
      prevOrders.map((o) =>
        o.id === orderId ? { ...o, designTakenAt: new Date().toISOString() } : o
      )
    )

    try {
      await api.put(`/orders/${orderId}`, { takeDesign: true })
      // Успешно обновлено
    } catch (error) {
      console.error('Failed to take design:', error)
      // Откатываем изменения при ошибке
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderId ? { ...o, designTakenAt: previousDesignTakenAt } : o
        )
      )
      alert('Ошибка при взятии заказа в работу')
    }
  }

  const handleDesignApproved = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    // Оптимистичное обновление - перемещаем в "Готовы к запуску"
    const previousStatus = order.status
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === orderId ? { ...o, status: 'AWAITING_MATERIALS' } : o))
    )
    setDesignNeedsRevision(orderId, false)
    
    try {
      // Фиксируем утверждение и переводим в "Готовы к запуску"
      await api.put(`/orders/${orderId}`, { designApproved: true, status: 'AWAITING_MATERIALS' })
      // Успешно обновлено
    } catch (error) {
      console.error('Failed to approve design:', error)
      // Откатываем изменения при ошибке
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o))
      )
      alert('Ошибка при согласовании макета')
    }
  }

  const handleOrderStarted = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    if (order.status === 'IN_PRODUCTION') return

    const previousStatus = order.status
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === orderId ? { ...o, status: 'IN_PRODUCTION' } : o))
    )

    try {
      await api.put(`/orders/${orderId}`, { status: 'IN_PRODUCTION' })
    } catch (error) {
      console.error('Failed to start order:', error)
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o))
      )
      alert('Ошибка при запуске заказа')
    }
  }

  const handleOrderReady = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    if (order.status === 'ORDER_READY') return

    const previousStatus = order.status
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === orderId ? { ...o, status: 'ORDER_READY' } : o))
    )

    try {
      await api.put(`/orders/${orderId}`, { status: 'ORDER_READY' })
    } catch (error) {
      console.error('Failed to mark order ready:', error)
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o))
      )
      alert('Ошибка при переводе заказа в "Готов"')
    }
  }

  const handleOrderDelivered = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    if (order.status === 'ORDER_DELIVERED') return

    const previousStatus = order.status
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === orderId ? { ...o, status: 'ORDER_DELIVERED' } : o))
    )

    try {
      await api.put(`/orders/${orderId}`, { status: 'ORDER_DELIVERED' })
      // После доставки убираем заказ из вкладки "Заказы".
      setOrders((prevOrders) => prevOrders.filter((o) => o.id !== orderId))
    } catch (error) {
      console.error('Failed to mark order delivered:', error)
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o))
      )
      alert('Ошибка при переводе заказа в "Доставлен"')
    }
  }

  // Мемоизация группировки для оптимизации производительности
  // Фильтрация теперь происходит на backend
  const groupedOrders = useMemo(() => {
    return orders.reduce((acc, order) => {
      if (!acc[order.status]) {
        acc[order.status] = []
      }
      acc[order.status].push(order)
      return acc
    }, {} as Record<string, Order[]>)
  }, [orders])

  const columns = [
    { key: 'NEW_ORDER', label: 'Новый заказ' },
    { key: 'DESIGN_IN_DEVELOPMENT', label: 'Макеты в разработку' },
    { key: 'DESIGN_ON_APPROVAL', label: 'Макеты на согласовании' },
    { key: 'AWAITING_MATERIALS', label: 'Готовы к запуску' },
    { key: 'IN_PRODUCTION', label: 'В производстве' },
    { key: 'ORDER_READY', label: 'Заказ готов' },
  ] as const

  const getEffectiveDeadline = (order: Order): string | null => {
    if (order.deadline) return order.deadline
    const itemDeadlines = (order.items || [])
      .map((item) => item.desiredDeadline)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()))
    if (itemDeadlines.length === 0) return null
    const earliest = itemDeadlines.reduce((min, current) =>
      current.getTime() < min.getTime() ? current : min
    )
    return earliest.toISOString()
  }

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value)
    const nextParams = new URLSearchParams(searchParams.toString())
    if (value) {
      nextParams.set('status', value)
    } else {
      nextParams.delete('status')
    }
    const query = nextParams.toString()
    router.replace(`/orders${query ? `?${query}` : ''}`, { scroll: false })
  }, [searchParams, router])

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
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Заказы</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Управление производством и заказами</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/orders/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Новый заказ</span>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по номеру заказа, клиенту, бренду..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Все статусы</option>
              {Object.entries(statusLabels)
                .filter(([value]) => value !== 'ORDER_DELIVERED')
                .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {columns.map(({ key: status, label }) => {
            const statusOrders =
              status === 'DESIGN_IN_DEVELOPMENT'
                ? (groupedOrders.DESIGN_APPROVAL || []).filter((o) => getDesignStage(o.id) === 'IN_DEVELOPMENT')
                : status === 'DESIGN_ON_APPROVAL'
                  ? (groupedOrders.DESIGN_APPROVAL || []).filter((o) => getDesignStage(o.id) === 'ON_APPROVAL')
                  : (groupedOrders[status] || [])
            return (
              <div
                key={status}
                className={`overflow-hidden rounded-3xl border transition-colors shadow-xl shadow-primary-900/5 ${
                  dragOverStatus === status
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white'
                }`}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm">{label}</h3>
                    <span className="text-xs text-gray-700 bg-white/80 border border-gray-200 px-2 py-1 rounded-lg">
                      {statusOrders.length}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-3 max-h-[650px] overflow-y-auto">
                  {statusOrders.filter(order => order).map((order) => {
                    const indicatorColors = getOrderIndicatorColor(order)
                    const chips = getOrderProgressChips(order)
                    return (
                    <div
                      key={order.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, order.id)}
                      className={`rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 ${indicatorColors.border} ${indicatorColors.bg} cursor-move relative ${
                        draggedOrder === order.id ? 'opacity-50' : ''
                      }`}
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900 text-sm">{order.orderNumber || `Заказ #${order.id.slice(0, 8)}`}</h4>
                        <Package className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{order.client?.name || 'Без имени'}</p>
                      {order.client?.phone && (
                        <p className="text-xs text-gray-500 mb-1">{order.client.phone}</p>
                      )}
                      {order.client?.company && (
                        <p className="text-sm text-gray-900 font-semibold mb-1">{order.client.company}</p>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-primary-600">
                          {new Intl.NumberFormat('ru-RU', {
                            style: 'currency',
                            currency: 'RUB',
                          }).format(Number(order.totalAmount || 0))}
                        </span>
                        <span className="text-xs text-gray-500">
                          {order.items?.length || 0} позиц.
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {chips.map((chip, idx) => (
                          <span
                            key={`${order.id}-chip-${idx}`}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${chipClass(chip.tone)}`}
                          >
                            {chip.icon === 'file' && <FileText className="h-3.5 w-3.5" />}
                            {chip.icon === 'clock' && <Clock3 className="h-3.5 w-3.5" />}
                            {chip.icon === 'check' && <CheckCircle2 className="h-3.5 w-3.5" />}
                            {chip.label}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {order.manager?.firstName || ''} {order.manager?.lastName || ''}
                        </p>
                        {getEffectiveDeadline(order) && (
                          <p className="text-xs text-red-600">
                            {new Date(getEffectiveDeadline(order) as string).toLocaleDateString('ru-RU')}
                          </p>
                        )}
                      </div>
                      
                      {/* Кнопка "Взять в работу" для новых заказов */}
                      {order.status === 'NEW_ORDER' && !order.designTakenAt && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => handleTakeDesign(order.id, e)}
                            className="w-full px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                          >
                            Взять в работу
                          </button>
                        </div>
                      )}
                      
                      {/* Отправить на согласование: только в колонке "Макеты в разработку" */}
                      {order.status === 'DESIGN_APPROVAL' && getDesignStage(order.id) === 'IN_DEVELOPMENT' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              setDesignStage(order.id, 'ON_APPROVAL')
                              setDesignNeedsRevision(order.id, false)
                              try {
                                await api.put(`/orders/${order.id}`, { sendForApproval: true })
                              } catch (error) {
                                setDesignStage(order.id, 'IN_DEVELOPMENT')
                                setDesignNeedsRevision(order.id, true)
                                console.error('Failed to send for approval:', error)
                                alert('Ошибка при отправке на согласование')
                              }
                            }}
                            className="w-full px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                          >
                            Отправить на согласование
                          </button>
                        </div>
                      )}

                      {/* На согласовании: согласовать или вернуть на правки */}
                      {order.status === 'DESIGN_APPROVAL' && getDesignStage(order.id) === 'ON_APPROVAL' && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <button
                            onClick={(e) => handleDesignApproved(order.id, e)}
                            className="w-full px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                          >
                            Макет согласован
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDesignStage(order.id, 'IN_DEVELOPMENT')
                              setDesignNeedsRevision(order.id, true)
                            }}
                            className="w-full px-3 py-2 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                          >
                            Внести правки
                          </button>
                        </div>
                      )}

                      {/* Кнопка "Заказ запущен" для этапа "Готовы к запуску" */}
                      {order.status === 'AWAITING_MATERIALS' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => handleOrderStarted(order.id, e)}
                            className="w-full px-3 py-2 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                          >
                            Заказ запущен
                          </button>
                        </div>
                      )}

                      {/* Кнопка "Заказ готов" для этапа "В производстве" */}
                      {order.status === 'IN_PRODUCTION' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => handleOrderReady(order.id, e)}
                            className="w-full px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                          >
                            Заказ готов
                          </button>
                        </div>
                      )}

                      {/* Кнопка "Доставлен" для этапа "Заказ готов" */}
                      {order.status === 'ORDER_READY' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => handleOrderDelivered(order.id, e)}
                            className="w-full px-3 py-2 text-xs bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                          >
                            Доставлен
                          </button>
                        </div>
                      )}
                      
                      <div className="flex justify-end mt-2">
                        <button
                          className="text-red-600 hover:text-red-700 text-xs inline-flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Вы уверены, что хотите удалить этот заказ?')) {
                              // Try DELETE first
                              api.delete(`/orders/${order.id}`)
                                .then(() => {
                                  // Save deleted ID to localStorage
                                  const deletedIds = JSON.parse(localStorage.getItem('deletedOrders') || '[]')
                                  deletedIds.push(order.id)
                                  localStorage.setItem('deletedOrders', JSON.stringify(deletedIds))
                                  setOrders((prev) => prev.filter((o) => o.id !== order.id))
                                })
                                .catch((err) => {
                                  if (err?.response?.status === 404 || err?.response?.status === 405) {
                                    // If DELETE not supported, just mark as deleted locally
                                    const deletedIds = JSON.parse(localStorage.getItem('deletedOrders') || '[]')
                                    deletedIds.push(order.id)
                                    localStorage.setItem('deletedOrders', JSON.stringify(deletedIds))
                                    setOrders((prev) => prev.filter((o) => o.id !== order.id))
                                  } else {
                                    const msg = err?.response?.data?.error || err?.message || 'Не удалось удалить заказ'
                                    alert(msg)
                                  }
                                })
                            }
                          }}
                          title="Удалить заказ"
                        >
                          <Trash2 className="h-4 w-4" />
                          Удалить
                        </button>
                      </div>
                    </div>
                    )
                  })}
                  {statusOrders.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Нет заказов</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </Layout>
  )
}
