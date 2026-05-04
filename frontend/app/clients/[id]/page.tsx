'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { downloadProtectedFile } from '@/lib/downloadProtectedFile'
import { File, Send, X, Sparkles, Clock3, ShoppingCart, MessageCircle, UserX, UserPlus, UserCheck } from 'lucide-react'

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    firstName: string
    lastName: string
  }
}

interface FileItem {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
}

interface UserRef {
  id: string
  firstName: string
  lastName: string
}

interface Order {
  id: string
  orderNumber: string
  status: string
  totalAmount: number
  createdAt: string
  comments: Comment[]
  files: FileItem[]
  manager: UserRef
}

interface Lead {
  id: string
  status: string
  source?: string | null
  nextContactDate?: string | null
  description?: string | null
  createdAt: string
  comments: Comment[]
  files: FileItem[]
  manager: UserRef
}

interface Client {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string
  whatsapp: string | null
  address: string | null
  notes: string | null
  contactMethod: string | null
  telegram: string | null
  createdAt: string
  createdById?: string | null
  createdBy?: UserRef | null
  orders: Order[]
  leads: Lead[]
}

interface ManagerOption {
  id: string
  firstName: string
  lastName: string
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'orders' | 'history' | 'files'>('orders')
  const [newComment, setNewComment] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [closingClient, setClosingClient] = useState(false)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [newContactModalOpen, setNewContactModalOpen] = useState(false)
  const [creatingContact, setCreatingContact] = useState(false)
  const [newContactForm, setNewContactForm] = useState({
    nextContactDate: '',
    contactPurpose: '',
    notes: '',
    additionalContactType: '',
    additionalContactValue: '',
  })

  useEffect(() => {
    if (clientId) {
      loadClient()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    loadManagers()
  }, [])

  const loadClient = async () => {
    try {
      const res = await api.get(`/clients/${clientId}`)
      setClient(res.data)
    } catch (e) {
      console.error('Failed to load client:', e)
    } finally {
      setLoading(false)
    }
  }

  const getTomorrowNoon = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(12, 0, 0, 0)
    const y = tomorrow.getFullYear()
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0')
    const d = String(tomorrow.getDate()).padStart(2, '0')
    const h = String(tomorrow.getHours()).padStart(2, '0')
    const min = String(tomorrow.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}T${h}:${min}`
  }

  const loadManagers = async () => {
    try {
      const response = await api.get('/leads', { params: { limit: 200 } })
      const leadsData = response.data?.data || []
      const managerMap = new Map<string, ManagerOption>()
      leadsData.forEach((leadItem: any) => {
        if (leadItem?.manager?.id) {
          managerMap.set(leadItem.manager.id, leadItem.manager)
        }
      })
      setManagers(Array.from(managerMap.values()))
    } catch (error) {
      console.error('Failed to load managers:', error)
      setManagers([])
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || !client) return

    // Автоматически выбираем первый заказ или первый лид
    const orderId = client.orders.length > 0 ? client.orders[0].id : null
    const leadId = !orderId && client.leads.length > 0 ? client.leads[0].id : null

    if (!orderId && !leadId) {
      alert('Нет заказов или лидов для добавления комментария')
      return
    }

    try {
      await api.post(`/clients/${clientId}/comments`, {
        content: newComment,
        orderId: orderId,
        leadId: leadId,
      })
      setNewComment('')
      loadClient()
    } catch (e) {
      console.error('Failed to add comment:', e)
      alert('Не удалось добавить комментарий')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !client) return

    // Автоматически выбираем первый заказ или первый лид
    const orderId = client.orders.length > 0 ? client.orders[0].id : null
    const leadId = !orderId && client.leads.length > 0 ? client.leads[0].id : null

    if (!orderId && !leadId) {
      alert('Нет заказов или лидов для загрузки файла')
      e.target.value = ''
      return
    }

    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (orderId) formData.append('orderId', orderId)
      if (leadId) formData.append('leadId', leadId)

      await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      loadClient()
      e.target.value = ''
    } catch (error) {
      console.error('Failed to upload file:', error)
      alert('Не удалось загрузить файл')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleDownloadClientFile = async (fileId: string, originalName: string) => {
    setDownloadingFileId(fileId)
    try {
      await downloadProtectedFile(fileId, originalName)
    } catch (error: unknown) {
      console.error('Failed to download file:', error)
      const message =
        error instanceof Error ? error.message : 'Не удалось скачать файл'
      alert(message)
    } finally {
      setDownloadingFileId(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleCloseClient = async () => {
    if (!closeReason.trim()) {
      alert('Укажите причину закрытия клиента')
      return
    }

    setClosingClient(true)
    try {
      await api.post(`/clients/${clientId}/close`, {
        reason: closeReason.trim(),
        notes: closeNotes.trim() || undefined,
      })
      setCloseModalOpen(false)
      router.push('/clients?tab=closed')
    } catch (error: any) {
      console.error('Failed to close client:', error)
      alert(error.response?.data?.error || 'Не удалось закрыть клиента')
    } finally {
      setClosingClient(false)
    }
  }

  const handleCreateOrder = () => {
    if (!client) return
    const params = new URLSearchParams()
    params.set('clientId', client.id)
    params.set('clientName', client.name)
    if (client.phone) params.set('clientPhone', client.phone)
    if (client.company) params.set('clientBrand', client.company)
    params.set('source', 'Постоянные клиенты')
    router.push(`/orders/new?${params.toString()}`)
  }

  const openNewContactModal = () => {
    setNewContactForm({
      nextContactDate: getTomorrowNoon(),
      contactPurpose: '',
      notes: '',
      additionalContactType: '',
      additionalContactValue: '',
    })
    setNewContactModalOpen(true)
  }

  const handleCreateNewContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client) return
    if (!newContactForm.nextContactDate) {
      alert('Укажите дату следующего контакта')
      return
    }
    setCreatingContact(true)
    try {
      let description = ''
      if (newContactForm.contactPurpose.trim()) {
        description = `Цель контакта: ${newContactForm.contactPurpose.trim()}`
      }
      if (newContactForm.notes.trim()) {
        description += (description ? '\n\n' : '') + `Заметки: ${newContactForm.notes.trim()}`
      }
      if (
        newContactForm.additionalContactType &&
        newContactForm.additionalContactValue.trim()
      ) {
        description +=
          (description ? '\n\n' : '') +
          `Дополнительная форма связи (${newContactForm.additionalContactType}): ${newContactForm.additionalContactValue.trim()}`
      }

      await api.post('/leads', {
        clientId: client.id,
        source: 'Постоянные клиенты',
        status: 'NEW_LEAD',
        nextContactDate: new Date(newContactForm.nextContactDate).toISOString(),
        description: description || null,
      })
      setNewContactModalOpen(false)
      router.push('/leads')
    } catch (error) {
      console.error('Failed to create new contact:', error)
      alert('Не удалось назначить новый контакт')
    } finally {
      setCreatingContact(false)
    }
  }

  const handleTransferClient = async () => {
    if (!client || !selectedManagerId) return
    const latestLead = client.leads?.[0]
    if (!latestLead) {
      alert('У клиента нет активного контакта для передачи. Сначала назначьте новый контакт.')
      return
    }
    setTransferring(true)
    try {
      await api.put(`/leads/${latestLead.id}`, { managerId: selectedManagerId })
      setTransferModalOpen(false)
      setSelectedManagerId('')
      await loadClient()
    } catch (error) {
      console.error('Failed to transfer client:', error)
      alert('Не удалось передать клиента')
    } finally {
      setTransferring(false)
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

  if (!client) {
    return (
      <Layout>
        <div className="text-center text-gray-500">Клиент не найден</div>
      </Layout>
    )
  }

  const formatUserName = (user: Pick<UserRef, 'firstName' | 'lastName'> | null | undefined) =>
    user ? `${user.firstName} ${user.lastName}`.trim() : null

  const responsibleManager =
    client.createdBy ?? client.leads[0]?.manager ?? client.orders[0]?.manager ?? null

  // Собираем всю историю из заказов и лидов
  const allComments: (Comment & { source: string; sourceId: string })[] = []
  client.orders.forEach((order) => {
    order.comments.forEach((comment) => {
      allComments.push({
        ...comment,
        source: `Заказ ${order.orderNumber}`,
        sourceId: order.id,
      })
    })
  })
  client.leads.forEach((lead) => {
    lead.comments.forEach((comment) => {
      allComments.push({
        ...comment,
        source: `Лид #${lead.id.slice(0, 8)}`,
        sourceId: lead.id,
      })
    })
  })
  allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const leadHistory = client.leads.map((lead) => ({
    id: lead.id,
    source: lead.source || '—',
    nextContactDate: lead.nextContactDate,
    description: lead.description || '—',
    createdAt: lead.createdAt,
    status: lead.status,
    managerName: lead.manager ? `${lead.manager.firstName} ${lead.manager.lastName}` : 'Система',
  }))

  type HistoryEvent = {
    id: string
    createdAt: string
    author: string
    text: string
    kind: 'comment' | 'order' | 'lead' | 'note'
  }

  const historyEvents: HistoryEvent[] = [
    ...allComments.map((comment) => ({
      id: `comment-${comment.id}`,
      createdAt: comment.createdAt,
      author: `${comment.user.firstName} ${comment.user.lastName}`,
      text: comment.content,
      kind: 'comment' as const,
    })),
    ...client.orders.map((order) => ({
      id: `order-${order.id}`,
      createdAt: order.createdAt,
      author: `${order.manager.firstName} ${order.manager.lastName}`,
      text: `Создан новый заказ ${order.orderNumber || order.id.slice(0, 8)}`,
      kind: 'order' as const,
    })),
    ...leadHistory.map((entry) => ({
      id: `lead-${entry.id}`,
      createdAt: entry.createdAt,
      author: entry.managerName,
      text: `Лид (${entry.status}). Источник: ${entry.source}. ${entry.description}`,
      kind: 'lead' as const,
    })),
    ...(client.notes
      ? [
          {
            id: `client-note-${client.id}`,
            createdAt: client.createdAt,
            author: 'Система',
            text: client.notes,
            kind: 'note' as const,
          },
        ]
      : []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Собираем все файлы из заказов и лидов
  const allFiles: (FileItem & { source: string; sourceId: string; sourceType: 'order' | 'lead' })[] = []
  client.orders.forEach((order) => {
    order.files.forEach((file) => {
      allFiles.push({
        ...file,
        source: `Заказ ${order.orderNumber}`,
        sourceId: order.id,
        sourceType: 'order',
      })
    })
  })
  client.leads.forEach((lead) => {
    lead.files.forEach((file) => {
      allFiles.push({
        ...file,
        source: `Лид #${lead.id.slice(0, 8)}`,
        sourceId: lead.id,
        sourceType: 'lead',
      })
    })
  })
  allFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <Layout>
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5">
          <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-6 py-4">
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Карточка клиента
                </p>
                <h1 className="mt-1 text-3xl font-bold text-gray-900">{client.name}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCloseReason('')
                    setCloseNotes(client.notes || '')
                    setCloseModalOpen(true)
                  }}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Закрыть клиента
                </button>
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Назад
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5">
          <div className="bg-gray-50/60 px-6 py-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm shadow-primary-100">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                  Основные данные
                </h3>
                <div>
                  <p className="text-sm text-gray-500">Компания / Бренд</p>
                  <p className="text-gray-900 font-medium">{client.company || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Телефон</p>
                  <p className="text-gray-900 font-medium">{client.phone}</p>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm shadow-primary-100">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                  Контакты и заметки
                </h3>
                <div>
                  <p className="text-sm text-gray-500">Менеджер</p>
                  <p className="text-gray-900 font-medium">
                    {formatUserName(responsibleManager) ?? '—'}
                  </p>
                </div>
                {(client.contactMethod || client.telegram) ? (
                  <div>
                    <p className="text-sm text-gray-500">Дополнительная форма связи</p>
                    <p className="text-gray-900 font-medium">
                      {client.contactMethod || '—'}
                      {client.contactMethod === 'Telegram' && client.telegram && (
                        <span className="ml-1 text-primary-600">
                          ({client.telegram.startsWith('@') ? client.telegram : `@${client.telegram}`})
                        </span>
                      )}
                      {client.contactMethod === 'WhatsApp' && client.phone && (
                        <span className="ml-1 text-gray-600">— {client.phone}</span>
                      )}
                      {client.contactMethod === 'MAX' && client.phone && (
                        <span className="ml-1 text-gray-600">— {client.phone}</span>
                      )}
                      {client.contactMethod === 'Почта' && client.email && (
                        <span className="ml-1 text-gray-600">— {client.email}</span>
                      )}
                    </p>
                  </div>
                ) : null}
                {client.address ? (
                  <div>
                    <p className="text-sm text-gray-500">Адрес</p>
                    <p className="text-gray-900 font-medium">{client.address}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-sm text-gray-500">Заметки</p>
                  <p className="text-gray-900 font-medium whitespace-pre-wrap">{client.notes || '—'}</p>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5">
          <p className="text-sm text-gray-500 mb-2">Клиент</p>
          <p className="text-gray-900 font-semibold">{client.name}</p>
          <p className="text-gray-700 mt-2">{client.phone}</p>
          <div className="mt-3 space-y-2">
            <button
              onClick={handleCreateOrder}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ShoppingCart className="h-4 w-4" />
              Заказ
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              <MessageCircle className="h-4 w-4" />
              Заметки
            </button>
            <button
              onClick={() => {
                setSelectedManagerId('')
                setTransferModalOpen(true)
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-medium"
            >
              <UserCheck className="h-4 w-4" />
              Передать клиента
            </button>
            <button
              onClick={openNewContactModal}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium"
            >
              <UserPlus className="h-4 w-4" />
              Назначить новый контакт
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px px-3 pt-3">
              <button
                onClick={() => setActiveTab('orders')}
                className={`mr-2 rounded-t-xl px-5 py-2.5 text-sm font-medium border-b-2 ${
                  activeTab === 'orders'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Заказы ({client.orders.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`mr-2 rounded-t-xl px-5 py-2.5 text-sm font-medium border-b-2 ${
                  activeTab === 'history'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Clock3 className="inline h-4 w-4 mr-1" />
                История ({historyEvents.length})
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`rounded-t-xl px-5 py-2.5 text-sm font-medium border-b-2 ${
                  activeTab === 'files'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <File className="inline h-4 w-4 mr-1" />
                Файлы ({allFiles.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {client.orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="block border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold text-gray-900 hover:text-primary-600">
                        {order.orderNumber || `Заказ #${order.id.slice(0, 8)}`}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        Менеджер: {order.manager.firstName} {order.manager.lastName}
                      </span>
                      <span className="text-lg font-semibold text-gray-900">
                        {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(order.totalAmount))}
                      </span>
                    </div>
                  </Link>
                ))}
                {client.orders.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Нет заказов</p>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-primary-50/30 p-4">
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Добавить заметку в историю</label>
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Введите сообщение для истории..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    Отправить
                  </button>
                </div>

                {/* История */}
                <div className="space-y-4">
                  {historyEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">{event.author}</p>
                          <p className="text-xs text-primary-600 inline-flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {event.kind === 'order'
                              ? 'Заказ'
                              : event.kind === 'lead'
                                ? 'Лид'
                                : event.kind === 'note'
                                  ? 'Карточка клиента'
                                  : 'Заметка'}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(event.createdAt).toLocaleString('ru-RU')}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{event.text}</p>
                    </div>
                  ))}
                  {historyEvents.length === 0 && (
                    <p className="text-center text-gray-500 py-8">История пока пустая</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-4">
                {/* Upload File Form */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Загрузить файл</label>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                {/* Files List */}
                <div className="space-y-2">
                  {allFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <File className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{file.originalName}</p>
                          <p className="text-xs text-gray-500">
                            {file.source} • {formatFileSize(file.size)} • {new Date(file.createdAt).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadClientFile(file.id, file.originalName)
                        }
                        disabled={downloadingFileId === file.id}
                        className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloadingFileId === file.id ? 'Скачивание…' : 'Скачать'}
                      </button>
                    </div>
                  ))}
                  {allFiles.length === 0 && (
                    <p className="text-center text-gray-500 py-8">Нет файлов</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {closeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Закрыть клиента</h3>
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Причина закрытия <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  rows={3}
                  placeholder="Почему закрываем клиента?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Комментарий (необязательно)
                </label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={3}
                  placeholder="Дополнительная информация"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={closingClient}
                onClick={handleCloseClient}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {closingClient ? 'Закрытие...' : 'Закрыть клиента'}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Передать клиента</h3>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-gray-600">Выберите нового ответственного менеджера.</p>
              <select
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Выберите менеджера</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={transferring || !selectedManagerId}
                onClick={handleTransferClient}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {transferring ? 'Передаём...' : 'Передать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Назначить новый контакт</h3>
              <button
                type="button"
                onClick={() => setNewContactModalOpen(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateNewContact} className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Источник</label>
                <input
                  type="text"
                  value="Постоянные клиенты"
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Дата следующего контакта <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={newContactForm.nextContactDate}
                  onChange={(e) =>
                    setNewContactForm((prev) => ({ ...prev, nextContactDate: e.target.value }))
                  }
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Цель контакта</label>
                <input
                  type="text"
                  value={newContactForm.contactPurpose}
                  onChange={(e) =>
                    setNewContactForm((prev) => ({ ...prev, contactPurpose: e.target.value }))
                  }
                  placeholder="Например: согласовать повторный заказ"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Заметки</label>
                <textarea
                  rows={3}
                  value={newContactForm.notes}
                  onChange={(e) => setNewContactForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Доп. форма связи</label>
                  <select
                    value={newContactForm.additionalContactType}
                    onChange={(e) =>
                      setNewContactForm((prev) => ({
                        ...prev,
                        additionalContactType: e.target.value,
                        additionalContactValue: '',
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Не выбрано</option>
                    <option value="Telegram">Telegram</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Почта">Почта</option>
                    <option value="MAX">MAX</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Значение</label>
                  <input
                    type="text"
                    value={newContactForm.additionalContactValue}
                    onChange={(e) =>
                      setNewContactForm((prev) => ({
                        ...prev,
                        additionalContactValue: e.target.value,
                      }))
                    }
                    placeholder="Например: @nickname"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setNewContactModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creatingContact}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {creatingContact ? 'Создаём...' : 'Назначить контакт'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
