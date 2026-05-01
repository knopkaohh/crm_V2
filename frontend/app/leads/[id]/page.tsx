'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Send, MessageCircle, Loader2, X, Edit2, Save, ShoppingCart, UserX } from 'lucide-react'

interface Lead {
  id: string
  status: string
  description: string | null
  value: number | null
  source: string | null
  deadline: string | null
  nextContactDate: string | null
  createdAt: string
  client: { id: string; name: string; phone: string; company?: string | null }
  manager: { id: string; firstName: string; lastName: string } | null
}

interface Task {
  id: string
  title: string
  status: string
  dueDate: string | null
}

interface LeadComment {
  id: string
  content: string
  createdAt: string
  user?: {
    id: string
    firstName: string
    lastName: string
  } | null
}

interface ManagerOption {
  id: string
  firstName: string
  lastName: string
}

const statusLabels: Record<string, string> = {
  NEW_LEAD: 'Новый лид',
  CONSIDERING: 'Рассмотрение',
  MOVED_TO_WHATSAPP: 'Перешел в WhatsApp',
  ORDER_PLACED: 'Заказ размещен',
  NOT_OUR_CLIENT: 'Не наш клиент',
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [editingNextContact, setEditingNextContact] = useState(false)
  const [nextContactValue, setNextContactValue] = useState('')
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [leadComments, setLeadComments] = useState<LeadComment[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [formNotes, setFormNotes] = useState('')
  const [contactPurpose, setContactPurpose] = useState('')
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [closingContact, setClosingContact] = useState(false)
  
  // Режим редактирования
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    clientName: '',
    clientPhone: '',
    source: '',
    description: '',
    value: '',
  })

  useEffect(() => {
    if (leadId) {
      loadLead()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  useEffect(() => {
    if (lead) {
      loadTasks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead])

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.[0] ?? ''
    const last = lastName?.[0] ?? ''
    return (first + last || '🙂').toUpperCase()
  }

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  // Загрузка заметок как в "Контактах"
  const loadLeadComments = async () => {
    if (!leadId) return
    setLoadingMessages(true)
    try {
      const response = await api.get(`/leads/${leadId}`)
      const comments = (response.data?.comments || [])
        .slice()
        .sort(
          (a: LeadComment, b: LeadComment) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      setLeadComments(comments)
    } catch (error) {
      console.error('Failed to load lead comments:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  // Отправка заметки
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !leadId || sendingMessage) return

    setSendingMessage(true)
    try {
      const response = await api.post(`/leads/${leadId}/comments`, {
        content: newMessage.trim(),
      })
      setLeadComments((prev) =>
        [...prev, response.data].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
      )
      setNewMessage('')
      
      // Прокрутка вниз
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (error: any) {
      console.error('Failed to send message:', error)
      const errorMessage = error.response?.data?.error || 'Не удалось отправить сообщение'
      alert(errorMessage)
    } finally {
      setSendingMessage(false)
    }
  }

  // Автопрокрутка при загрузке сообщений
  useEffect(() => {
    if (showNotesModal && leadComments.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [showNotesModal, leadComments])

  // Загрузка сообщений при открытии заметок
  useEffect(() => {
    if (showNotesModal && leadId) {
      loadLeadComments()
    }
  }, [showNotesModal, leadId])

  useEffect(() => {
    loadManagers()
  }, [])

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

  const loadLead = async () => {
    try {
      const res = await api.get(`/leads/${leadId}`)
      setLead(res.data)
      // Инициализируем форму редактирования
      setEditForm({
        clientName: res.data.client.name,
        clientPhone: res.data.client.phone,
        source: res.data.source || '',
        description: res.data.description || '',
        value: res.data.value !== null ? String(res.data.value) : '',
      })
    } catch (e) {
      console.error('Failed to load lead:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadTasks = async () => {
    if (!lead) return
    try {
      const res = await api.get('/tasks')
      // Filter active tasks where description contains client name
      const activeStatuses = ['PENDING', 'IN_PROGRESS']
      const clientTasks = res.data.filter((t: Task & { description?: string }) => {
        if (!activeStatuses.includes(t.status)) return false
        if (!t.description) return false
        // Check if task description contains client name
        return t.description.includes(lead.client.name) || 
               t.description.includes(`Клиент: ${lead.client.name}`)
      })
      setTasks(clientTasks)
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
  }

  const updateNextContactDate = async () => {
    if (!lead || !nextContactValue) return
    
    setUpdating(true)
    try {
      await api.put(`/leads/${lead.id}`, { 
        nextContactDate: nextContactValue 
      })
      setLead({ ...lead, nextContactDate: nextContactValue })
      setEditingNextContact(false)
    } catch (e) {
      console.error('Failed to update next contact date:', e)
      alert('Не удалось обновить дату контакта')
    } finally {
      setUpdating(false)
    }
  }

  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const handleSaveEdit = async () => {
    if (!lead) return
    
    setUpdating(true)
    try {
      // Обновляем данные клиента
      await api.put(`/clients/${lead.client.id}`, {
        name: editForm.clientName,
        phone: editForm.clientPhone,
      })
      
      // Обновляем данные лида
      await api.put(`/leads/${lead.id}`, {
        source: editForm.source,
        description: editForm.description,
        value: editForm.value ? parseFloat(editForm.value) : null,
      })
      
      // Перезагружаем данные
      await loadLead()
      setIsEditing(false)
    } catch (e) {
      console.error('Failed to save changes:', e)
      alert('Не удалось сохранить изменения')
    } finally {
      setUpdating(false)
    }
  }

  const handleCancelEdit = () => {
    if (!lead) return
    setEditForm({
      clientName: lead.client.name,
      clientPhone: lead.client.phone,
      source: lead.source || '',
      description: lead.description || '',
      value: lead.value !== null ? String(lead.value) : '',
    })
    setIsEditing(false)
  }

  const parsedLeadMeta = useMemo(() => {
    const description = lead?.description || ''
    const goalMatch = description.match(/Цель контакта:\s*([\s\S]*?)(?:\n\n|\nЗаметки:|$)/i)
    const notesMatch = description.match(
      /Заметки:\s*([\s\S]*?)(?:\n\s*Дополнительная форма связи\s*\(|$)/i,
    )
    return {
      goal: goalMatch?.[1]?.trim() || '—',
      notes: notesMatch?.[1]?.trim() || '',
    }
  }, [lead?.description])

  useEffect(() => {
    setFormNotes(parsedLeadMeta.notes)
    setContactPurpose(parsedLeadMeta.goal === '—' ? '' : parsedLeadMeta.goal)
  }, [parsedLeadMeta.notes, parsedLeadMeta.goal])

  const handleTransferClient = async () => {
    if (!lead || !selectedManagerId || selectedManagerId === lead.manager?.id) {
      return
    }
    setTransferring(true)
    try {
      const response = await api.put(`/leads/${lead.id}`, {
        managerId: selectedManagerId,
      })
      setLead(response.data)
      setTransferModalOpen(false)
      setSelectedManagerId('')
    } catch (error) {
      console.error('Failed to transfer client:', error)
      alert('Не удалось передать клиента другому менеджеру')
    } finally {
      setTransferring(false)
    }
  }

  const handleCreateOrder = () => {
    if (!lead) return
    const params = new URLSearchParams()
    params.set('leadId', lead.id)
    if (lead.client?.id) params.set('clientId', lead.client.id)
    if (lead.client?.name) params.set('clientName', lead.client.name)
    if (lead.client?.phone) params.set('clientPhone', lead.client.phone)
    if (lead.client?.company) params.set('clientBrand', lead.client.company)
    if (lead.source) params.set('source', lead.source)
    router.push(`/orders/new?${params.toString()}`)
  }

  const handleCloseContact = async () => {
    if (!lead) return
    if (!closeReason.trim()) {
      alert('Укажите причину закрытия контакта')
      return
    }
    setClosingContact(true)
    try {
      await api.post(`/leads/${lead.id}/close`, { reason: closeReason.trim() })
      setCloseModalOpen(false)
      setCloseReason('')
      router.push('/leads')
    } catch (error) {
      console.error('Failed to close contact:', error)
      alert('Не удалось закрыть контакт')
    } finally {
      setClosingContact(false)
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

  if (!lead) {
    return (
      <Layout>
        <div className="text-center text-gray-500">Лид не найден</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Лид</h1>
            <p className="text-gray-600 mt-1">{lead.client.name}</p>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={updating}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Сохранить
                </button>
              </>
            ) : (
              <>
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5 md:col-span-2">
            <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-6 py-4">
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Карточка контакта
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {lead.client.name}
                  </p>
                </div>
                <div className="rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
                  {lead.manager ? `${lead.manager.firstName} ${lead.manager.lastName}` : 'Менеджер не назначен'}
                </div>
              </div>
            </div>
            <div className="bg-gray-50/60 px-6 py-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm shadow-primary-100">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                    Основное
                  </h3>
                  <div>
                    <p className="text-sm text-gray-500">Статус</p>
                    <p className="text-base font-semibold text-gray-900">
                      {statusLabels[lead.status] || lead.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Источник</p>
                    {isEditing ? (
                      <select
                        value={editForm.source}
                        onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">Не выбрано</option>
                        <option value="Avito">Avito</option>
                        <option value="Сайт">Сайт</option>
                        <option value="Холодные обзвоны">Холодные обзвоны</option>
                        <option value="Сарафанное радио">Сарафанное радио</option>
                        <option value="Рекомендация">Рекомендация</option>
                        <option value="Соцсети">Соцсети</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 font-medium">{lead.source || '—'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Бренд</p>
                    <p className="text-gray-900 font-medium">{lead.client.company || '—'}</p>
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm shadow-primary-100">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                    Данные клиента
                  </h3>
                  <div>
                    <p className="text-sm text-gray-500">Дата следующего контакта</p>
                    {editingNextContact ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="datetime-local"
                          value={nextContactValue}
                          onChange={(e) => setNextContactValue(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <button
                          onClick={updateNextContactDate}
                          disabled={updating}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-gray-900 font-medium">
                          {lead.nextContactDate
                            ? new Date(lead.nextContactDate).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                        <button
                          onClick={() => {
                            setNextContactValue(formatDateForInput(lead.nextContactDate))
                            setEditingNextContact(true)
                          }}
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Цель следующего контакта</p>
                    <p className="text-gray-900 font-medium whitespace-pre-wrap">{parsedLeadMeta.goal}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Создан</p>
                    <p className="text-gray-900 font-medium">{new Date(lead.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                </section>
              </div>
            </div>

            {isEditing ? (
              <div className="px-6 pb-6">
                <label className="block text-sm text-gray-500 mb-2">Описание</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Описание лида..."
                />
              </div>
            ) : lead.description ? (
              <div className="px-6 pb-6">
                <p className="text-sm text-gray-500 mb-1">Описание</p>
                <p className="text-gray-800 whitespace-pre-wrap">{lead.description}</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5">
              <p className="text-sm text-gray-500 mb-2">Клиент</p>
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Имя</label>
                    <input
                      type="text"
                      value={editForm.clientName}
                      onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Телефон</label>
                    <input
                      type="tel"
                      value={editForm.clientPhone}
                      onChange={(e) => setEditForm({ ...editForm, clientPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              ) : (
                <>
              <p className="text-gray-900 font-semibold">{lead.client.name}</p>
              <p className="text-gray-700 mt-2">{lead.client.phone}</p>
                </>
              )}
              {!isEditing && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={handleCreateOrder}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-medium"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Заказ
                  </button>
                  <button
                    onClick={() => setShowNotesModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Заметки
                  </button>
                  <button
                    onClick={() => {
                      setSelectedManagerId(lead.manager?.id || '')
                      setTransferModalOpen(true)
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-medium"
                  >
                    Передать клиента
                  </button>
                  <button
                    onClick={() => setCloseModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <UserX className="h-4 w-4" />
                    Закрыть контакт
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5">
              <p className="text-sm text-gray-500 mb-2">Менеджер</p>
              <p className="text-gray-900 font-semibold">
                {lead.manager ? `${lead.manager.firstName} ${lead.manager.lastName}` : 'Не назначен'}
              </p>
            </div>
            {tasks.length > 0 && (
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-primary-900/5">
                <p className="text-sm text-gray-500 mb-3">Активные задачи</p>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="block p-2 border border-gray-200 rounded hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          До {new Date(task.dueDate).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Заметки */}
        {showNotesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Заметки по лиду - {lead.client.name}
                </h3>
                <button
                  onClick={() => setShowNotesModal(false)}
                  className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Закрыть заметки"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/40">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                  </div>
                ) : leadComments.length === 0 && !formNotes && !contactPurpose ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                    Пока нет заметок - добавьте первую, чтобы зафиксировать договоренности
                  </div>
                ) : (
                  <>
                    {(contactPurpose || formNotes) && (
                      <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-inner">
                        {contactPurpose ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Цель контакта
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-gray-800">{contactPurpose}</p>
                          </div>
                        ) : null}
                        {formNotes ? (
                          <div className={contactPurpose ? 'mt-3' : ''}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Заметки из формы
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-gray-800">{formNotes}</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {leadComments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600">
                          {getInitials(comment.user?.firstName, comment.user?.lastName)}
                        </div>
                        <div className="flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {comment.user
                                ? `${comment.user.firstName} ${comment.user.lastName}`
                                : 'Без имени'}
                            </span>
                            <span className="text-xs text-gray-400">{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                <div className="flex flex-col gap-3">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Введите сообщение..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={sendingMessage}
                  />
                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={sendingMessage || !newMessage.trim()}
                      className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
                    >
                      {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить'}
                    </button>
                  </div>
                </div>
              </form>
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
                <p className="text-sm text-gray-600">
                  Выберите нового ответственного менеджера для клиента.
                </p>
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

        {closeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Закрыть контакт</h3>
                <button
                  type="button"
                  onClick={() => setCloseModalOpen(false)}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 px-5 py-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Причина закрытия <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  rows={4}
                  placeholder="Например: не выходит на связь, отказался от заказа..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
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
                  disabled={closingContact}
                  onClick={handleCloseContact}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {closingContact ? 'Закрытие...' : 'Закрыть контакт'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}


