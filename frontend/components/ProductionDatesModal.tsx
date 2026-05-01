'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Package, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

interface OrderItem {
  id: string
  name: string
  quantity: number
  material?: string
  productionStartDate?: string | null
  productionEndDate?: string | null
}

interface Order {
  id: string
  orderNumber: string
  client: {
    name: string
    company?: string | null
  }
  items: OrderItem[]
}

interface ProductionDatesModalProps {
  order: Order
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ItemDates {
  startDate: string
  endDate: string
}

export default function ProductionDatesModal({
  order,
  open,
  onClose,
  onSuccess
}: ProductionDatesModalProps) {
  const [loading, setLoading] = useState(false)
  const [itemDates, setItemDates] = useState<Record<string, ItemDates>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      // Инициализация дат для каждой позиции
      const initialDates: Record<string, ItemDates> = {}
      order.items.forEach(item => {
        // Если даты уже есть, используем их
        if (item.productionStartDate && item.productionEndDate) {
          initialDates[item.id] = {
            startDate: new Date(item.productionStartDate).toISOString().split('T')[0],
            endDate: new Date(item.productionEndDate).toISOString().split('T')[0]
          }
        } else {
          // Иначе используем текущую дату как начало
          const today = new Date().toISOString().split('T')[0]
          initialDates[item.id] = {
            startDate: today,
            endDate: today
          }
        }
      })
      setItemDates(initialDates)
      setErrors({})
    }
  }, [open, order])

  const updateItemDate = (itemId: string, field: 'startDate' | 'endDate', value: string) => {
    setItemDates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }))
    // Очистка ошибки при изменении
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[itemId]
      return newErrors
    })
  }

  const validateDates = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    order.items.forEach(item => {
      const dates = itemDates[item.id]
      if (!dates || !dates.startDate || !dates.endDate) {
        newErrors[item.id] = 'Укажите даты начала и окончания производства'
      } else {
        const start = new Date(dates.startDate)
        const end = new Date(dates.endDate)
        if (start > end) {
          newErrors[item.id] = 'Дата начала не может быть позже даты окончания'
        }
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateDates()) {
      return
    }
    
    setLoading(true)
    
    try {
      // Обновляем даты для каждой позиции
      for (const [itemId, dates] of Object.entries(itemDates)) {
        await api.put(`/production-calendar/item/${itemId}`, {
          productionStartDate: dates.startDate,
          productionEndDate: dates.endDate
        })
      }
      
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Failed to set production dates:', error)
      const errorMessage = error?.response?.data?.error || error?.message || 'Ошибка при установке дат производства'
      alert(`Ошибка: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Сроки производства</h2>
              <p className="text-purple-100 text-sm mt-0.5">Заказ №{order.orderNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {/* Информация о заказе */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-6 mb-6 border border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-500 mb-1">Клиент</p>
                  <p className="font-semibold text-gray-900">{order.client.name}</p>
                </div>
                {order.client.company && (
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-1">Компания</p>
                    <p className="font-semibold text-gray-900">{order.client.company}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Укажите сроки производства для каждой позиции</p>
                <p>Эти даты будут отображаться в производственном календаре</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Позиции заказа */}
              {order.items.map((item, index) => {
                const dates = itemDates[item.id] || { startDate: '', endDate: '' }
                const error = errors[item.id]

                return (
                  <div 
                    key={item.id} 
                    className={`bg-white border-2 rounded-xl p-6 shadow-sm transition-all ${
                      error ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    {/* Заголовок позиции */}
                    <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold text-base shadow-md">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span>Кол-во: {item.quantity} шт.</span>
                            {item.material && (
                              <span className="flex items-center gap-1">
                                <Package className="h-3.5 w-3.5" />
                                {item.material}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Поля для дат */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <Calendar className="h-4 w-4 text-purple-600" />
                          Дата начала производства
                        </label>
                        <input
                          type="date"
                          value={dates.startDate}
                          onChange={(e) => updateItemDate(item.id, 'startDate', e.target.value)}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-purple-500 transition-all ${
                            error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                          }`}
                          required
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <Calendar className="h-4 w-4 text-purple-600" />
                          Дата окончания производства
                        </label>
                        <input
                          type="date"
                          value={dates.endDate}
                          onChange={(e) => updateItemDate(item.id, 'endDate', e.target.value)}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-purple-500 transition-all ${
                            error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                          }`}
                          required
                        />
                      </div>
                    </div>

                    {/* Сообщение об ошибке */}
                    {error && (
                      <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Footer с кнопками */}
              <div className="mt-8 pt-6 border-t-2 border-gray-200 flex gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Сохранение...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-5 w-5" />
                      <span>Сохранить и продолжить</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}




