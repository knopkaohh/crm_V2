'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import Link from 'next/link'
import {
  FileSpreadsheet,
  ExternalLink,
  Calendar,
  ChevronDown,
  ChevronRight,
  Package,
} from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'NEW_ORDER', label: 'Новый заказ' },
  { value: 'DESIGN_APPROVAL', label: 'Утверждение дизайна' },
  { value: 'AWAITING_MATERIALS', label: 'Готовы к запуску' },
  { value: 'IN_PRODUCTION', label: 'В производстве' },
  { value: 'ORDER_READY', label: 'Заказ готов' },
  { value: 'ORDER_DELIVERED', label: 'Заказ доставлен' },
] as const

const PAYMENT_LABELS: Record<string, string> = {
  TRANSFER: 'Перевод',
  INVOICE: 'Счёт',
  CASH: 'Наличные',
  PARTIAL: 'Дробная оплата',
}

interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
  material?: string | null
}

interface AccountingOrder {
  id: string
  orderNumber: string
  status: string
  totalAmount: number
  source?: string | null
  paymentType?: string | null
  prepayment?: number | null
  postpayment?: number | null
  createdAt: string
  client: {
    id: string
    name: string
    phone?: string
    company?: string | null
  }
  manager: {
    id: string
    firstName: string
    lastName: string
  } | null
  items: OrderItem[]
}

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + ' ₽'
}

function formatDateRu(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export default function OrderAccountingPage() {
  const [orders, setOrders] = useState<AccountingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/orders', { params: { limit: 500 } })
      const data = res.data?.data ?? res.data ?? []
      setOrders(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load orders for accounting:', e)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const filteredOrders = useMemo(() => {
    if (!dateFrom && !dateTo) return orders
    return orders.filter((o) => {
      const d = new Date(o.createdAt)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo) {
        const toEnd = new Date(dateTo)
        toEnd.setHours(23, 59, 59, 999)
        if (d > toEnd) return false
      }
      return true
    })
  }, [orders, dateFrom, dateTo])

  const totals = useMemo(() => {
    let quantity = 0
    let orderSum = 0
    let paid = 0
    filteredOrders.forEach((o) => {
      const q = o.items?.reduce((s, i) => s + i.quantity, 0) ?? 0
      quantity += q
      orderSum += Number(o.totalAmount ?? 0)
      paid += Number(o.prepayment ?? 0)
    })
    return { quantity, orderSum, paid }
  }, [filteredOrders])

  const handleStatusChange = async (order: AccountingOrder, nextStatus: string) => {
    if (nextStatus === order.status) return
    const prev = order.status
    setStatusSavingId(order.id)
    setOrders((list) =>
      list.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o))
    )
    try {
      await api.put(`/orders/${order.id}`, { status: nextStatus })
    } catch (e) {
      console.error('Failed to update order status:', e)
      setOrders((list) =>
        list.map((o) => (o.id === order.id ? { ...o, status: prev } : o))
      )
      alert('Не удалось сохранить статус. Попробуйте ещё раз.')
    } finally {
      setStatusSavingId(null)
    }
  }

  const inputDateClass =
    'py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
  const selectStatusClass =
    'w-full min-w-0 max-w-[7rem] py-1.5 px-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60 truncate'
  const thClass =
    'text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-200 text-xs uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80'
  const tdClass = 'py-3 px-4 align-middle text-sm text-gray-900 dark:text-gray-100'

  if (loading) {
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
      <div className="space-y-6 max-h-[calc(100vh-8rem)] min-h-0 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-primary-600" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Учёт заказов</h1>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mt-1 ml-10">Сводная таблица по заказам CRM</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 shadow-sm">
              <Calendar className="h-4 w-4 text-gray-500 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={inputDateClass}
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={inputDateClass}
              />
            </div>
            <Link
              href="/orders"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              <ExternalLink className="h-4 w-4" /> К заказам
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
          {[
            { label: 'Итого ед.', value: totals.quantity.toLocaleString('ru-RU') },
            { label: 'Сумма заказов', value: formatRub(totals.orderSum) },
            { label: 'Внесено', value: formatRub(totals.paid) },
            { label: 'Заказов', value: String(filteredOrders.length) },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 shadow-sm"
            >
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {card.label}
              </span>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl shadow-primary-900/5 flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`${thClass} w-10`} aria-label="Развернуть" />
                  <th className={`${thClass} w-[7rem] max-w-[7rem]`}>Статус</th>
                  <th className={thClass}>№ заказа</th>
                  <th className={thClass}>Дата заказа</th>
                  <th className={thClass}>Кто продал</th>
                  <th className={thClass}>Бренд</th>
                  <th className={`${thClass} text-right`}>Сумма заказа</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const open = expandedId === order.id
                  const managerName = order.manager
                    ? `${order.manager.firstName} ${order.manager.lastName}`.trim()
                    : '—'
                  const brand = order.client?.company?.trim() || '—'
                  const prepayment = Number(order.prepayment ?? 0)
                  const remaining = Math.max(0, Number(order.totalAmount) - prepayment)
                  const paymentLabel = order.paymentType
                    ? PAYMENT_LABELS[order.paymentType] ?? order.paymentType
                    : '—'
                  const knownStatus = STATUS_OPTIONS.some((o) => o.value === order.status)

                  return (
                    <Fragment key={order.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                        <td className="py-2 px-2 align-middle">
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : order.id)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            aria-expanded={open}
                            title={open ? 'Свернуть' : 'Подробности заказа'}
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className={`${tdClass} w-[7rem] max-w-[7rem]`}>
                          <select
                            value={order.status}
                            disabled={statusSavingId === order.id}
                            onChange={(e) => handleStatusChange(order, e.target.value)}
                            className={selectStatusClass}
                          >
                            {!knownStatus && <option value={order.status}>{order.status}</option>}
                            {STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{order.orderNumber || '—'}</span>
                            <Link
                              href={`/orders/${order.id}`}
                              className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-medium whitespace-nowrap"
                            >
                              Открыть
                            </Link>
                          </div>
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-gray-600 dark:text-gray-300`}>
                          {formatDateRu(order.createdAt)}
                        </td>
                        <td className={`${tdClass} text-gray-700 dark:text-gray-200`}>{managerName}</td>
                        <td className={tdClass}>{brand}</td>
                        <td className={`${tdClass} text-right font-semibold tabular-nums`}>
                          {formatRub(Number(order.totalAmount ?? 0))}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/90 dark:bg-gray-900/50">
                          <td colSpan={7} className="p-0 border-b border-gray-200 dark:border-gray-700">
                            <div className="p-4 sm:p-6 text-sm">
                              <div className="flex flex-wrap items-center gap-2 mb-4">
                                <Package className="h-4 w-4 text-primary-600 shrink-0" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                  Карточка заказа {order.orderNumber || order.id.slice(0, 8)}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                <dl className="space-y-2">
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Клиент</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">{order.client?.name ?? '—'}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Телефон</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">{order.client?.phone ?? '—'}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Канал продаж</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">
                                      {order.source?.trim() || '—'}
                                    </dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Оплата</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">{paymentLabel}</dd>
                                  </div>
                                </dl>
                                <dl className="space-y-2">
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Предоплата</dt>
                                    <dd className="tabular-nums">{formatRub(prepayment)}</dd>
                                  </div>
                                  {order.postpayment != null && (
                                    <div className="flex gap-2">
                                      <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Постоплата</dt>
                                      <dd className="tabular-nums">{formatRub(Number(order.postpayment))}</dd>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Остаток к оплате</dt>
                                    <dd className="tabular-nums">{formatRub(remaining)}</dd>
                                  </div>
                                  <div className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 w-40 shrink-0">Позиций (шт.)</dt>
                                    <dd>
                                      {order.items?.reduce((s, i) => s + i.quantity, 0).toLocaleString('ru-RU') ?? '0'}
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                              {order.items && order.items.length > 0 && (
                                <div className="mt-5">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                    Состав заказа
                                  </h4>
                                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-600">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-gray-100 dark:bg-gray-800/80">
                                          <th className="text-left py-2 px-3 font-semibold">Наименование</th>
                                          <th className="text-right py-2 px-3 font-semibold w-16">Кол-во</th>
                                          <th className="text-right py-2 px-3 font-semibold w-28">Цена</th>
                                          <th className="text-left py-2 px-3 font-semibold">Материал</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.items.map((item) => (
                                          <tr
                                            key={item.id}
                                            className="border-t border-gray-100 dark:border-gray-700"
                                          >
                                            <td className="py-2 px-3">{item.name}</td>
                                            <td className="py-2 px-3 text-right tabular-nums">{item.quantity}</td>
                                            <td className="py-2 px-3 text-right tabular-nums">
                                              {formatRub(Number(item.price))}
                                            </td>
                                            <td className="py-2 px-3 text-gray-600 dark:text-gray-300">
                                              {item.material?.trim() || '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <Link
                                  href={`/orders/${order.id}`}
                                  className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Полная страница заказа
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {filteredOrders.length === 0 && (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                Нет заказов за выбранный период.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
