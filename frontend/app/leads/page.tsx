'use client'

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import { canHardDeleteLead, canViewAllLeads } from '@/lib/leads-permissions'
import {
  Plus,
  Calendar,
  Phone,
  User,
  Clock,
  Loader2,
  X,
  MessageCircle,
  ShoppingCart,
  UserX,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface Lead {
  id: string
  status: string
  nextContactDate: string | null
  client: {
    id: string
    name: string
    phone: string
    company?: string | null
  }
  manager: {
    id: string
    firstName: string
    lastName: string
  } | null
  value?: number | string | null
  description?: string | null
  source?: string | null
  createdAt: string
  _count?: {
    comments?: number
    files?: number
  }
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

interface ClientOption {
  id: string
  name: string
  phone?: string | null
  company?: string | null
  source?: string | null
}

interface LeadDetails extends Lead {
  comments?: LeadComment[]
}

interface OrderPosition {
  name: string
  quantity: string
  price: string
}

interface OrderFormState {
  orderNumber: string
  source: string
  paymentType: string
  prepayment: string
  postpayment: string
  notes: string
  positions: OrderPosition[]
}

type LeadModalType = 'notes' | 'order' | 'close' | 'delete' | null

const statusLabels: Record<string, string> = {
  NEW_LEAD: 'Новый лид',
  CONSIDERING: 'Рассмотрение',
  MOVED_TO_WHATSAPP: 'WhatsApp',
  ORDER_PLACED: 'Заказ оформлен',
  NOT_OUR_CLIENT: 'Не наш клиент',
}

const statusClasses: Record<string, string> = {
  NEW_LEAD: 'bg-emerald-50 text-emerald-600',
  CONSIDERING: 'bg-amber-50 text-amber-600',
  MOVED_TO_WHATSAPP: 'bg-sky-50 text-sky-600',
  ORDER_PLACED: 'bg-purple-50 text-purple-600',
  NOT_OUR_CLIENT: 'bg-rose-50 text-rose-600',
}

const createEmptyOrderForm = (): OrderFormState => ({
  orderNumber: '',
  source: 'Сайт',
  paymentType: '',
  prepayment: '',
  postpayment: '',
  notes: '',
  positions: [{ name: '', quantity: '1', price: '' }],
})

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

const Modal = ({ open, title, onClose, children, footer }: ModalProps) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const getInitials = (firstName?: string | null, lastName?: string | null) => {
  const first = firstName?.[0] ?? ''
  const last = lastName?.[0] ?? ''
  return (first + last || '🙂').toUpperCase()
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return '—'
  }
  const numeric = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(numeric)) {
    return '—'
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(numeric)
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Не указана'
  const date = new Date(dateString)
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return 'Не указана'
  const date = new Date(dateString)
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

const getStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const FILTER_SOURCE_OPTIONS = [
  'Avito',
  'Сайт',
  'Проектные продажи',
  'Теплые обзвоны',
  'Постоянные клиенты',
  'Сарафанное радио',
]
const FILTER_MANAGER_OPTIONS = [
  'Антон Федотов',
  'Мониава Георгий',
  'Хрусталёв Роман',
  'Палтарацкас Гинтарас',
  'Алескеров Нариман',
  'Царьков Никита',
  'Пендус Владислав',
]

const extractLeadDetails = (description: string | null | undefined) => {
  if (!description) {
    return { contactPurpose: '', notes: '' }
  }

  const contactPurposeMatch = description.match(
    /Цель контакта:\s*([\s\S]*?)(?:\s*Заметки:|$)/i,
  )
  const notesMatch = description.match(/Заметки:\s*([\s\S]*)$/i)

  return {
    contactPurpose: contactPurposeMatch?.[1]?.trim() ?? '',
    notes: notesMatch?.[1]?.trim() ?? '',
  }
}

export default function LeadsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [todayLeads, setTodayLeads] = useState<Lead[]>([])
  const [futureLeads, setFutureLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [managerFilter, setManagerFilter] = useState('all')

  const [showNewLeadForm, setShowNewLeadForm] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientSelect, setShowClientSelect] = useState(false)
  const [newLeadForm, setNewLeadForm] = useState(() => ({
    selectedExistingClientId: '',
    lastName: '',
    firstName: '',
    middleName: '',
    brand: '',
    clientPhone: '',
    additionalContactType: '',
    additionalContactValue: '',
    source: 'Avito',
    nextContactDate: getTomorrowNoon(),
    contactPurpose: '',
    notes: '',
  }))

  const [modalType, setModalType] = useState<LeadModalType>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedLeadDetails, setSelectedLeadDetails] = useState<LeadDetails | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalActionLoading, setModalActionLoading] = useState(false)
  const [leadComments, setLeadComments] = useState<LeadComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [orderForm, setOrderForm] = useState<OrderFormState>(() =>
    createEmptyOrderForm()
  )
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    formatDateKey(new Date()),
  )
  const calendarOpenedRef = useRef(false)

  const todayKey = formatDateKey(new Date())

  const allCalendarLeads = useMemo(
    () => [...todayLeads, ...futureLeads],
    [todayLeads, futureLeads],
  )

  const applyLeadFilters = (lead: Lead) => {
    const sourceMatches = sourceFilter === 'all' || (lead.source ?? '') === sourceFilter
    const managerName = lead.manager
      ? `${lead.manager.firstName} ${lead.manager.lastName}`.trim()
      : ''
    const managerMatches =
      managerFilter === 'all' ||
      (managerFilter === 'unassigned'
        ? !lead.manager
        : managerName === managerFilter)
    return sourceMatches && managerMatches
  }

  const filteredTodayLeads = useMemo(
    () => todayLeads.filter(applyLeadFilters),
    [todayLeads, sourceFilter, managerFilter],
  )

  const filteredFutureLeads = useMemo(
    () => futureLeads.filter(applyLeadFilters),
    [futureLeads, sourceFilter, managerFilter],
  )
  const filteredClients = useMemo(() => {
    const searchValue = clientSearch.trim().toLowerCase()
    if (!searchValue) return clients.slice(0, 10)
    return clients
      .filter((client) => {
        const name = (client.name ?? '').toLowerCase()
        const phone = client.phone ?? ''
        const company = (client.company ?? '').toLowerCase()
        return (
          name.includes(searchValue) ||
          phone.includes(clientSearch.trim()) ||
          company.includes(searchValue)
        )
      })
      .slice(0, 20)
  }, [clients, clientSearch])

  const calendarEvents = useMemo(() => {
    const events: Record<string, Lead[]> = {}

    allCalendarLeads.forEach((lead) => {
      if (!lead.nextContactDate) return
      const date = new Date(lead.nextContactDate)
      if (Number.isNaN(date.getTime())) return
      const key = formatDateKey(date)
      if (!events[key]) {
        events[key] = []
      }
      events[key].push(lead)
      events[key].sort((a, b) => {
        const timeA = a.nextContactDate
          ? new Date(a.nextContactDate).getTime()
          : 0
        const timeB = b.nextContactDate
          ? new Date(b.nextContactDate).getTime()
          : 0
        return timeA - timeB
      })
    })

    return events
  }, [allCalendarLeads])

  const sortedEventDates = useMemo(
    () =>
      Object.keys(calendarEvents).sort(
        (a, b) => parseDateKey(a).getTime() - parseDateKey(b).getTime(),
      ),
    [calendarEvents],
  )

  const calendarDays = useMemo(() => {
    const monthStart = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    )
    const startOffset = (monthStart.getDay() + 6) % 7
    const startDate = new Date(monthStart)
    startDate.setDate(monthStart.getDate() - startOffset)

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + index)
      return { date, key: formatDateKey(date) }
    })
  }, [calendarMonth])

  const selectedDateLeads = useMemo(
    () =>
      selectedCalendarDate ? calendarEvents[selectedCalendarDate] || [] : [],
    [calendarEvents, selectedCalendarDate],
  )

  const selectedDateLabel = useMemo(() => {
    if (!selectedCalendarDate) return '—'
    const date = parseDateKey(selectedCalendarDate)
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [selectedCalendarDate])

  const monthLabel = useMemo(() => {
    const rawLabel = calendarMonth.toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
    })
    return rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
  }, [calendarMonth])

  const formatTime = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const [selectedLeadFormNotes, setSelectedLeadFormNotes] = useState('')
  const [selectedLeadContactPurpose, setSelectedLeadContactPurpose] = useState('')
  const [editingNextContactDate, setEditingNextContactDate] = useState(false)
  const [nextContactDateValue, setNextContactDateValue] = useState('')
  const [updatingNextContactDate, setUpdatingNextContactDate] = useState(false)

  const orderTotal = useMemo(
    () =>
      orderForm.positions.reduce(
        (sum, position) => sum + (parseFloat(position.price || '0') || 0),
        0
      ),
    [orderForm.positions]
  )

  function getTomorrowNoon() {
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

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    let formatted = numbers.startsWith('8') ? '7' + numbers.slice(1) : numbers
    if (!formatted.startsWith('7')) {
      formatted = '7' + formatted
    }
    formatted = formatted.slice(0, 11)

    let result = '+7'
    if (formatted.length > 1) {
      result += ' ' + formatted.slice(1, 4)
    }
    if (formatted.length > 4) {
      result += ' ' + formatted.slice(4, 7)
    }
    if (formatted.length > 7) {
      result += '-' + formatted.slice(7, 9)
    }
    if (formatted.length > 9) {
      result += '-' + formatted.slice(9, 11)
    }

    return result
  }

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value)
    setNewLeadForm((prev) => ({
      ...prev,
      selectedExistingClientId: '',
      clientPhone: formatted,
    }))
  }

  useEffect(() => {
    loadLeads()
    loadClients()
    void auth.getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null))
  }, [])

  const loadClients = async () => {
    setClientsLoading(true)
    try {
      const response = await api.get('/clients')
      const clientsData = response.data?.data || response.data || []
      setClients(Array.isArray(clientsData) ? clientsData : [])
    } catch (error) {
      console.error('Failed to load clients:', error)
      setClients([])
    } finally {
      setClientsLoading(false)
    }
  }

  const handleExistingClientSelect = (client: ClientOption) => {
    const nameParts = (client.name ?? '').trim().split(/\s+/).filter(Boolean)
    const lastName = nameParts[0] ?? ''
    const firstName = nameParts[1] ?? ''
    const middleName = nameParts.slice(2).join(' ')

    setNewLeadForm((prev) => ({
      ...prev,
      selectedExistingClientId: client.id,
      lastName,
      firstName,
      middleName,
      brand: client.company ?? '',
      clientPhone: client.phone ?? '',
      source: client.source ?? prev.source,
    }))
    setShowClientSelect(false)
    setClientSearch('')
  }

  useEffect(() => {
    if (showCalendar && !calendarOpenedRef.current) {
      const today = new Date()
      const startOfToday = getStartOfDay(today)
      const upcoming =
        sortedEventDates.find(
          (key) => parseDateKey(key) >= startOfToday,
        ) ?? sortedEventDates[0]
      const targetKey = upcoming ?? todayKey
      const targetDate = parseDateKey(targetKey)
      setSelectedCalendarDate(targetKey)
      setCalendarMonth(
        new Date(targetDate.getFullYear(), targetDate.getMonth(), 1),
      )
    }
    calendarOpenedRef.current = showCalendar
  }, [showCalendar, sortedEventDates, todayKey])

  const loadLeads = async (options?: { showSpinner?: boolean }) => {
    const showSpinner = options?.showSpinner ?? true
    if (showSpinner) {
      setLoading(true)
    }
    try {
      const todayResponse = await api.get('/leads', {
        params: { contactDateFilter: 'today' },
      })
      setTodayLeads(todayResponse.data.data || [])

      const futureResponse = await api.get('/leads', {
        params: { contactDateFilter: 'future' },
      })
      setFutureLeads(futureResponse.data.data || [])
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      if (showSpinner) {
        setLoading(false)
      }
    }
  }

  const resetModalState = () => {
    setModalType(null)
    setSelectedLead(null)
    setSelectedLeadDetails(null)
    setModalLoading(false)
    setModalActionLoading(false)
    setLeadComments([])
    setNewComment('')
    setCloseReason('')
    setOrderForm(createEmptyOrderForm())
    setSelectedLeadFormNotes('')
    setSelectedLeadContactPurpose('')
    setEditingNextContactDate(false)
    setNextContactDateValue('')
    setUpdatingNextContactDate(false)
  }

  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const openLeadModal = async (lead: Lead, type: LeadModalType) => {
    if (type === 'order') {
      const params = new URLSearchParams()
      params.set('leadId', lead.id)
      if (lead.client?.id) {
        params.set('clientId', lead.client.id)
      }
      if (lead.client?.name) {
        params.set('clientName', lead.client.name)
      }
      if (lead.client?.phone) {
        params.set('clientPhone', lead.client.phone)
      }
      if (lead.client?.company) {
        params.set('clientBrand', lead.client.company)
      }
      if (lead.source) {
        params.set('source', lead.source)
      }
      router.push(`/orders/new?${params.toString()}`)
      return
    }

    setSelectedLead(lead)
    setModalType(type)
    setModalLoading(false) // Показываем модальное окно сразу
    setModalActionLoading(false)
    setLeadComments([])
    setNewComment('')
    setCloseReason('')
    setEditingNextContactDate(false)
    setNextContactDateValue(formatDateForInput(lead.nextContactDate))

    // Для заметок сразу показываем данные из lead, детали загружаем асинхронно
    if (type === 'notes') {
      const { contactPurpose, notes } = extractLeadDetails(lead.description)
      setSelectedLeadContactPurpose(contactPurpose)
      setSelectedLeadFormNotes(notes)
    }

    // Загружаем детали асинхронно
    try {
      const response = await api.get(`/leads/${lead.id}`)
      const details: LeadDetails = response.data
      setSelectedLeadDetails(details)
      const { contactPurpose, notes } = extractLeadDetails(details.description)
      setSelectedLeadContactPurpose(contactPurpose)
      setSelectedLeadFormNotes(notes)

      if (type === 'notes') {
        const comments = (details.comments || [])
          .slice()
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        setLeadComments(comments)
      }
    } catch (error) {
      console.error('Failed to load lead details:', error)
      // Не закрываем модальное окно, просто показываем данные из lead
    }
  }

  const handleUpdateNextContactDate = async () => {
    if (!selectedLead || !nextContactDateValue) return

    setUpdatingNextContactDate(true)
    try {
      const response = await api.put(`/leads/${selectedLead.id}`, {
        nextContactDate: new Date(nextContactDateValue).toISOString(),
      })
      const updatedLead = response.data
      
      // Обновляем selectedLead и selectedLeadDetails
      setSelectedLead({ ...selectedLead, nextContactDate: updatedLead.nextContactDate })
      if (selectedLeadDetails) {
        setSelectedLeadDetails({ ...selectedLeadDetails, nextContactDate: updatedLead.nextContactDate })
      }
      
      // Обновляем в списках
      setTodayLeads((prev) =>
        prev.map((lead) =>
          lead.id === selectedLead.id
            ? { ...lead, nextContactDate: updatedLead.nextContactDate }
            : lead
        )
      )
      setFutureLeads((prev) =>
        prev.map((lead) =>
          lead.id === selectedLead.id
            ? { ...lead, nextContactDate: updatedLead.nextContactDate }
            : lead
        )
      )
      
      setEditingNextContactDate(false)
      
      // Перезагружаем списки, чтобы лид переместился в правильный список (сегодня/будущие)
      await loadLeads({ showSpinner: false })
    } catch (error) {
      console.error('Failed to update next contact date:', error)
      alert('Не удалось обновить дату следующего контакта')
    } finally {
      setUpdatingNextContactDate(false)
    }
  }

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hasAnyName = Boolean(
      newLeadForm.firstName.trim() || newLeadForm.lastName.trim() || newLeadForm.middleName.trim(),
    )
    if (!newLeadForm.selectedExistingClientId && !hasAnyName) {
      alert('Укажите данные клиента или выберите постоянного клиента')
      return
    }
    if (!newLeadForm.source) {
      alert('Выберите источник')
      return
    }
    if (!newLeadForm.nextContactDate) {
      alert('Укажите дату следующего контакта')
      return
    }

    try {
      const fullName = `${[newLeadForm.lastName, newLeadForm.firstName, newLeadForm.middleName]
        .filter(Boolean)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')}`.trim()

      let clientId = newLeadForm.selectedExistingClientId
      if (!clientId) {
        const clientResponse = await api.post('/clients', {
          name: fullName || newLeadForm.firstName.trim(),
          phone: newLeadForm.clientPhone || null,
          source: newLeadForm.source,
          ...(newLeadForm.brand.trim() ? { company: newLeadForm.brand.trim() } : {}),
        })
        clientId = clientResponse.data.id
      }

      let description = ''
      if (newLeadForm.contactPurpose.trim()) {
        description = `Цель контакта: ${newLeadForm.contactPurpose.trim()}`
      }
      if (newLeadForm.notes.trim()) {
        description += (description ? '\n\n' : '') + `Заметки: ${newLeadForm.notes.trim()}`
      }
      if (
        newLeadForm.additionalContactType &&
        newLeadForm.additionalContactValue.trim()
      ) {
        description +=
          (description ? '\n\n' : '') +
          `Дополнительная форма связи (${newLeadForm.additionalContactType}): ${newLeadForm.additionalContactValue.trim()}`
      }

      setModalActionLoading(true)

      const leadResponse = await api.post('/leads', {
        clientId,
        source: newLeadForm.source,
        status: 'NEW_LEAD',
        nextContactDate: new Date(newLeadForm.nextContactDate).toISOString(),
        description: description || null,
      })

      const createdLead = leadResponse.data as Lead
      const normalizedLead: Lead = {
        ...createdLead,
        _count: {
          comments: createdLead._count?.comments ?? 0,
          files: createdLead._count?.files ?? 0,
        },
      }

      const determineLeadBucket = (dateString: string | null): 'today' | 'future' => {
        if (!dateString) return 'today'
        const date = new Date(dateString)
        if (Number.isNaN(date.getTime())) return 'today'
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const endOfToday = new Date()
        endOfToday.setHours(23, 59, 59, 999)
        if (date > endOfToday) {
          return 'future'
        }
        return 'today'
      }

      const bucket = determineLeadBucket(normalizedLead.nextContactDate)

      setTodayLeads((prev) => {
        const filtered = prev.filter((lead) => lead.id !== normalizedLead.id)
        if (bucket === 'today') {
          const next = [normalizedLead, ...filtered]
          return next.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
        }
        return filtered
      })

      setFutureLeads((prev) => {
        const filtered = prev.filter((lead) => lead.id !== normalizedLead.id)
        if (bucket === 'future') {
          const next = [...filtered, normalizedLead]
          return next.sort((a, b) => {
            const aDate = a.nextContactDate ? new Date(a.nextContactDate).getTime() : Number.MAX_SAFE_INTEGER
            const bDate = b.nextContactDate ? new Date(b.nextContactDate).getTime() : Number.MAX_SAFE_INTEGER
            return aDate - bDate
          })
        }
        return filtered
      })

      setShowNewLeadForm(false)
      setNewLeadForm({
        selectedExistingClientId: '',
        lastName: '',
        firstName: '',
        middleName: '',
        brand: '',
        clientPhone: '',
        additionalContactType: '',
        additionalContactValue: '',
        source: 'Avito',
        nextContactDate: getTomorrowNoon(),
        contactPurpose: '',
        notes: '',
      })
      void loadLeads({ showSpinner: false })
    } catch (error) {
      console.error('Failed to create lead:', error)
      alert('Не удалось создать лид. Попробуйте позже.')
    } finally {
      setModalActionLoading(false)
    }
  }

  const goToPreviousMonth = () => {
    setCalendarMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(prev.getMonth() - 1, 1)
      return next
    })
  }

  const goToNextMonth = () => {
    setCalendarMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(prev.getMonth() + 1, 1)
      return next
    })
  }

  const goToToday = () => {
    const today = new Date()
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedCalendarDate(formatDateKey(today))
  }

  const handleSendComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedLeadDetails) return
    if (!newComment.trim()) {
      return
    }

    setCommentSending(true)
    try {
      const response = await api.post(`/leads/${selectedLeadDetails.id}/comments`, {
        content: newComment.trim(),
      })
      const savedComment: LeadComment = response.data
      setLeadComments((prev) =>
        [...prev, savedComment].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      )
      setNewComment('')
      loadLeads()
    } catch (error) {
      console.error('Failed to send comment:', error)
      alert('Не удалось отправить сообщение.')
    } finally {
      setCommentSending(false)
    }
  }

  const handleOrderFormChange = (key: keyof OrderFormState, value: string) => {
    setOrderForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateOrderPosition = (
    index: number,
    key: keyof OrderPosition,
    value: string
  ) => {
    setOrderForm((prev) => {
      const positions = prev.positions.map((position, posIndex) =>
        posIndex === index ? { ...position, [key]: value } : position
      )
      return { ...prev, positions }
    })
  }

  const addOrderPosition = () => {
    setOrderForm((prev) => ({
      ...prev,
      positions: [...prev.positions, { name: '', quantity: '1', price: '' }],
    }))
  }

  const removeOrderPosition = (index: number) => {
    setOrderForm((prev) => {
      if (prev.positions.length === 1) return prev
      const positions = prev.positions.filter((_, posIndex) => posIndex !== index)
      return { ...prev, positions }
    })
  }

  const handleCreateOrderFromLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedLeadDetails) return

    const preparedPositions = orderForm.positions
      .map((item) => ({
        name: item.name.trim() || 'Позиция',
        quantity: Number.parseInt(item.quantity || '1', 10) || 1,
        price: parseFloat(item.price || '0') || 0,
      }))
      .filter((item) => item.price > 0)

    if (preparedPositions.length === 0) {
      alert('Добавьте хотя бы одну позицию с ценой')
      return
    }

    const payload: Record<string, unknown> = {
      clientId: selectedLeadDetails.client.id,
      items: preparedPositions,
      // Используем managerId лида для заказа
      managerId: selectedLeadDetails.manager?.id,
      // Передаем leadId для автоматического закрытия лида
      leadId: selectedLeadDetails.id,
    }

    if (orderForm.orderNumber.trim()) {
      payload.orderNumber = orderForm.orderNumber.trim()
    }
    if (orderForm.source.trim()) {
      payload.source = orderForm.source.trim()
    }
    if (orderForm.notes.trim()) {
      payload.notes = orderForm.notes.trim()
    }
    if (orderForm.paymentType) {
      payload.paymentType = orderForm.paymentType
      if (orderForm.paymentType === 'PARTIAL') {
        if (orderForm.prepayment.trim()) {
          payload.prepayment = parseFloat(orderForm.prepayment)
        }
        if (orderForm.postpayment.trim()) {
          payload.postpayment = parseFloat(orderForm.postpayment)
        }
      }
    }

    setModalActionLoading(true)
    try {
      console.log('Creating order from lead with payload:', payload)
      const response = await api.post('/orders', payload)
      console.log('Order created successfully:', response.data)
      // Лид будет автоматически закрыт на бэкенде при создании заказа
      alert('Заказ успешно создан')
      resetModalState()
      loadLeads()
    } catch (error) {
      console.error('Failed to create order from lead:', error)
      alert('Не удалось создать заказ. Проверьте данные и попробуйте снова.')
    } finally {
      setModalActionLoading(false)
    }
  }

  const handleCloseLead = async () => {
    if (!selectedLead) return
    if (!closeReason.trim()) {
      alert('Укажите причину закрытия контакта')
      return
    }

    setModalActionLoading(true)
    try {
      const response = await api.post(`/leads/${selectedLead.id}/close`, {
        reason: closeReason.trim(),
      })
      const closedContact = response.data?.closedContact
      if (closedContact) {
        setTodayLeads((prev) => prev.filter((lead) => lead.id !== closedContact.leadId))
        setFutureLeads((prev) =>
          prev.filter((lead) => lead.id !== closedContact.leadId),
        )
      } else {
        loadLeads({ showSpinner: false })
      }
      resetModalState()
    } catch (error) {
      console.error('Failed to close lead:', error)
      alert('Не удалось закрыть контакт.')
    } finally {
      setModalActionLoading(false)
    }
  }

  const handleDeleteLead = async () => {
    if (!selectedLead) return

    setModalActionLoading(true)
    try {
      await api.delete(`/leads/${selectedLead.id}`)
      alert('Лид удалён')
      resetModalState()
      loadLeads()
    } catch (error) {
      console.error('Failed to delete lead:', error)
      alert('Не удалось удалить лид.')
    } finally {
      setModalActionLoading(false)
    }
  }

  const LeadCard = ({
    lead,
    showDate = false,
    onOpenNotes,
    onOpenOrder,
    onCloseContact,
    onDeleteLead,
    showDeleteButton,
    variant,
  }: {
    lead: Lead
    showDate?: boolean
    onOpenNotes: () => void
    onOpenOrder: () => void
    onCloseContact: () => void
    onDeleteLead: () => void
    showDeleteButton: boolean
    variant?: 'default' | 'compact'
  }) => {
    const cardVariant = variant ?? 'default'
    const managerName = lead.manager
      ? `${lead.manager.firstName} ${lead.manager.lastName}`
      : 'Не назначен'
    const { contactPurpose } = extractLeadDetails(lead.description)
    const hasStructuredDescription =
      /\bЦель контакта:/i.test(lead.description ?? '') ||
      /\bЗаметки:/i.test(lead.description ?? '')
    const descriptionText =
      contactPurpose || (!hasStructuredDescription ? lead.description?.trim() ?? '' : '')
    const cardClass =
      cardVariant === 'compact'
        ? 'group relative block overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md'
        : 'group relative block overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg'
    const accentBarClass =
      cardVariant === 'compact'
        ? 'absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary-500 via-primary-400 to-primary-600'
        : 'absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-primary-600'
    const haloClass =
      cardVariant === 'compact'
        ? 'pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary-200/30 blur-2xl opacity-0 transition-opacity group-hover:opacity-60'
        : 'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary-200/40 blur-3xl transition-opacity group-hover:opacity-70'
    const closeButtonClass =
      cardVariant === 'compact'
        ? 'absolute top-3 right-3 rounded-full p-1.5 text-gray-400 transition hover:text-gray-600'
        : 'absolute top-4 right-4 rounded-full p-2 text-gray-400 transition hover:text-gray-600'
    const contentSpacingClass = cardVariant === 'compact' ? 'space-y-3' : 'space-y-4'
    const headerGapClass =
      cardVariant === 'compact'
        ? 'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'
        : 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'
    const titleClass =
      cardVariant === 'compact'
        ? 'mt-2 text-lg font-semibold text-gray-900'
        : 'mt-3 text-xl font-semibold text-gray-900'
    const infoRowClass =
      cardVariant === 'compact'
        ? 'mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600'
        : 'mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600'
    const descriptionClass =
      cardVariant === 'compact'
        ? 'line-clamp-2 text-sm text-gray-700'
        : 'line-clamp-3 text-sm text-gray-700'
    const actionsRowClass =
      cardVariant === 'compact'
        ? 'flex flex-wrap items-center gap-2 text-xs font-medium'
        : 'flex flex-wrap items-center gap-3 text-sm font-medium'
    const actionButtonBase =
      cardVariant === 'compact'
        ? 'inline-flex items-center gap-1.5 px-2 py-1 transition'
        : 'inline-flex items-center gap-1.5 px-2 py-1 transition'
    const topMetaClass =
      cardVariant === 'compact'
        ? 'flex flex-col items-end gap-1.5 text-right pt-4'
        : 'flex flex-col items-end gap-2 text-right pt-6'

    return (
      <Link
        href={`/leads/${lead.id}`}
        className={cardClass}
      >
        <div aria-hidden className={accentBarClass} />
        <div aria-hidden className={haloClass} />
        {showDeleteButton ? (
          <button
            type="button"
            className={closeButtonClass}
            title="Удалить лид"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDeleteLead()
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <div className={contentSpacingClass}>
          <div className={headerGapClass}>
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  <User className="h-3.5 w-3.5 text-gray-500" />
                  <span>{managerName}</span>
                </span>
                {lead.nextContactDate ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                    {showDate
                      ? formatDate(lead.nextContactDate)
                      : formatDateTime(lead.nextContactDate)}
                  </span>
                ) : null}
              </div>

              <h3 className={titleClass}>
                {lead.client.name}
              </h3>
              <div className={infoRowClass}>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
                  <Phone className="h-3.5 w-3.5" />
                  {lead.client.phone || '—'}
                </span>
                {lead.source ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-primary-600">
                    {lead.source}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={topMetaClass}>
              <span className="text-xs text-gray-400">
                Создан {formatDateTime(lead.createdAt)}
              </span>
            </div>
          </div>

          {descriptionText ? (
            <p className={descriptionClass}>
              {contactPurpose ? `Цель контакта: ${descriptionText}` : descriptionText}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Цель контакта не указана</p>
          )}

          <div className={actionsRowClass}>
            <button
              type="button"
              className={`${actionButtonBase} text-sky-600 hover:text-sky-700`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenNotes()
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Заметки
            </button>
            <button
              type="button"
              className={`${actionButtonBase} text-emerald-600 hover:text-emerald-700`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenOrder()
              }}
            >
              <ShoppingCart className="h-4 w-4" />
              Заказ
            </button>
            <button
              type="button"
              className={`${actionButtonBase} text-gray-500 hover:text-gray-700`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCloseContact()
              }}
            >
              <UserX className="h-4 w-4" />
              Закрыть контакт
            </button>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Контакты</h1>
            <p className="text-gray-600">
              Управление контактами, быстрые заметки и перевод в заказы
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-600 shadow-sm transition hover:bg-primary-100"
            >
              <CalendarRange className="h-5 w-5" />
              <span>Календарь контактов</span>
            </button>
            <button
              onClick={() => setShowNewLeadForm((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
            >
              <Plus className="h-5 w-5" />
              <span>{showNewLeadForm ? 'Скрыть форму' : 'Новый контакт'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-primary-50/30 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Фильтры контактов</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 shadow-sm">
              Быстрый поиск
            </span>
          </div>
          <div
            className={`grid gap-3 ${canViewAllLeads(currentUser) ? 'sm:grid-cols-2' : ''}`}
          >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Фильтр по источнику
            </label>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Все источники</option>
              {FILTER_SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          {canViewAllLeads(currentUser) ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Фильтр по менеджеру
              </label>
              <select
                value={managerFilter}
                onChange={(event) => setManagerFilter(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Все менеджеры</option>
                {FILTER_MANAGER_OPTIONS.map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          </div>
        </div>

        {showNewLeadForm ? (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5 ring-1 ring-black/5">
            <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-6 py-4">
              <div className="absolute inset-y-4 right-6 hidden rounded-2xl bg-primary-500/[0.12] blur-2xl lg:block" />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-600 shadow-sm">
                  Быстрый лид
                </span>
              </div>
            </div>

            <div className="relative bg-gray-50/60 px-8 py-8">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-400/30 to-transparent" />
              <form onSubmit={handleCreateLead} className="space-y-8">
                <div className="grid gap-8 lg:grid-cols-2">
                  <section className="space-y-6 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-sm shadow-primary-100">
                    <header className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
                          Данные клиента
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowClientSelect((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                        >
                          Постоянный клиент
                        </button>
                      </div>
                      <p className="text-sm text-gray-600">
                        Расскажите, кто обращается и как с ним связаться.
                      </p>
                    </header>
                    {showClientSelect ? (
                      <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Поиск в базе клиентов
                        </label>
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={(event) => setClientSearch(event.target.value)}
                          placeholder="Имя, телефон или бренд"
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1">
                          {clientsLoading ? (
                            <p className="px-2 py-2 text-xs text-gray-500">Загружаем клиентов...</p>
                          ) : filteredClients.length > 0 ? (
                            filteredClients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => handleExistingClientSelect(client)}
                                className="w-full rounded-md px-2 py-2 text-left transition hover:bg-primary-50"
                              >
                                <p className="text-sm font-medium text-gray-900">{client.name}</p>
                                <p className="text-xs text-gray-500">
                                  {[client.phone, client.company].filter(Boolean).join(' | ') || 'Без телефона и бренда'}
                                </p>
                              </button>
                            ))
                          ) : (
                            <p className="px-2 py-2 text-xs text-gray-500">Клиенты не найдены</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                    {newLeadForm.selectedExistingClientId ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        Выбран постоянный клиент. Данные автозаполнены.
                      </div>
                    ) : null}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Фамилия
                        </label>
                        <input
                          type="text"
                          value={newLeadForm.lastName}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              selectedExistingClientId: '',
                              lastName: event.target.value,
                            }))
                          }
                          placeholder="Иванов"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Имя <span className="text-primary-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newLeadForm.firstName}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              selectedExistingClientId: '',
                              firstName: event.target.value,
                            }))
                          }
                          placeholder="Иван"
                          required
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Отчество
                        </label>
                        <input
                          type="text"
                          value={newLeadForm.middleName}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              selectedExistingClientId: '',
                              middleName: event.target.value,
                            }))
                          }
                          placeholder="Иванович"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Бренд
                        </label>
                        <input
                          type="text"
                          value={newLeadForm.brand}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              selectedExistingClientId: '',
                              brand: event.target.value,
                            }))
                          }
                          placeholder="Компания или бренд"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Телефон
                        </label>
                        <input
                          type="tel"
                          value={newLeadForm.clientPhone}
                          onChange={(event) => handlePhoneChange(event.target.value)}
                          placeholder="+7 916 354-92-87"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Формат автоматически приводим к +7 XXX XXX-XX-XX
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Дополнительная форма связи
                        </label>
                        <select
                          value={newLeadForm.additionalContactType}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              additionalContactType: event.target.value,
                              additionalContactValue: '',
                            }))
                          }
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">Не выбрано</option>
                          <option value="Telegram">Telegram</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Почта">Почта</option>
                          <option value="MAX">MAX</option>
                        </select>
                        {newLeadForm.additionalContactType ? (
                          <div className="mt-3">
                            <input
                              type="text"
                              value={newLeadForm.additionalContactValue}
                              onChange={(event) =>
                                setNewLeadForm((prev) => ({
                                  ...prev,
                                  additionalContactValue: event.target.value,
                                }))
                              }
                              placeholder={
                                newLeadForm.additionalContactType === 'Почта'
                                  ? 'Введите email'
                                  : `Введите контакт для ${newLeadForm.additionalContactType}`
                              }
                              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Поле необязательное
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-sm shadow-primary-100">
                    <header className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
                        Детали лида
                      </h3>
                      <p className="text-sm text-gray-600">
                        Отметьте источник и цель контакта, чтобы команда знала контекст.
                      </p>
                    </header>
                    <div className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-900">
                            Источник <span className="text-primary-500">*</span>
                          </label>
                          <select
                            value={newLeadForm.source}
                            onChange={(event) =>
                              setNewLeadForm((prev) => ({
                                ...prev,
                                source: event.target.value,
                              }))
                            }
                            required
                            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="Avito">Avito</option>
                            <option value="Сайт">Сайт</option>
                            <option value="Проектные продажи">Проектные продажи</option>
                            <option value="Теплые обзвоны">Теплые обзвоны</option>
                            <option value="Постоянные клиенты">Постоянные клиенты</option>
                            <option value="Сарафанное радио">Сарафанное радио</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-900">
                            Следующий контакт <span className="text-primary-500">*</span>
                          </label>
                          <input
                            type="datetime-local"
                            value={newLeadForm.nextContactDate}
                            onChange={(event) =>
                              setNewLeadForm((prev) => ({
                                ...prev,
                                nextContactDate: event.target.value,
                              }))
                            }
                            required
                            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Цель контакта
                        </label>
                        <input
                          type="text"
                          value={newLeadForm.contactPurpose}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              contactPurpose: event.target.value,
                            }))
                          }
                          placeholder="Например: уточнение готовности оформить заказ"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-900">
                          Заметки
                        </label>
                        <textarea
                          value={newLeadForm.notes}
                          onChange={(event) =>
                            setNewLeadForm((prev) => ({
                              ...prev,
                              notes: event.target.value,
                            }))
                          }
                          rows={4}
                          placeholder="Что важно учесть при работе с этим клиентом?"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <div className="flex flex-col items-center justify-between gap-4 border-t border-dashed border-gray-200 pt-6 sm:flex-row">
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-primary-600 shadow-sm">
                      💡 Подсказка
                    </span>
                    <span>Можно добавить заметку позже в карточке лида</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 sm:flex-initial sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewLeadForm(false)
                        setNewLeadForm({
                          selectedExistingClientId: '',
                          lastName: '',
                          firstName: '',
                          middleName: '',
                          brand: '',
                          clientPhone: '',
                          additionalContactType: '',
                          additionalContactValue: '',
                          source: 'Avito',
                          nextContactDate: getTomorrowNoon(),
                          contactPurpose: '',
                          notes: '',
                        })
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={modalActionLoading}
                      className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-80"
                    >
                      {modalActionLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Создаём…
                        </>
                      ) : (
                        'Создать лид'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Контакты на сегодня
                </h2>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-600">
                  {filteredTodayLeads.length}
                </span>
              </div>

              {filteredTodayLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                  <Clock className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                  <p className="font-medium text-gray-700">
                    Нет контактов на сегодня
                  </p>
                  <p className="text-sm text-gray-500">
                    Добавьте новый контакт или измените фильтры
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTodayLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      showDeleteButton={canHardDeleteLead(currentUser)}
                      onOpenNotes={() => openLeadModal(lead, 'notes')}
                      onOpenOrder={() => openLeadModal(lead, 'order')}
                      onCloseContact={() => openLeadModal(lead, 'close')}
                      onDeleteLead={() => openLeadModal(lead, 'delete')}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 lg:pl-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-semibold text-gray-900">
                  Будущие контакты
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {filteredFutureLeads.length}
                </span>
              </div>

              {filteredFutureLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                  <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                  <p className="font-medium text-gray-700">Нет запланированных контактов</p>
                  <p className="text-sm text-gray-500">
                    Измените фильтры или назначьте дату следующего контакта
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFutureLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      showDate
                      variant="compact"
                      showDeleteButton={canHardDeleteLead(currentUser)}
                      onOpenNotes={() => openLeadModal(lead, 'notes')}
                      onOpenOrder={() => openLeadModal(lead, 'order')}
                      onCloseContact={() => openLeadModal(lead, 'close')}
                      onDeleteLead={() => openLeadModal(lead, 'delete')}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showCalendar}
        title="Календарь контактов"
        onClose={() => setShowCalendar(false)}
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-primary-200 hover:text-primary-600"
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-lg font-semibold capitalize text-gray-900">
                {monthLabel}
              </div>
              <button
                type="button"
                onClick={goToNextMonth}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-primary-200 hover:text-primary-600"
                aria-label="Следующий месяц"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToToday}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary-200 hover:text-primary-600"
              >
                Сегодня
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="flex items-center justify-center py-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(({ date, key }) => {
                const isCurrentMonth =
                  date.getMonth() === calendarMonth.getMonth() &&
                  date.getFullYear() === calendarMonth.getFullYear()
                const isSelected = selectedCalendarDate === key
                const isToday = key === todayKey
                const events = calendarEvents[key] || []
                const hasEvents = events.length > 0

                const baseClasses =
                  'flex h-20 flex-col justify-between gap-2 rounded-xl border p-2 text-left transition'
                const stateClasses = isSelected
                  ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                  : isCurrentMonth
                    ? 'border-gray-200 bg-white text-gray-800 hover:border-primary-200 hover:bg-primary-50/40'
                    : 'border-dashed border-gray-200 bg-white text-gray-400 hover:border-primary-200 hover:bg-primary-50/20'

                return (
                  <button
                    key={`${key}-${date.getMonth()}-${date.getFullYear()}`}
                    type="button"
                    onClick={() => setSelectedCalendarDate(key)}
                    className={`${baseClasses} ${stateClasses}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                          isToday
                            ? isSelected
                              ? 'bg-primary-600 text-white'
                              : 'bg-primary-100 text-primary-700'
                            : ''
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {hasEvents ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isSelected
                              ? 'bg-white/80 text-primary-700'
                              : 'bg-primary-100 text-primary-600'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {events.length}
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5" />
                      )}
                    </div>
                    <div className="flex-1" />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">
                {selectedDateLabel}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-600">
                {selectedDateLeads.length}{' '}
                {selectedDateLeads.length === 1
                  ? 'контакт'
                  : selectedDateLeads.length >= 2 && selectedDateLeads.length <= 4
                    ? 'контакта'
                    : 'контактов'}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {selectedDateLeads.length === 0 ? (
                <p className="text-sm text-gray-500">
                  На эту дату нет запланированных контактов.
                </p>
              ) : (
                selectedDateLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="group block rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700">
                          {lead.client.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {lead.client.phone || '—'}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-primary-600">
                        {formatTime(lead.nextContactDate)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {lead.source ? (
                        <span>Источник: {lead.source}</span>
                      ) : null}
                      {lead.manager ? (
                        <span>
                          Менеджер:{' '}
                          {`${lead.manager.firstName} ${lead.manager.lastName}`}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={modalType === 'notes'}
        title={
          selectedLead
            ? `Заметки по лиду — ${selectedLead.client.name}`
            : 'Заметки по лиду'
        }
        onClose={resetModalState}
        footer={
          <form className="flex flex-col gap-3" onSubmit={handleSendComment}>
            <textarea
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              placeholder="Введите сообщение..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-gray-400">
                Shift + Enter — новая строка
              </span>
              <button
                type="submit"
                disabled={commentSending || !newComment.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
              >
                {commentSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Отправить'
                )}
              </button>
            </div>
          </form>
        }
      >
        {modalLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Дата следующего контакта */}
            {selectedLead && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Следующий контакт
                    </p>
                    {editingNextContactDate ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={nextContactDateValue}
                          onChange={(event) => setNextContactDateValue(event.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <button
                          type="button"
                          onClick={handleUpdateNextContactDate}
                          disabled={updatingNextContactDate || !nextContactDateValue}
                          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-60"
                        >
                          {updatingNextContactDate ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Сохранить'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNextContactDate(false)
                            setNextContactDateValue(formatDateForInput(selectedLead.nextContactDate))
                          }}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {selectedLead.nextContactDate
                            ? formatDateTime(selectedLead.nextContactDate)
                            : 'Не указана'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNextContactDate(true)
                            setNextContactDateValue(formatDateForInput(selectedLead.nextContactDate))
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Изменить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedLeadContactPurpose || selectedLeadFormNotes ? (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-inner">
                {selectedLeadContactPurpose ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Цель контакта
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-800">
                      {selectedLeadContactPurpose}
                    </p>
                  </div>
                ) : null}
                {selectedLeadFormNotes ? (
                  <div className={selectedLeadContactPurpose ? 'mt-3' : ''}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Заметки из формы
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-800">
                      {selectedLeadFormNotes}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {leadComments.length === 0 && !selectedLeadFormNotes ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Пока нет заметок — добавьте первую, чтобы зафиксировать договорённости
              </div>
            ) : null}

            {leadComments.length > 0 ? (
              leadComments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600">
                    {getInitials(
                      comment.user?.firstName,
                      comment.user?.lastName
                    )}
                  </div>
                  <div className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {comment.user
                          ? `${comment.user.firstName} ${comment.user.lastName}`
                          : 'Без имени'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    {comment.content ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                        {comment.content}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={modalType === 'order'}
        title={
          selectedLead
            ? `Новый заказ для ${selectedLead.client.name}`
            : 'Новый заказ'
        }
        onClose={resetModalState}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              Итоговая сумма: {formatCurrency(orderTotal)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetModalState}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="lead-create-order-form"
                disabled={modalActionLoading}
                className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
              >
                {modalActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Создать заказ'
                )}
              </button>
            </div>
          </div>
        }
      >
        {modalLoading || !selectedLeadDetails ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <form
            id="lead-create-order-form"
            onSubmit={handleCreateOrderFromLead}
            className="space-y-6"
          >
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">
                {selectedLeadDetails.client.name}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-white px-2.5 py-1">
                  Телефон: {selectedLeadDetails.client.phone || '—'}
                </span>
                {selectedLeadDetails.source ? (
                  <span className="rounded-full bg-white px-2.5 py-1">
                    Источник: {selectedLeadDetails.source}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Номер заказа
                </label>
                <input
                  type="text"
                  value={orderForm.orderNumber}
                  onChange={(event) =>
                    handleOrderFormChange('orderNumber', event.target.value)
                  }
                  placeholder="Оставьте пустым для автогенерации"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Источник заказа
                </label>
                <select
                  value={orderForm.source}
                  onChange={(event) =>
                    handleOrderFormChange('source', event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="Сайт">Сайт</option>
                  <option value="Avito">Avito</option>
                  <option value="Холодные обзвоны">Холодные обзвоны</option>
                  <option value="Сарафанное радио">Сарафанное радио</option>
                  <option value="Instagram">Instagram</option>
                  <option value="VK">VK</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  Позиции заказа
                </h4>
                <button
                  type="button"
                  onClick={addOrderPosition}
                  className="text-sm font-medium text-primary-600 transition hover:text-primary-700"
                >
                  + Добавить позицию
                </button>
              </div>

              {orderForm.positions.map((position, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 px-4 py-4 shadow-inner"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Позиция {index + 1}
                    </span>
                    {orderForm.positions.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeOrderPosition(index)}
                        className="text-xs font-medium text-red-500 hover:text-red-600"
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <input
                      type="text"
                      value={position.name}
                      onChange={(event) =>
                        updateOrderPosition(index, 'name', event.target.value)
                      }
                      placeholder="Описание"
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={position.quantity}
                      onChange={(event) =>
                        updateOrderPosition(index, 'quantity', event.target.value)
                      }
                      placeholder="Кол-во"
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="number"
                      value={position.price}
                      onChange={(event) =>
                        updateOrderPosition(index, 'price', event.target.value)
                      }
                      placeholder="Стоимость ₽"
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="hidden lg:block" />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Форма оплаты
              </label>
              <select
                value={orderForm.paymentType}
                onChange={(event) =>
                  handleOrderFormChange('paymentType', event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Не выбрано</option>
                <option value="TRANSFER">Перевод</option>
                <option value="INVOICE">Счёт</option>
                <option value="CASH">Наличные</option>
                <option value="PARTIAL">Дробная оплата</option>
              </select>
            </div>

            {orderForm.paymentType === 'PARTIAL' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Предоплата (₽)
                  </label>
                  <input
                    type="number"
                    value={orderForm.prepayment}
                    onChange={(event) =>
                      handleOrderFormChange('prepayment', event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Постоплата (₽)
                  </label>
                  <input
                    type="number"
                    value={orderForm.postpayment}
                    onChange={(event) =>
                      handleOrderFormChange('postpayment', event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Дополнительные комментарии
              </label>
              <textarea
                value={orderForm.notes}
                onChange={(event) =>
                  handleOrderFormChange('notes', event.target.value)
                }
                rows={3}
                placeholder="Комментарии для производства или поведения клиента"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={modalType === 'close'}
        title="Закрыть контакт"
        onClose={resetModalState}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetModalState}
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={modalActionLoading}
              onClick={handleCloseLead}
              className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
            >
              {modalActionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Закрыть контакт'
              )}
            </button>
          </div>
        }
      >
        {selectedLead ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">
                {selectedLead.client.name}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Контакт будет перенесён в раздел «Закрытые контакты» на вкладке
                клиентов. История лида будет сохранена в архиве.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Причина закрытия <span className="text-red-500">*</span>
              </label>
              <textarea
                value={closeReason}
                onChange={(event) => setCloseReason(event.target.value)}
                rows={4}
                placeholder="Например: клиент нашёл другого поставщика, не подтвердил заказ, не выходит на связь..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        )}
      </Modal>

      <Modal
        open={modalType === 'delete'}
        title="Удалить лид"
        onClose={resetModalState}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetModalState}
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={modalActionLoading}
              onClick={handleDeleteLead}
              className="inline-flex items-center justify-center rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:opacity-60"
            >
              {modalActionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Удалить'
              )}
            </button>
          </div>
        }
      >
        {selectedLead ? (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              Вы уверены, что хотите удалить лид{' '}
              <span className="font-semibold">{selectedLead.client.name}</span>?
            </p>
            <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
              Действие нельзя отменить. Лид исчезнет из списка и не попадёт в
              «Закрытые контакты».
            </p>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        )}
      </Modal>
    </Layout>
  )
}




