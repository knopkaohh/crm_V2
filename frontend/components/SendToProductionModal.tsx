'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  User, 
  Phone, 
  Briefcase,
  Calendar,
  Palette,
  Scissors,
  FileText,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import api from '@/lib/api'

interface OrderItem {
  id?: string
  name?: string
  quantity: number
  price: number
  material?: string
  desiredDeadline?: string | null
}

interface Order {
  id: string
  orderNumber: string
  client: {
    id: string
    name: string
    phone?: string
    company?: string | null
  }
  manager?: {
    id: string
    firstName: string
    lastName: string
  }
  items: OrderItem[]
}

interface ProductionParams {
  designCount: number
  baseColor?: string
  baseColorCustom?: string
  printColor?: string
  printColorCustom?: string
  printType?: string
  cutting?: boolean // Изменено на boolean для чекбокса
  centerFold?: boolean // Изменено на boolean для чекбокса
  freeEdge?: boolean // Изменено на boolean для чекбокса
  postProcessing?: string[] // Изменено на массив для множественного выбора
  coating?: string[] // Изменено на массив для множественного выбора
  singleSidedPrint?: boolean // Односторонняя печать
  doubleSidedPrint?: boolean // Двухсторонняя печать
  density?: string
  bagColor?: string
  bagColorCustom?: string
  sliderColor?: string
  desiredDeadline?: string
  productionComments?: string
}

interface SendToProductionModalProps {
  order: Order
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// Определение материала из названия позиции
function extractMaterial(itemName: string): string {
  const materials = [
    'Сатин классический',
    'Сатин премиум',
    'Силикон',
    'Хлопок',
    'Жаккард',
    'Картонная навесная бирка',
    'ZIP-Lock пакет'
  ]
  
  for (const material of materials) {
    if (itemName.includes(material)) {
      if (material === 'Картонная навесная бирка') return 'Картон'
      return material
    }
  }
  
  return ''
}

// Форматирование даты для ключа
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function SendToProductionModal({
  order,
  open,
  onClose,
  onSuccess
}: SendToProductionModalProps) {
  const [loading, setLoading] = useState(false)
  const [itemParams, setItemParams] = useState<Record<string, ProductionParams>>({})
  const [ordersDeadlines, setOrdersDeadlines] = useState<Record<string, number>>({})
  const [showCalendar, setShowCalendar] = useState<Record<string, boolean>>({})
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [selectedItemForCalendar, setSelectedItemForCalendar] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Инициализация параметров для каждой позиции
      const initialParams: Record<string, ProductionParams> = {}
      order.items.forEach(item => {
        // Извлекаем желаемый срок сдачи из позиции заказа, если он был указан
        let desiredDeadline = ''
        if (item.desiredDeadline) {
          try {
            const date = new Date(item.desiredDeadline)
            // Форматируем дату в формат YYYY-MM-DD для input type="date"
            desiredDeadline = date.toISOString().split('T')[0]
          } catch (e) {
            console.error('Failed to parse desiredDeadline:', e)
          }
        }
        
        if (!item.id) return

        initialParams[item.id] = {
          designCount: 1,
          baseColor: '',
          printColor: '',
          printType: '',
          cutting: false,
          centerFold: false,
          freeEdge: false,
          postProcessing: [],
          coating: [],
          singleSidedPrint: false,
          doubleSidedPrint: false,
          desiredDeadline: desiredDeadline, // Используем срок из заказа или пустую строку
          productionComments: ''
        }
      })
      setItemParams(initialParams)
      
      // Загрузка дедлайнов других заказов для календаря
      loadOrdersDeadlines()
    }
  }, [open, order])

  const loadOrdersDeadlines = async () => {
    try {
      const res = await api.get('/orders')
      const deadlines: Record<string, number> = {}
      // API возвращает объект с полями data и pagination
      const orders = res.data.data || res.data || []
      if (Array.isArray(orders)) {
        orders.forEach((o: any) => {
          if (o.deadline && o.id !== order.id) {
            const dateKey = formatDateKey(new Date(o.deadline))
            deadlines[dateKey] = (deadlines[dateKey] || 0) + 1
          }
          // Также проверяем дедлайны позиций
          if (o.items) {
            o.items.forEach((item: any) => {
              if (item.desiredDeadline && o.id !== order.id) {
                const dateKey = formatDateKey(new Date(item.desiredDeadline))
                deadlines[dateKey] = (deadlines[dateKey] || 0) + 1
              }
            })
          }
        })
      }
      setOrdersDeadlines(deadlines)
    } catch (error) {
      console.error('Failed to load orders deadlines:', error)
    }
  }

  const updateItemParam = (itemId: string, key: keyof ProductionParams, value: any) => {
    setItemParams(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [key]: value
      }
    }))
  }

  const toggleArrayParam = (itemId: string, key: 'postProcessing' | 'coating', value: string) => {
    setItemParams(prev => {
      const currentArray = prev[itemId]?.[key] || []
      const newArray = currentArray.includes(value)
        ? currentArray.filter(v => v !== value)
        : [...currentArray, value]
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          [key]: newArray
        }
      }
    })
  }

  // Функция для конвертации строки даты в ISO с сохранением локального времени
  const convertDateToISO = (dateString: string): string => {
    // Парсим дату в формате YYYY-MM-DD и создаем Date в локальном часовом поясе
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0) // Используем полдень для избежания проблем с часовыми поясами
    return date.toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Обновляем каждую позицию заказа с параметрами производства
      for (const [itemId, params] of Object.entries(itemParams)) {
        const item = order.items.find(i => i.id === itemId)
        if (!item) continue
        
        const material = extractMaterial(item.name || '')
        const updateData: any = {
          material,
          designCount: params.designCount,
          desiredDeadline: params.desiredDeadline ? convertDateToISO(params.desiredDeadline) : null,
          productionComments: params.productionComments || null
        }
        
        // Поля в зависимости от материала
        if (['Сатин классический', 'Сатин премиум', 'Силикон', 'Хлопок', 'Жаккард'].includes(material)) {
          updateData.baseColor = params.baseColor || null
          updateData.baseColorCustom = params.baseColor === 'Цветной' ? (params.baseColorCustom || null) : null
          updateData.printColor = params.printColor || null
          updateData.printColorCustom = params.printColor === 'Цветной' ? (params.printColorCustom || null) : null
          
          if (material === 'Жаккард') {
            // Для Жаккарда: резки НЕТ, но есть подгибка по центру и свободный край
            updateData.cutting = null
            updateData.centerFold = params.centerFold ? 'Да' : 'Нет'
            updateData.freeEdge = params.freeEdge ? 'Да' : 'Нет'
          } else {
            // Для Сатина, Силикона, Хлопка: резка есть, подгибки нет
            updateData.cutting = params.cutting ? 'Да' : 'Нет'
            updateData.centerFold = null
            updateData.freeEdge = null
          }
          // Очищаем поля картона
          updateData.postProcessing = null
          updateData.coating = null
          updateData.singleSidedPrint = null
          updateData.doubleSidedPrint = null
        } else if (material === 'Картон') {
          // Постобработка и покрытие теперь массивы - сохраняем как строку с разделителями
          updateData.postProcessing = params.postProcessing && params.postProcessing.length > 0 
            ? params.postProcessing.join(', ') 
            : null
          updateData.coating = params.coating && params.coating.length > 0 
            ? params.coating.join(', ') 
            : null
          // Печать - отправляем boolean значения (false если не выбрано)
          updateData.singleSidedPrint = params.singleSidedPrint === true
          updateData.doubleSidedPrint = params.doubleSidedPrint === true
          // Очищаем поля других материалов
          updateData.baseColor = null
          updateData.baseColorCustom = null
          updateData.printColor = null
          updateData.printColorCustom = null
          updateData.cutting = null
          updateData.centerFold = null
          updateData.freeEdge = null
        } else if (material === 'ZIP-Lock пакет') {
          const zipPrintColor = params.printColor === 'Другой'
            ? (params.printColorCustom || null)
            : (params.printColor || null)
          const zipBagColor = params.bagColor === 'Другой'
            ? (params.bagColorCustom || null)
            : (params.bagColor || null)

          const zipDetails: string[] = []
          if (params.printType) zipDetails.push(`Тип печати: ${params.printType}`)
          if (zipPrintColor) zipDetails.push(`Цвет печати: ${zipPrintColor}`)
          if (params.productionComments) zipDetails.push(`Комментарий: ${params.productionComments}`)

          updateData.density = params.density || null
          updateData.bagColor = zipBagColor
          updateData.sliderColor = params.sliderColor || null
          updateData.printColor = params.printColor || null
          updateData.printColorCustom = params.printColor === 'Другой' ? (params.printColorCustom || null) : null
          updateData.productionComments = zipDetails.length > 0 ? zipDetails.join('\n') : null
          // Очищаем поля других материалов
          updateData.baseColor = null
          updateData.baseColorCustom = null
          updateData.cutting = null
          updateData.centerFold = null
          updateData.freeEdge = null
          updateData.postProcessing = null
          updateData.coating = null
          updateData.singleSidedPrint = null
          updateData.doubleSidedPrint = null
        } else {
          // Для материалов, которые не распознаны, очищаем все поля
          updateData.baseColor = null
          updateData.baseColorCustom = null
          updateData.printColor = null
          updateData.printColorCustom = null
          updateData.cutting = null
          updateData.centerFold = null
          updateData.freeEdge = null
          updateData.postProcessing = null
          updateData.coating = null
          updateData.singleSidedPrint = null
          updateData.doubleSidedPrint = null
        }
        
        // Удаляем undefined значения
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('Sending update data for item:', itemId, updateData)
        await api.put(`/orders/${order.id}/items/${itemId}`, updateData)
      }
      
      // Обновляем статус заказа
      await api.put(`/orders/${order.id}`, { status: 'DESIGN_APPROVAL' })
      
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Failed to send to production:', error)
      const errorMessage = error?.response?.data?.details || error?.response?.data?.error || error?.message || 'Ошибка при отправке в производство'
      alert(`Ошибка при отправке в производство: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // Генерация календаря
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    const days: (Date | null)[] = []
    
    // Пустые ячейки для дней до начала месяца
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    
    return days
  }, [calendarMonth])

  const goToPreviousMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  const monthLabel = calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  // Закрытие календаря при клике вне его
  useEffect(() => {
    if (!open) return undefined
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Не закрываем, если клик внутри календаря или на кнопке календаря
      if (target.closest('.calendar-container') || target.closest('button[type="button"]')) {
        return
      }
      setShowCalendar({})
      setSelectedItemForCalendar(null)
    }
    
    if (Object.values(showCalendar).some(v => v)) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
    
    return undefined
  }, [showCalendar, open])

  if (!open) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col border border-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Отправить в производство</h2>
              <p className="text-primary-100 text-sm mt-0.5">Заказ №{order.orderNumber}</p>
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
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-6 mb-8 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Информация о заказе
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Briefcase className="h-4 w-4" />
                    <span className="text-xs font-medium">Бренд</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{order.client.company || 'Не указан'}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <User className="h-4 w-4" />
                    <span className="text-xs font-medium">Клиент</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{order.client.name}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs font-medium">Телефон</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{order.client.phone || 'Не указан'}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <User className="h-4 w-4" />
                    <span className="text-xs font-medium">Менеджер</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {order.manager ? `${order.manager.firstName} ${order.manager.lastName}` : 'Не назначен'}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Позиции заказа */}
              {order.items.map((item, index) => {
                const itemId = item.id
                if (!itemId) return null

                const material = extractMaterial(item.name || '')
                const params = itemParams[itemId] || {}
                const isSatinSiliconCotton = ['Сатин классический', 'Сатин премиум', 'Силикон', 'Хлопок'].includes(material)
                const isJacquard = material === 'Жаккард'
                const isCardboard = material === 'Картон'
                const isZipLock = material === 'ZIP-Lock пакет'
                const showCalendarForItem = showCalendar[itemId] && selectedItemForCalendar === itemId
                const hasMaterial = material !== ''

                return (
                  <div key={itemId} className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm hover:border-primary-300 transition-all mb-6">
                  {/* Заголовок позиции */}
                  <div className="flex items-start justify-between mb-6 pb-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white font-bold text-base shadow-md">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                        {hasMaterial && (
                          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" />
                            Материал: {material}
                          </p>
                        )}
                      </div>
                    </div>
                    {!hasMaterial && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Материал не распознан
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-5">
                    {/* Кол-во макетов (для всех) */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                        <FileText className="h-4 w-4 text-primary-600" />
                        Кол-во макетов
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={params.designCount || 1}
                          onChange={(e) => updateItemParam(itemId, 'designCount', parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-semibold text-lg"
                        required
                      />
                    </div>

                    {/* Поля для Сатин, Силикон, Хлопок, Жаккард */}
                    {hasMaterial && (isSatinSiliconCotton || isJacquard) && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4 pt-3 border-t-2 border-gray-200">
                          <Palette className="h-5 w-5 text-primary-600" />
                          Параметры материала
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Цвет основы
                            </label>
                            <select
                              value={params.baseColor || ''}
                              onChange={(e) => updateItemParam(itemId, 'baseColor', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите цвет</option>
                              <option value="Белый">Белый</option>
                              <option value="Черный">Черный</option>
                              <option value="Цветной">Цветной</option>
                            </select>
                            {params.baseColor === 'Цветной' && (
                              <input
                                type="text"
                                placeholder="Укажите цвет вручную"
                                value={params.baseColorCustom || ''}
                                onChange={(e) => updateItemParam(itemId, 'baseColorCustom', e.target.value)}
                                className="w-full mt-3 px-4 py-3 bg-white border-2 border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                                required
                              />
                            )}
                          </div>

                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Цвет печати
                            </label>
                            <select
                              value={params.printColor || ''}
                              onChange={(e) => updateItemParam(itemId, 'printColor', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите цвет</option>
                              <option value="Белый">Белый</option>
                              <option value="Черный">Черный</option>
                              <option value="Цветной">Цветной</option>
                            </select>
                            {params.printColor === 'Цветной' && (
                              <input
                                type="text"
                                placeholder="Укажите цвет вручную"
                                value={params.printColorCustom || ''}
                                onChange={(e) => updateItemParam(itemId, 'printColorCustom', e.target.value)}
                                className="w-full mt-3 px-4 py-3 bg-white border-2 border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                                required
                              />
                            )}
                          </div>

                          {/* Резка - только для Сатина, Силикона и Хлопка (НЕ для Жаккарда) */}
                          {!isJacquard && (
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={params.cutting || false}
                                  onChange={(e) => updateItemParam(itemId, 'cutting', e.target.checked)}
                                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                                />
                                <Scissors className="h-4 w-4 text-primary-600" />
                                <span>Резка</span>
                              </label>
                            </div>
                          )}
                        </div>
                        
                        {/* Дополнительные поля для Жаккарда */}
                        {isJacquard && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={params.centerFold || false}
                                  onChange={(e) => updateItemParam(itemId, 'centerFold', e.target.checked)}
                                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                                />
                                <Scissors className="h-4 w-4 text-primary-600" />
                                <span>Подгибка по центру</span>
                              </label>
                            </div>

                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={params.freeEdge || false}
                                  onChange={(e) => updateItemParam(itemId, 'freeEdge', e.target.checked)}
                                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                                />
                                <Scissors className="h-4 w-4 text-primary-600" />
                                <span>Свободный край</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Поля для Картона */}
                    {hasMaterial && isCardboard && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4 pt-3 border-t-2 border-gray-200">
                          <Package className="h-5 w-5 text-primary-600" />
                          Параметры картона
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Scissors className="h-4 w-4 text-primary-600" />
                              Постобработка
                            </label>
                            <div className="space-y-2">
                              {['Скругление углов', 'Биговка'].map((option) => (
                                <label key={option} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(params.postProcessing || []).includes(option)}
                                    onChange={() => toggleArrayParam(itemId, 'postProcessing', option)}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                                  />
                                  <span className="text-sm text-gray-700">{option}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Покрытие
                            </label>
                            <div className="space-y-2">
                              {['Оффсет', 'Soft-touch', 'Фольгирование', 'Кашировка', 'Высокая печать'].map((option) => (
                                <label key={option} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(params.coating || []).includes(option)}
                                    onChange={() => toggleArrayParam(itemId, 'coating', option)}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                                  />
                                  <span className="text-sm text-gray-700">{option}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Поля для печати */}
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                            <FileText className="h-4 w-4 text-primary-600" />
                            Печать
                          </label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={params.singleSidedPrint || false}
                                onChange={(e) => updateItemParam(itemId, 'singleSidedPrint', e.target.checked)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                              />
                              <span className="text-sm text-gray-700">Односторонняя печать</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={params.doubleSidedPrint || false}
                                onChange={(e) => updateItemParam(itemId, 'doubleSidedPrint', e.target.checked)}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                              />
                              <span className="text-sm text-gray-700">Двухсторонняя печать</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Поля для ZIP-Lock пакет */}
                    {hasMaterial && isZipLock && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4 pt-3 border-t-2 border-gray-200">
                          <Package className="h-5 w-5 text-primary-600" />
                          Параметры ZIP-Lock пакета
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Package className="h-4 w-4 text-primary-600" />
                              Плотность
                            </label>
                            <select
                              value={params.density || ''}
                              onChange={(e) => updateItemParam(itemId, 'density', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите</option>
                              <option value="120мкм">120мкм</option>
                              <option value="140мкм">140мкм</option>
                            </select>
                          </div>

                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Цвет пакета
                            </label>
                            <select
                              value={params.bagColor || ''}
                              onChange={(e) => updateItemParam(itemId, 'bagColor', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите</option>
                              <option value="Белый">Белый</option>
                              <option value="Черный">Черный</option>
                              <option value="Другой">Другой</option>
                            </select>
                            {params.bagColor === 'Другой' && (
                              <input
                                type="text"
                                placeholder="Укажите цвет пакета вручную"
                                value={params.bagColorCustom || ''}
                                onChange={(e) => updateItemParam(itemId, 'bagColorCustom', e.target.value)}
                                className="w-full mt-3 px-4 py-3 bg-white border-2 border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                                required
                              />
                            )}
                          </div>

                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Цвет бегунка
                            </label>
                            <select
                              value={params.sliderColor || ''}
                              onChange={(e) => updateItemParam(itemId, 'sliderColor', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите</option>
                              <option value="Белый">Белый</option>
                              <option value="Черный">Черный</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <FileText className="h-4 w-4 text-primary-600" />
                              Тип печати
                            </label>
                            <select
                              value={params.printType || ''}
                              onChange={(e) => updateItemParam(itemId, 'printType', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите</option>
                              <option value="Шелкография">Шелкография</option>
                              <option value="Флексография">Флексография</option>
                            </select>
                          </div>

                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                              <Palette className="h-4 w-4 text-primary-600" />
                              Цвет печати
                            </label>
                            <select
                              value={params.printColor || ''}
                              onChange={(e) => updateItemParam(itemId, 'printColor', e.target.value)}
                              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            >
                              <option value="">Выберите</option>
                              <option value="Белый">Белый</option>
                              <option value="Черный">Черный</option>
                              <option value="Другой">Другой</option>
                            </select>
                            {params.printColor === 'Другой' && (
                              <input
                                type="text"
                                placeholder="Укажите цвет печати вручную"
                                value={params.printColorCustom || ''}
                                onChange={(e) => updateItemParam(itemId, 'printColorCustom', e.target.value)}
                                className="w-full mt-3 px-4 py-3 bg-white border-2 border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                                required
                              />
                            )}
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200 relative">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                            <Calendar className="h-4 w-4 text-primary-600" />
                            Срок сдачи
                          </label>
                          <div className="flex gap-3">
                            <input
                              type="date"
                              value={params.desiredDeadline || ''}
                              onChange={(e) => updateItemParam(itemId, 'desiredDeadline', e.target.value)}
                              className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItemForCalendar(itemId)
                                setShowCalendar(prev => ({ ...prev, [itemId]: !prev[itemId] }))
                              }}
                              className="px-5 py-3 border-2 border-primary-400 text-primary-700 bg-white rounded-lg hover:bg-primary-50 hover:border-primary-500 transition-all font-semibold flex items-center gap-2 shadow-sm"
                            >
                              <Calendar className="h-4 w-4" />
                              Календарь
                            </button>
                          </div>
                          {showCalendarForItem && (
                            <div 
                              className="calendar-container absolute z-20 mt-3 bg-white border-2 border-primary-200 rounded-xl shadow-2xl p-5 w-80 left-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                                <button type="button" onClick={goToPreviousMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                                </button>
                                <div className="font-bold capitalize text-gray-900">{monthLabel}</div>
                                <button type="button" onClick={goToNextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                  <ChevronRight className="h-4 w-4 text-gray-600" />
                                </button>
                              </div>
                              <div className="grid grid-cols-7 gap-1.5 mb-3">
                                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                                  <div key={day} className="text-xs font-semibold text-gray-600 text-center py-2">{day}</div>
                                ))}
                              </div>
                              <div className="grid grid-cols-7 gap-1.5">
                                {calendarDays.map((day, idx) => {
                                  if (!day) return <div key={idx} className="h-10" />
                                  const dateKey = formatDateKey(day)
                                  const hasOrders = ordersDeadlines[dateKey] > 0
                                  const isSelected = params.desiredDeadline === dateKey
                                  const isToday = dateKey === formatDateKey(new Date())
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        updateItemParam(itemId, 'desiredDeadline', dateKey)
                                        setShowCalendar(prev => ({ ...prev, [itemId]: false }))
                                        setSelectedItemForCalendar(null)
                                      }}
                                      className={`h-10 text-sm rounded-lg transition-all font-medium ${
                                        isSelected
                                          ? 'bg-primary-600 text-white shadow-md scale-105'
                                          : isToday
                                          ? 'bg-primary-100 text-primary-900 font-semibold ring-2 ring-primary-300'
                                          : hasOrders
                                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                          : 'hover:bg-gray-100 text-gray-700'
                                      }`}
                                      title={hasOrders ? `На эту дату запланировано ${ordersDeadlines[dateKey]} заказ(ов)` : ''}
                                    >
                                      {day.getDate()}
                                    </button>
                                  )
                                })}
                              </div>
                              <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                                <button type="button" onClick={goToToday} className="text-sm text-primary-600 hover:text-primary-700 font-medium">Сегодня</button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowCalendar(prev => ({ ...prev, [itemId]: false }))
                                    setSelectedItemForCalendar(null)
                                  }}
                                  className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                                >
                                  Закрыть
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                            <FileText className="h-4 w-4 text-primary-600" />
                            Комментарий
                          </label>
                          <textarea
                            value={params.productionComments || ''}
                            onChange={(e) => updateItemParam(itemId, 'productionComments', e.target.value)}
                            placeholder="Комментарий по ZIP-Lock..."
                            className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none font-medium"
                            rows={3}
                          />
                        </div>
                      </div>
                    )}

                    {/* Срок сдачи (для всех материалов) */}
                    {hasMaterial && !isZipLock && (
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200 relative">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                          <Calendar className="h-4 w-4 text-primary-600" />
                          Срок сдачи
                        </label>
                        <div className="flex gap-3">
                          <input
                            type="date"
                            value={params.desiredDeadline || ''}
                            onChange={(e) => updateItemParam(itemId, 'desiredDeadline', e.target.value)}
                            className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all font-medium"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItemForCalendar(itemId)
                              setShowCalendar(prev => ({ ...prev, [itemId]: !prev[itemId] }))
                            }}
                            className="px-5 py-3 border-2 border-primary-400 text-primary-700 bg-white rounded-lg hover:bg-primary-50 hover:border-primary-500 transition-all font-semibold flex items-center gap-2 shadow-sm"
                          >
                            <Calendar className="h-4 w-4" />
                            Календарь
                          </button>
                        </div>
                        {/* Календарь с отображением других заказов */}
                        {showCalendarForItem && (
                          <div 
                            className="calendar-container absolute z-20 mt-3 bg-white border-2 border-primary-200 rounded-xl shadow-2xl p-5 w-80 left-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                              <button
                                type="button"
                                onClick={goToPreviousMonth}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <ChevronLeft className="h-4 w-4 text-gray-600" />
                              </button>
                              <div className="font-bold capitalize text-gray-900">{monthLabel}</div>
                              <button
                                type="button"
                                onClick={goToNextMonth}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <ChevronRight className="h-4 w-4 text-gray-600" />
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5 mb-3">
                              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                                <div key={day} className="text-xs font-semibold text-gray-600 text-center py-2">
                                  {day}
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                              {calendarDays.map((day, idx) => {
                                if (!day) {
                                  return <div key={idx} className="h-10" />
                                }
                                const dateKey = formatDateKey(day)
                                const hasOrders = ordersDeadlines[dateKey] > 0
                                const isSelected = params.desiredDeadline === dateKey
                                const isToday = dateKey === formatDateKey(new Date())
                                
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      updateItemParam(itemId, 'desiredDeadline', dateKey)
                                      setShowCalendar(prev => ({ ...prev, [itemId]: false }))
                                      setSelectedItemForCalendar(null)
                                    }}
                                    className={`h-10 text-sm rounded-lg transition-all font-medium ${
                                      isSelected
                                        ? 'bg-primary-600 text-white shadow-md scale-105'
                                        : isToday
                                        ? 'bg-primary-100 text-primary-900 font-semibold ring-2 ring-primary-300'
                                        : hasOrders
                                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                        : 'hover:bg-gray-100 text-gray-700'
                                    }`}
                                    title={hasOrders ? `На эту дату запланировано ${ordersDeadlines[dateKey]} заказ(ов)` : ''}
                                  >
                                    {day.getDate()}
                                  </button>
                                )
                              })}
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={goToToday}
                                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                              >
                                Сегодня
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCalendar(prev => ({ ...prev, [itemId]: false }))
                                  setSelectedItemForCalendar(null)
                                }}
                                className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                              >
                                Закрыть
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Комментарии (для всех кроме ZIP-Lock) */}
                    {hasMaterial && !isZipLock && (
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border border-gray-200">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                          <FileText className="h-4 w-4 text-primary-600" />
                          Комментарии
                        </label>
                        <textarea
                          value={params.productionComments || ''}
                          onChange={(e) => updateItemParam(itemId, 'productionComments', e.target.value)}
                          placeholder="Дополнительные комментарии по производству..."
                          className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none font-medium"
                          rows={3}
                        />
                      </div>
                    )}
                  </div>
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
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Отправка...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Отправить в производство</span>
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

