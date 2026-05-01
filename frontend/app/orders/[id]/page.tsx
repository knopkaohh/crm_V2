'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { getApiBaseUrl } from '@/lib/url'
import { auth } from '@/lib/auth'
import { Send, Edit2, Save, Trash2, X as XIcon } from 'lucide-react'

// Lazy loading для модального окна
const SendToProductionModal = dynamic(
  () => import('@/components/SendToProductionModal'),
  { 
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }
)

interface OrderItem {
  id?: string
  name?: string
  material?: string
  size?: string
  quantity: number
  price: number
  // Параметры производства
  designCount?: number
  baseColor?: string | null
  baseColorCustom?: string | null
  printColor?: string | null
  printColorCustom?: string | null
  cutting?: string | null
  centerFold?: string | null
  freeEdge?: string | null
  postProcessing?: string | null
  coating?: string | null
  singleSidedPrint?: boolean | null
  doubleSidedPrint?: boolean | null
  density?: string | null
  bagColor?: string | null
  sliderColor?: string | null
  desiredDeadline?: string | null
  productionComments?: string | null
  productionStartDate?: string | null
  productionEndDate?: string | null
}

interface Order {
  id: string
  orderNumber: string
  status: string
  client: { id: string; name: string; phone?: string; company?: string | null; contactMethod?: string | null; telegram?: string | null }
  manager?: { id: string; firstName: string; lastName: string }
  creator?: { id: string; firstName: string; lastName: string }
  designTakenByUser?: { id: string; firstName: string; lastName: string } | null
  designTakenAt?: string | null
  designStage?: 'IN_DEVELOPMENT' | 'ON_APPROVAL'
  designNeedsRevision?: boolean
  designComments?: string | null
  description?: string | null
  source?: string | null
  totalAmount: number
  items: OrderItem[]
  deadline: string | null
  createdAt: string
  comments?: any[]
  files?: any[]
}

interface Task {
  id: string
  title: string
  status: string
  dueDate: string | null
}

const statusLabels: Record<string, string> = {
  NEW_ORDER: 'Новый заказ',
  DESIGN_APPROVAL: 'Макеты в разработке',
  AWAITING_MATERIALS: 'Готовы к запуску',
  IN_PRODUCTION: 'В производстве',
  ORDER_READY: 'Заказ готов',
  ORDER_DELIVERED: 'Заказ доставлен',
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [designComment, setDesignComment] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [showProductionModal, setShowProductionModal] = useState(false)
  
  // Режим редактирования
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    clientName: '',
    clientPhone: '',
    clientCompany: '',
    source: '',
    deadline: '',
    description: '',
    items: [] as OrderItem[],
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [designStage, setDesignStage] = useState<'IN_DEVELOPMENT' | 'ON_APPROVAL'>('IN_DEVELOPMENT')

  useEffect(() => {
    if (orderId) {
      loadOrder()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    if (order) {
      loadTasks()
      if (order.status === 'DESIGN_APPROVAL') {
        setDesignStage(order.designStage === 'ON_APPROVAL' ? 'ON_APPROVAL' : 'IN_DEVELOPMENT')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const loadOrder = async () => {
    try {
      const res = await api.get(`/orders/${orderId}`, {
        headers: { 'X-Skip-Cache': '1' },
      })
      setOrder(res.data)
      setDesignComment('')
      // Инициализируем форму редактирования
      setEditForm({
        clientName: res.data.client.name,
        clientPhone: res.data.client.phone || '',
        clientCompany: res.data.client.company || '',
        source: res.data.source || '',
        deadline: res.data.deadline ? new Date(res.data.deadline).toISOString().slice(0, 16) : '',
        description: res.data.description || '',
        items: res.data.items || [],
      })
    } catch (e) {
      console.error('Failed to load order:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleTakeDesign = async () => {
    if (!order) return
    try {
      const takenAt = new Date().toISOString()
      // Optimistic update: показываем блок макета сразу после клика.
      setOrder((prev) => (prev ? { ...prev, designTakenAt: takenAt } : prev))
      await api.put(`/orders/${order.id}`, { takeDesign: true })
      void loadOrder()
    } catch (e) {
      console.error('Failed to take design:', e)
      alert('Не удалось взять заказ в работу')
      await loadOrder()
    }
  }

  const getCurrentStageLabel = () => {
    if (!order) return 'Неизвестный этап'
    if (order.status === 'DESIGN_APPROVAL' && designStage === 'IN_DEVELOPMENT') return 'Макеты в разработке'
    if (order.status === 'DESIGN_APPROVAL' && designStage === 'ON_APPROVAL') return 'Макеты на согласовании'
    return statusLabels[order.status] || order.status
  }

  const handleAddStageNote = async () => {
    if (!order) return
    const text = designComment.trim()
    if (!text) {
      alert('Введите текст заметки')
      return
    }

    try {
      const content = `【Этап: ${getCurrentStageLabel()}】 ${text}`
      await api.post(`/orders/${order.id}/comments`, { content })
      setDesignComment('')
      await loadOrder()
    } catch (e) {
      console.error('Failed to save stage note:', e)
      alert('Не удалось сохранить заметку')
    }
  }

  const handleSendForApproval = async () => {
    if (!order) return
    
    // Проверяем, что есть загруженные файлы макета
    if (!order.files || order.files.length === 0) {
      alert('Необходимо загрузить хотя бы один файл макета перед отправкой на согласование')
      return
    }
    
    try {
      // Сохраняем комментарий и отправляем на согласование
      await api.put(`/orders/${order.id}`, { 
        sendForApproval: true,
        designStage: 'ON_APPROVAL',
        designNeedsRevision: false,
      })
      setDesignStage('ON_APPROVAL')
      await loadOrder()
    } catch (e) {
      console.error('Failed to send for approval:', e)
      alert('Не удалось отправить на согласование')
    }
  }

  const handleDesignConfirmed = async () => {
    if (!order) return
    try {
      await api.put(`/orders/${order.id}`, { status: 'AWAITING_MATERIALS' })
      setDesignStage('ON_APPROVAL')
      await loadOrder()
    } catch (e) {
      console.error('Failed to confirm design:', e)
      alert('Не удалось согласовать макет')
    }
  }

  const handleDesignRevision = async () => {
    if (!order) return
    try {
      await api.put(`/orders/${order.id}`, { status: 'DESIGN_APPROVAL', designStage: 'IN_DEVELOPMENT', designNeedsRevision: true })
      setDesignStage('IN_DEVELOPMENT')
      await loadOrder()
    } catch (e) {
      console.error('Failed to return design for revision:', e)
      alert('Не удалось вернуть макет на правки')
    }
  }

  const handleOrderStarted = async () => {
    if (!order) return
    try {
      await api.put(`/orders/${order.id}`, { status: 'IN_PRODUCTION' })
      await loadOrder()
    } catch (e) {
      console.error('Failed to start order:', e)
      alert('Не удалось запустить заказ')
    }
  }

  const handleItemStarted = async (itemId?: string) => {
    if (!order || !itemId) return
    const targetItem = (order.items || []).find((item) => item.id === itemId)
    if (targetItem?.productionStartDate) return

    await api.put(`/orders/${order.id}/items/${itemId}`, {
      productionStartDate: new Date().toISOString(),
    })

    const refreshed = await api.get(`/orders/${order.id}`, {
      headers: { 'X-Skip-Cache': '1' },
    })
    setOrder(refreshed.data)
    const itemIds = (refreshed.data.items || []).map((item: OrderItem) => item.id).filter(Boolean) as string[]
    const allStarted = itemIds.length > 0 && itemIds.every((id) => {
      const item = (refreshed.data.items || []).find((it: OrderItem) => it.id === id)
      return Boolean(item?.productionStartDate)
    })
    if (allStarted) {
      await handleOrderStarted()
    }
  }

  const handleOrderReady = async () => {
    if (!order) return
    try {
      await api.put(`/orders/${order.id}`, { status: 'ORDER_READY' })
      await loadOrder()
    } catch (e) {
      console.error('Failed to mark order ready:', e)
      alert('Не удалось перевести заказ в "Готов"')
    }
  }

  const handleDesignFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !order) return

    setUploadingFile(true)
    try {
      const uploadedFiles: any[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('orderId', order.id)

        // Важно: не выставляем вручную Content-Type для multipart/form-data,
        // иначе Axios может не проставить boundary и backend получит req.file = undefined.
        const res = await api.post('/files/upload', formData)

        if (res?.data) {
          uploadedFiles.push(res.data)
        }
      }

      if (uploadedFiles.length > 0) {
        // Показываем загруженные файлы сразу, без ручного обновления страницы.
        setOrder((prev) => {
          if (!prev) return prev
          const existing = prev.files || []
          const existingIds = new Set(existing.map((f: any) => f.id))
          const newUnique = uploadedFiles.filter((f: any) => f?.id && !existingIds.has(f.id))
          return { ...prev, files: [...newUnique, ...existing] }
        })
      }

      void loadOrder()
      e.target.value = ''
    } catch (error) {
      console.error('Failed to upload file:', error)
      const message = (error as any)?.response?.data?.error || 'Не удалось загрузить файл'
      alert(message)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleDeleteDesignFile = async (fileId: string) => {
    if (!order) return
    const confirmed = window.confirm('Удалить файл из заказа?')
    if (!confirmed) return

    setDeletingFileId(fileId)
    try {
      await api.delete(`/files/${fileId}`)
      setOrder((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          files: (prev.files || []).filter((file: any) => file.id !== fileId),
        }
      })
    } catch (error) {
      console.error('Failed to delete file:', error)
      alert('Не удалось удалить файл')
    } finally {
      setDeletingFileId(null)
    }
  }

  const handleSaveEdit = async () => {
    if (!order) return
    
    setSavingEdit(true)
    try {
      // Обновляем данные клиента
      await api.put(`/clients/${order.client.id}`, {
        name: editForm.clientName,
        phone: editForm.clientPhone,
        company: editForm.clientCompany || null,
      })
      
      // Обновляем данные заказа
      await api.put(`/orders/${order.id}`, {
        source: editForm.source,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
        description: editForm.description || null,
        items: editForm.items.map(item => ({
          id: item.id,
          name: item.name,
          material: item.material,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        })),
      })
      
      // Перезагружаем данные
      await loadOrder()
      setIsEditing(false)
    } catch (e) {
      console.error('Failed to save changes:', e)
      alert('Не удалось сохранить изменения')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCancelEdit = () => {
    if (!order) return
    setEditForm({
      clientName: order.client.name,
      clientPhone: order.client.phone || '',
      clientCompany: order.client.company || '',
      source: order.source || '',
      deadline: order.deadline ? new Date(order.deadline).toISOString().slice(0, 16) : '',
      description: order.description || '',
      items: order.items || [],
    })
    setIsEditing(false)
  }

  const updateEditItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...editForm.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setEditForm({ ...editForm, items: newItems })
  }

  const addEditItem = () => {
    setEditForm({
      ...editForm,
      items: [...editForm.items, {
        name: '',
        material: '',
        size: '',
        quantity: 1,
        price: 0,
      }],
    })
  }

  const removeEditItem = (index: number) => {
    if (editForm.items.length === 1) return
    const newItems = editForm.items.filter((_, i) => i !== index)
    setEditForm({ ...editForm, items: newItems })
  }

  const loadTasks = async () => {
    if (!order) return
    try {
      const res = await api.get('/tasks')
      // Filter active tasks where description contains client name
      const activeStatuses = ['PENDING', 'IN_PROGRESS']
      const clientTasks = res.data.filter((t: Task & { description?: string }) => {
        if (!activeStatuses.includes(t.status)) return false
        if (!t.description) return false
        // Check if task description contains client name
        return t.description.includes(order.client.name) || 
               t.description.includes(`Клиент: ${order.client.name}`)
      })
      setTasks(clientTasks)
    } catch (e) {
      console.error('Failed to load tasks:', e)
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

  if (!order) {
    return (
      <Layout>
        <div className="text-center text-gray-500">Заказ не найден</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Заказ {order.orderNumber || order.id}</h1>
            <p className="text-gray-600 mt-1">{statusLabels[order.status] || order.status}</p>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={savingEdit}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {savingEdit ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Сохранить
                </button>
              </>
            ) : (
              <>
                {order.status === 'DESIGN_APPROVAL' && designStage === 'IN_DEVELOPMENT' && (
                  <button
                    onClick={handleSendForApproval}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                  >
                    Отправить на согласование
                  </button>
                )}
                {order.status === 'DESIGN_APPROVAL' && designStage === 'ON_APPROVAL' && (
                  <>
                    <button
                      onClick={handleDesignConfirmed}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                    >
                      Макет согласован
                    </button>
                    <button
                      onClick={handleDesignRevision}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-semibold"
                    >
                      Внести правки
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  Редактировать
                </button>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Назад
          </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5 space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-2">Клиент</p>
                {isEditing ? (
                  <div className="space-y-2 max-w-md">
                    <input
                      type="text"
                      value={editForm.clientName}
                      onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                      placeholder="Имя клиента"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <input
                      type="tel"
                      value={editForm.clientPhone}
                      onChange={(e) => setEditForm({ ...editForm, clientPhone: e.target.value })}
                      placeholder="Телефон"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={editForm.clientCompany}
                      onChange={(e) => setEditForm({ ...editForm, clientCompany: e.target.value })}
                      placeholder="Бренд (необязательно)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                ) : (
                  <>
                <p className="text-lg font-semibold text-gray-900">{order.client.name}</p>
                {order.client.phone && <p className="text-gray-700">{order.client.phone}</p>}
                  </>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Сумма</p>
                <p className="text-xl font-bold text-gray-900">
                  {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
                    isEditing 
                      ? editForm.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0)
                      : Number(order.totalAmount)
                  )}
                </p>
              </div>
            </div>

            {(isEditing ? editForm.items : order.items)?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">Позиции заказа</p>
                  {isEditing && (
                    <button
                      onClick={addEditItem}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      + Добавить позицию
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {(isEditing ? editForm.items : order.items).map((it, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={it.name || ''}
                                onChange={(e) => updateEditItem(idx, 'name', e.target.value)}
                                placeholder="Название"
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              <input
                                type="text"
                                value={it.material || ''}
                                onChange={(e) => updateEditItem(idx, 'material', e.target.value)}
                                placeholder="Материал"
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              <input
                                type="text"
                                value={it.size || ''}
                                onChange={(e) => updateEditItem(idx, 'size', e.target.value)}
                                placeholder="Размер"
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="number"
                                  value={it.quantity}
                                  onChange={(e) => updateEditItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                  placeholder="Кол-во"
                                  min="1"
                                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                                <input
                                  type="number"
                                  value={it.price}
                                  onChange={(e) => updateEditItem(idx, 'price', parseFloat(e.target.value) || 0)}
                                  placeholder="Цена"
                                  min="0"
                                  step="0.01"
                                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                              </div>
                            </div>
                            {editForm.items.length > 1 && (
                              <button
                                onClick={() => removeEditItem(idx)}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <XIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-gray-800 font-medium">
                          {(it.name || `${it.material || ''} ${it.size || ''}`).trim() || 'Позиция'}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-gray-600">
                            x{it.quantity} — {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(it.price))}
                          </div>
                          {order.status === 'AWAITING_MATERIALS' && it.id && (
                            <button
                              type="button"
                              onClick={() => handleItemStarted(it.id)}
                              disabled={Boolean(it.productionStartDate)}
                              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                                it.productionStartDate
                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                                  : 'bg-primary-600 text-white hover:bg-primary-700'
                              }`}
                            >
                              Запущено
                            </button>
                          )}
                        </div>
                      </div>
                        </>
                      )}
                      {!isEditing && (
                        <>
                      {/* Параметры производства */}
                      {(it.material || it.designCount || it.baseColor || it.printColor || it.cutting || 
                        it.postProcessing || it.coating || it.singleSidedPrint !== undefined || 
                        it.doubleSidedPrint !== undefined || it.density || it.desiredDeadline || 
                        it.productionComments) && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Параметры производства</p>
                          
                          {it.material && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500 min-w-[120px]">Материал:</span>
                              <span className="text-gray-900 font-medium">{it.material}</span>
                            </div>
                          )}
                          
                          {it.designCount && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500 min-w-[120px]">Кол-во макетов:</span>
                              <span className="text-gray-900 font-medium">{it.designCount}</span>
                            </div>
                          )}
                          
                          {/* Параметры для Сатин, Силикон, Хлопок, Жаккард */}
                          {(it.baseColor || it.printColor || it.cutting || it.centerFold || it.freeEdge) && (
                            <>
                              {it.baseColor && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Цвет основы:</span>
                                  <span className="text-gray-900 font-medium">
                                    {it.baseColor === 'Цветной' && it.baseColorCustom 
                                      ? it.baseColorCustom 
                                      : it.baseColor}
                                  </span>
                                </div>
                              )}
                              
                              {it.printColor && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Цвет печати:</span>
                                  <span className="text-gray-900 font-medium">
                                    {it.printColor === 'Цветной' && it.printColorCustom 
                                      ? it.printColorCustom 
                                      : it.printColor}
                                  </span>
                                </div>
                              )}
                              
                              {it.cutting && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Резка:</span>
                                  <span className="text-gray-900 font-medium">{it.cutting}</span>
                                </div>
                              )}
                              
                              {it.centerFold && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Подгибка по центру:</span>
                                  <span className="text-gray-900 font-medium">{it.centerFold}</span>
                                </div>
                              )}
                              
                              {it.freeEdge && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Свободный край:</span>
                                  <span className="text-gray-900 font-medium">{it.freeEdge}</span>
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* Параметры для Картона */}
                          {(it.postProcessing || it.coating || it.singleSidedPrint !== undefined || it.doubleSidedPrint !== undefined) && (
                            <>
                              {it.postProcessing && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Постобработка:</span>
                                  <span className="text-gray-900 font-medium">{it.postProcessing}</span>
                                </div>
                              )}
                              
                              {it.coating && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Покрытие:</span>
                                  <span className="text-gray-900 font-medium">{it.coating}</span>
                                </div>
                              )}
                              
                              {(it.singleSidedPrint || it.doubleSidedPrint) && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Печать:</span>
                                  <span className="text-gray-900 font-medium">
                                    {[
                                      it.singleSidedPrint && 'Односторонняя',
                                      it.doubleSidedPrint && 'Двухсторонняя'
                                    ].filter(Boolean).join(', ') || 'Не указано'}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* Параметры для ZIP-Lock пакет */}
                          {(it.density || it.bagColor || it.sliderColor) && (
                            <>
                              {it.density && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Плотность:</span>
                                  <span className="text-gray-900 font-medium">{it.density}</span>
                                </div>
                              )}
                              
                              {it.bagColor && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Цвет пакета:</span>
                                  <span className="text-gray-900 font-medium">{it.bagColor}</span>
                                </div>
                              )}
                              
                              {it.sliderColor && (
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-gray-500 min-w-[120px]">Цвет бегунка:</span>
                                  <span className="text-gray-900 font-medium">{it.sliderColor}</span>
                                </div>
                              )}
                            </>
                          )}
                          
                          {it.desiredDeadline && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500 min-w-[120px]">Срок сдачи:</span>
                              <span className="text-gray-900 font-medium">
                                {new Date(it.desiredDeadline).toLocaleDateString('ru-RU')}
                              </span>
                            </div>
                          )}
                          
                          {it.productionComments && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500 min-w-[120px]">Комментарии:</span>
                              <span className="text-gray-900">{it.productionComments}</span>
                            </div>
                          )}
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5 space-y-4">
            {order.manager && (
              <div>
                <p className="text-sm text-gray-500">Ответственный менеджер</p>
                <p className="text-gray-900 font-medium">
                  {order.manager.firstName} {order.manager.lastName}
                </p>
              </div>
            )}
            {order.client.company && (
              <div>
                <p className="text-sm text-gray-500">Бренд</p>
                <p className="text-gray-900 font-medium">{order.client.company}</p>
              </div>
            )}
            {order.client.phone && (
              <div>
                <p className="text-sm text-gray-500">Телефон клиента</p>
                <p className="text-gray-900 font-medium">{order.client.phone}</p>
              </div>
            )}
            {(order.client.contactMethod || order.client.telegram) && (
              <div>
                <p className="text-sm text-gray-500">Способ связи</p>
                <p className="text-gray-900 font-medium">
                  {order.client.contactMethod || '—'}
                  {order.client.telegram ? ` • ${order.client.telegram}` : ''}
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-gray-100 bg-primary-50/40 p-4">
              <p className="text-sm text-gray-500">Описание заказа</p>
              <p className="mt-1 text-gray-900 whitespace-pre-wrap">{order.description || '—'}</p>
            </div>
            {order.status === 'NEW_ORDER' && !order.designTakenAt && (
              <button
                onClick={handleTakeDesign}
                className="w-full mt-1 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Взять в работу
              </button>
            )}
            {order.status === 'IN_PRODUCTION' && (
              <button
                onClick={handleOrderReady}
                className="w-full mt-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                Заказ готов
              </button>
            )}
          </div>
        </div>

        {/* Макет секция */}
        {(order.designTakenAt || order.status === 'DESIGN_APPROVAL') && (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
            {order.designTakenByUser && order.designTakenAt && (
              <p className="text-sm text-gray-600">
                Взят в работу: {order.designTakenByUser.firstName} {order.designTakenByUser.lastName} • {new Date(order.designTakenAt).toLocaleString('ru-RU')}
              </p>
            )}

            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-800">Комментарии к заказу/макету</p>
                </div>
                <div className="p-3 space-y-2 max-h-72 overflow-y-auto bg-gradient-to-b from-white to-gray-50/60">
                  {(order.comments || []).length > 0 ? (
                    order.comments!.map((comment: any) => {
                      const text = String(comment.content || '')
                      const stageMatch = text.match(/^【Этап:\s(.+?)】\s([\s\S]*)$/)
                      const stageLabel = stageMatch ? stageMatch[1] : null
                      const noteText = stageMatch ? stageMatch[2] : text
                      return (
                        <div key={comment.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                          {stageLabel && <p className="text-[11px] font-semibold text-primary-700 mb-1">{stageLabel}</p>}
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{noteText}</p>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {comment.user?.firstName || ''} {comment.user?.lastName || ''} • {new Date(comment.createdAt).toLocaleString('ru-RU')}
                          </p>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-gray-500 px-1 py-2">Сообщений пока нет</p>
                  )}
                </div>
                <div className="p-3 border-t border-gray-200 bg-white">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={designComment}
                      onChange={(e) => setDesignComment(e.target.value)}
                      placeholder="Напишите комментарий..."
                      rows={2}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    />
                    <button
                      onClick={handleAddStageNote}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                    >
                      Отправить
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Файлы макета</label>
                <input
                  type="file"
                  onChange={handleDesignFileUpload}
                  disabled={uploadingFile}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                  multiple
                />
                {order.files && order.files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {order.files.map((file: any) => (
                      <div key={file.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{file.originalName}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(file.createdAt).toLocaleString('ru-RU')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`${getApiBaseUrl()}/files/${file.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                          >
                            Скачать
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteDesignFile(file.id)}
                            disabled={deletingFileId === file.id}
                            className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingFileId === file.id ? 'Удаление...' : 'Удалить'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Кнопка "Взять в работу" для новых заказов */}
        {/* Кнопка "Отправить в производство" после взятия в работу */}
        {order.status === 'NEW_ORDER' && order.designTakenAt && (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Заказ в работе</h3>
                <p className="text-sm text-gray-600 mt-1">Заполните параметры производства и отправьте заказ в производство</p>
              </div>
              <button
                onClick={() => setShowProductionModal(true)}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Отправить в производство
              </button>
            </div>
          </div>
        )}

        <SendToProductionModal
          order={order}
          open={showProductionModal}
          onClose={() => setShowProductionModal(false)}
          onSuccess={async () => {
            await loadOrder()
            setShowProductionModal(false)
          }}
        />
      </div>
    </Layout>
  )
}


