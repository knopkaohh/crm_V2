'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { openInvoicePdfPlaceholderTab, showInvoicePdfFromBlob } from '@/lib/openInvoicePdf'
import { User, Phone, Building2, Package, Calendar, CreditCard, Trash2, FileText } from 'lucide-react'

const CONTACT_METHODS = [
  { value: '', label: 'Не выбрано' },
  { value: 'Telegram', label: 'Telegram' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'MAX', label: 'MAX' },
  { value: 'Почта', label: 'Почта' },
] as const

const ORDER_SOURCES = [
  { value: 'Avito', label: 'Avito' },
  { value: 'Сайт', label: 'Сайт' },
  { value: 'Проектные продажи', label: 'Проектные продажи' },
  { value: 'Теплые обзвоны', label: 'Теплые обзвоны' },
  { value: 'Постоянный клиент', label: 'Постоянный клиент' },
  { value: 'Сарафанное радио', label: 'Сарафанное радио' },
] as const

interface ClientOption {
  id: string
  name: string
  phone?: string
  company?: string
  email?: string
  contactMethod?: string | null
  telegram?: string | null
}

export default function NewOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [showClientSelect, setShowClientSelect] = useState(false)
  const [designFiles, setDesignFiles] = useState<File[]>([])
  
  // Инициализируем бренд сразу из query параметров
  const queryClientBrand = searchParams.get('clientBrand')
  const queryClientName = searchParams.get('clientName')
  const queryClientPhone = searchParams.get('clientPhone')
  const querySource = searchParams.get('source')
  
  // Разделяем имя на имя и фамилию сразу
  const nameParts = queryClientName ? queryClientName.trim().split(/\s+/) : []
  const queryFirstName = nameParts.shift() ?? ''
  const queryLastName = nameParts.join(' ')
  
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: queryFirstName || '',
    clientLastName: queryLastName || '',
    clientBrand: queryClientBrand || '',
    clientPhone: queryClientPhone || '',
    clientEmail: '',
    contactMethod: '',
    contactTelegram: '',
    orderNumber: '',
    source: querySource || 'Сайт',
    managerId: '',
    positions: [{ material: '', size: '', quantity: '1', amount: '', deadline: '' }],
    paymentType: '',
    prepayment: '',
    postpayment: '',
    orderDescription: '',
  })
  const queryPrefillApplied = useRef(false)
  const leadPrefillApplied = useRef(false)

  const leadId = searchParams.get('leadId')
  const queryClientId = searchParams.get('clientId')

  useEffect(() => {
    loadClients()
  }, [])

  useEffect(() => {
    if (queryPrefillApplied.current) return
    if (
      !queryClientId &&
      !queryClientName &&
      !queryClientPhone &&
      !querySource &&
      !queryClientBrand
    ) {
      return
    }

    setFormData((prev) => {
      const next = { ...prev }
      if (queryClientId) {
        next.clientId = queryClientId
      }
      // Имя и фамилия уже инициализированы в useState, но обновим если нужно
      if (queryClientName && !prev.clientName) {
        const parts = queryClientName.trim().split(/\s+/)
        const firstName = parts.shift() ?? ''
        const lastName = parts.join(' ')
        if (firstName) next.clientName = firstName
        if (lastName) next.clientLastName = lastName
      }
      if (queryClientPhone && !prev.clientPhone) {
        next.clientPhone = queryClientPhone
      }
      if (querySource && !prev.source) {
        next.source = querySource
      }
      // Бренд уже инициализирован в useState, но обновим если нужно
      if (queryClientBrand && !prev.clientBrand) {
        next.clientBrand = queryClientBrand
      }
      return next
    })
    setShowClientSelect(false)
    queryPrefillApplied.current = true
  }, [queryClientId, queryClientName, queryClientPhone, querySource, queryClientBrand])

  useEffect(() => {
    if (!leadId || leadPrefillApplied.current) return
    let active = true

    const prefillFromLead = async () => {
      try {
        const response = await api.get(`/leads/${leadId}`)
        if (!active) return
        const lead = response.data
        const clientName: string = lead?.client?.name || ''
        const nameParts = clientName.trim().split(/\s+/)
        const firstName = nameParts.shift() ?? ''
        const lastName = nameParts.join(' ')

        setFormData((prev) => {
          // Не перезаписываем поля, если они уже заполнены (из query параметров)
          return {
            ...prev,
            clientId: prev.clientId || lead?.client?.id || '',
            clientName: prev.clientName || firstName || '',
            clientLastName: prev.clientLastName || lastName || '',
            clientPhone: prev.clientPhone || lead?.client?.phone || '',
            // Бренд из query параметров имеет абсолютный приоритет
            clientBrand: prev.clientBrand || lead?.client?.company || '',
            source: prev.source !== 'Сайт' ? prev.source : (lead?.source || prev.source),
          }
        })
        setShowClientSelect(false)
        leadPrefillApplied.current = true
      } catch (error) {
        console.error('Failed to prefill order form from lead:', error)
      }
    }

    prefillFromLead()
    return () => {
      active = false
    }
  }, [leadId])

  const loadClients = async () => {
    try {
      const response = await api.get('/clients')
      // API возвращает объект с полем data
      const clientsData = response.data?.data || response.data || []
      setClients(Array.isArray(clientsData) ? clientsData : [])
    } catch (error) {
      console.error('Failed to load clients:', error)
      setClients([]) // Устанавливаем пустой массив при ошибке
    }
  }

  const filteredClients = Array.isArray(clients) ? clients.filter((c) => {
    const searchLower = clientSearch.toLowerCase()
    const nameLower = c.name.toLowerCase()
    const phoneMatch = c.phone && c.phone.includes(clientSearch)
    const companyMatch = c.company && c.company.toLowerCase().includes(searchLower)
    
    // Разделяем имя на части для поиска по имени и фамилии отдельно
    const nameParts = nameLower.split(/\s+/)
    const nameMatch = nameParts.some(part => part.includes(searchLower)) || nameLower.includes(searchLower)
    
    return nameMatch || phoneMatch || companyMatch
  }) : []

  const addPosition = () => {
    setFormData((prev) => ({
      ...prev,
      positions: [...prev.positions, { material: '', size: '', quantity: '1', amount: '', deadline: '' }],
    }))
  }

  const removePosition = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      positions: prev.positions.filter((_, idx) => idx !== index),
    }))
  }

  const updatePosition = (index: number, key: 'material' | 'size' | 'quantity' | 'amount' | 'deadline', value: string) => {
    setFormData((prev) => {
      const next = [...prev.positions]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, positions: next }
    })
  }

  const handleClientSelect = (client: ClientOption) => {
    const clientNameParts = client.name.split(' ')
    const clientFirstName = clientNameParts[0] || ''
    const clientLastName = clientNameParts.slice(1).join(' ') || ''
    setFormData((prev) => ({
      ...prev,
      clientId: client.id,
      clientName: clientFirstName,
      clientLastName: clientLastName,
      clientPhone: client.phone || '',
      clientBrand: (client as any).company || '',
      clientEmail: client.email || '',
      contactMethod: client.contactMethod || '',
      contactTelegram: client.telegram ? (client.telegram.startsWith('@') ? client.telegram.slice(1) : client.telegram) : '',
      source: 'Постоянный клиент',
    }))
    setShowClientSelect(false)
    setClientSearch('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.clientId && !formData.clientName) {
      alert('Выберите клиента или укажите имя нового клиента')
      return
    }
    if (!formData.clientPhone) {
      alert('Укажите телефон клиента')
      return
    }
    const invoicePdfTab = openInvoicePdfPlaceholderTab()
    setLoading(true)
    try {
      // Build full client name from first name and last name
      const fullClientName = [formData.clientName, formData.clientLastName].filter(Boolean).join(' ')
      
      let clientId = formData.clientId
      const clientPayload: any = {
        name: fullClientName,
        phone: formData.clientPhone,
      }
      if (formData.clientBrand) clientPayload.company = formData.clientBrand
      if (formData.contactMethod) clientPayload.contactMethod = formData.contactMethod
      if (formData.contactMethod === 'Telegram' && formData.contactTelegram) {
        clientPayload.telegram = formData.contactTelegram.startsWith('@') ? formData.contactTelegram : `@${formData.contactTelegram}`
      }
      if (formData.contactMethod === 'Почта' || formData.clientEmail) {
        clientPayload.email = formData.clientEmail || null
      }
      if (!clientId) {
        const resClient = await api.post('/clients', clientPayload)
        clientId = resClient.data.id
      } else {
        try {
          await api.put(`/clients/${clientId}`, clientPayload)
        } catch (e) {
          // Ignore update errors
        }
      }

      const totalAmount = formData.positions.reduce((sum, p) => sum + (parseFloat(p.amount || '0') || 0), 0)
      const items = formData.positions.map((p) => ({
        name: `${p.material} ${p.size}`.trim(),
        quantity: parseInt(p.quantity || '0') || 0,
        price: parseFloat(p.amount || '0') || 0, // amount уже содержит итоговую стоимость позиции
        desiredDeadline: p.deadline && p.deadline.trim() ? new Date(p.deadline).toISOString() : null,
      }))
      const payload: any = {
        clientId,
        status: 'NEW_ORDER',
        totalAmount,
        deadline: null,
        items,
        notes: `Источник: ${formData.source}`,
        orderNumber: formData.orderNumber || null,
        source: formData.source,
        description: formData.orderDescription || null,
      }
      
      // Добавляем leadId для автоматического закрытия лида
      if (leadId) {
        payload.leadId = leadId
      }
      
      // Добавляем форму оплаты
      if (formData.paymentType) {
        payload.paymentType = formData.paymentType
        if (formData.paymentType === 'PARTIAL') {
          if (formData.prepayment) payload.prepayment = parseFloat(formData.prepayment)
          if (formData.postpayment) payload.postpayment = parseFloat(formData.postpayment)
        }
      }
      const res = await api.post('/orders', payload)
      const createdId = res.data?.id
      // Лид будет автоматически закрыт на бэкенде при создании заказа

      // Загрузка файлов макета, если они выбраны в форме
      if (createdId && designFiles.length > 0) {
        for (const file of designFiles) {
          const formDataFile = new FormData()
          formDataFile.append('file', file)
          formDataFile.append('orderId', createdId)
          await api.post('/files/upload', formDataFile)
        }
      }
      
      // Автоматическая загрузка PDF счета (на телефоне — вкладка открыта синхронно с отправкой формы)
      if (createdId) {
        try {
          const pdfResponse = await api.get(`/orders/${createdId}/invoice`, {
            responseType: 'blob',
          })
          const contentDisposition = pdfResponse.headers['content-disposition']
          const today = new Date()
          const formattedDate = today.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          let fileName = `Счёт №${res.data.orderNumber || 'order'} от ${formattedDate}.pdf`
          if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/i)
            if (fileNameMatch) {
              fileName = decodeURIComponent(fileNameMatch[1])
            } else {
              const fileNameMatch2 = contentDisposition.match(/filename="(.+)"/i)
              if (fileNameMatch2) {
                fileName = fileNameMatch2[1]
              }
            }
          }
          const blob = new Blob([pdfResponse.data], { type: 'application/pdf' })
          await showInvoicePdfFromBlob(blob, fileName, invoicePdfTab)
        } catch (pdfError: unknown) {
          console.error('Failed to download invoice:', pdfError)
          try {
            invoicePdfTab?.close()
          } catch {
            /* ignore */
          }
          const pdfAny = pdfError as { response?: { data?: { details?: string; error?: string } }; message?: string }
          const errorMessage =
            pdfAny?.response?.data?.details ||
            pdfAny?.response?.data?.error ||
            pdfAny?.message ||
            'Не удалось загрузить счет'
          alert(`Ошибка при загрузке счета: ${errorMessage}`)
        }
      } else {
        try {
          invoicePdfTab?.close()
        } catch {
          /* ignore */
        }
      }
      
      // Перенаправляем на страницу заказов (список обновится автоматически при монтировании)
      router.push(leadId ? '/orders?status=NEW_ORDER' : '/orders')
    } catch (error: any) {
      console.error('Failed to create order:', error)
      try {
        invoicePdfTab?.close()
      } catch {
        /* ignore */
      }
      alert(error.response?.data?.error || 'Ошибка при создании заказа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Заголовок с градиентом */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Новый заказ
          </h1>
          <p className="text-gray-600">Заполните информацию о клиенте и позиции заказа</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Карточка: Информация о клиенте */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Информация о клиенте</h2>
                <p className="text-sm text-gray-500">Выберите существующего или создайте нового</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Поиск существующего клиента */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Поиск клиента
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Введите имя, телефон или бренд клиента..."
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value)
                      setShowClientSelect(true)
                    }}
                    onFocus={() => setShowClientSelect(true)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-gray-50 hover:bg-white"
                  />
                  <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  {showClientSelect && clientSearch && filteredClients.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                      {filteredClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => handleClientSelect(client)}
                          className="px-4 py-3 hover:bg-gradient-to-r hover:from-primary-50 hover:to-purple-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all"
                        >
                          <div className="font-semibold text-gray-900">{client.name}</div>
                          {client.phone && <div className="text-sm text-gray-600 mt-0.5">📱 {client.phone}</div>}
                          {client.company && <div className="text-sm text-primary-600 mt-0.5">🏢 {client.company}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {formData.clientId && (
                  <div className="mt-3 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                    <p className="text-sm font-medium text-green-800">✓ Выбран: {formData.clientName} {formData.clientLastName}</p>
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500 font-medium">или создайте нового</span>
                </div>
              </div>

              {/* Имя и Фамилия */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Имя клиента
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Имя"
                      value={formData.clientName}
                      onChange={(e) => {
                        setFormData({ ...formData, clientName: e.target.value, clientId: '' })
                        setShowClientSelect(false)
                      }}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    />
                    <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Фамилия клиента
                  </label>
                  <input
                    type="text"
                    placeholder="Фамилия"
                    value={formData.clientLastName}
                    onChange={(e) => {
                      setFormData({ ...formData, clientLastName: e.target.value, clientId: '' })
                      setShowClientSelect(false)
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              {/* Бренд и Телефон */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Бренд / Компания
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Название бренда или компании"
                      value={formData.clientBrand}
                      onChange={(e) => setFormData({ ...formData, clientBrand: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    />
                    <Building2 className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Телефон <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      value={formData.clientPhone}
                      onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                      placeholder="+7 (___) ___-__-__"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    />
                    <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Номер заказа и Источник */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Номер заказа
                  </label>
                  <input
                    type="text"
                    value={formData.orderNumber}
                    onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                    placeholder="AF-0333 (необязательно)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Источник
                  </label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                  >
                    {ORDER_SOURCES.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Способ связи */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Способ связи
                </label>
                <select
                  value={formData.contactMethod}
                  onChange={(e) => setFormData({ ...formData, contactMethod: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                >
                  {CONTACT_METHODS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {formData.contactMethod === 'Telegram' && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Username в Telegram</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-gray-500 font-medium">@</span>
                      <input
                        type="text"
                        value={formData.contactTelegram}
                        onChange={(e) => setFormData({ ...formData, contactTelegram: e.target.value.replace(/^@/, '') })}
                        placeholder="username"
                        className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                      />
                    </div>
                  </div>
                )}
                {formData.contactMethod === 'Почта' && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={formData.clientEmail}
                      onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                      placeholder="example@mail.ru"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    />
                  </div>
                )}
                {(formData.contactMethod === 'WhatsApp' || formData.contactMethod === 'MAX') && (
                  <p className="mt-2 text-sm text-gray-500">Для связи используется указанный выше номер телефона</p>
                )}
              </div>
            </div>
          </div>

          {/* Карточка: Позиции заказа */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Позиции заказа</h2>
                  <p className="text-sm text-gray-500">Добавьте товары или услуги</p>
                </div>
              </div>
              <button
                type="button"
                onClick={addPosition}
                className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-primary-600 to-purple-600 text-white rounded-xl hover:from-primary-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
              >
                + Добавить позицию
              </button>
            </div>

            <div className="space-y-4">
              {formData.positions.map((p, idx) => (
                <div key={idx} className="relative p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl border border-gray-200 hover:border-primary-300 transition-all">
                  {/* Кнопка удаления */}
                  {formData.positions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePosition(idx)}
                      className="absolute top-3 right-3 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all hover:scale-110"
                      title="Удалить позицию"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}

                  <div className="space-y-4">
                    {/* Первая строка: Материал, Размеры */}
                    <div className={`grid grid-cols-1 gap-4 ${p.material !== 'Разработка макетов' ? 'md:grid-cols-2' : ''}`}>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Материал</label>
                        <select
                          value={p.material}
                          onChange={(e) => updatePosition(idx, 'material', e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                        >
                          <option value="">Выберите материал</option>
                          <option value="Сатин классический">Сатин классический</option>
                          <option value="Сатин премиум">Сатин премиум</option>
                          <option value="Силикон">Силикон</option>
                          <option value="Жаккард">Жаккард</option>
                          <option value="Картонная навесная бирка">Картонная навесная бирка</option>
                          <option value="Хлопок">Хлопок</option>
                          <option value="ZIP-Lock пакет">ZIP-Lock пакет</option>
                          <option value="Разработка макетов">Разработка макетов</option>
                        </select>
                      </div>
                      {p.material !== 'Разработка макетов' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Размеры</label>
                          <input
                            type="text"
                            placeholder="Например: 10x15 см"
                            value={p.size}
                            onChange={(e) => updatePosition(idx, 'size', e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                          />
                        </div>
                      )}
                    </div>

                    {/* Вторая строка: Количество, Стоимость, Срок сдачи */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Количество</label>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0"
                            value={p.quantity}
                            onChange={(e) => updatePosition(idx, 'quantity', e.target.value)}
                            className="w-full px-4 pr-12 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                          />
                          <span className="absolute right-4 top-3 text-sm font-medium text-gray-500">ед.</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Итоговая стоимость</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={p.amount}
                            onChange={(e) => updatePosition(idx, 'amount', e.target.value)}
                            className="w-full px-4 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                          />
                          <span className="absolute right-4 top-3 text-sm font-medium text-gray-500">₽</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Срок сдачи</label>
                        <div className="relative">
                          <input
                            type="date"
                            value={p.deadline}
                            onChange={(e) => updatePosition(idx, 'deadline', e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                          />
                          <Calendar className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Итого */}
            <div className="mt-6 p-5 bg-gradient-to-r from-primary-50 via-purple-50 to-pink-50 rounded-xl border-2 border-primary-200">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">Общая сумма заказа:</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
                  {formData.positions.reduce((sum, p) => sum + (parseFloat(p.amount || '0') || 0), 0).toFixed(2)} ₽
                </span>
              </div>
            </div>
          </div>

          {/* Карточка: Описание заказа */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Описание заказа</h2>
                <p className="text-sm text-gray-500">Дополнительная информация о заказе</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Текст описания</label>
              <textarea
                value={formData.orderDescription}
                onChange={(e) => setFormData({ ...formData, orderDescription: e.target.value })}
                placeholder="Введите описание заказа..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-y"
              />
            </div>
          </div>

          {/* Карточка: Файлы макета */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Добавить макет</h2>
                <p className="text-sm text-gray-500">Файлы будут прикреплены к заказу после создания</p>
              </div>
            </div>
            <input
              type="file"
              multiple
              onChange={(e) => setDesignFiles(Array.from(e.target.files || []))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            />
            {designFiles.length > 0 && (
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                {designFiles.map((file) => (
                  <p key={`${file.name}-${file.size}`}>• {file.name}</p>
                ))}
              </div>
            )}
          </div>

          {/* Карточка: Форма оплаты */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Форма оплаты</h2>
                <p className="text-sm text-gray-500">Укажите способ оплаты заказа</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Способ оплаты</label>
                <select
                  value={formData.paymentType}
                  onChange={(e) => setFormData({ ...formData, paymentType: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                >
                  <option value="">Не выбрано</option>
                  <option value="TRANSFER">💳 Перевод</option>
                  <option value="INVOICE">📄 Счёт</option>
                  <option value="CASH">💵 Наличные</option>
                  <option value="PARTIAL">📊 Дробная оплата</option>
                </select>
              </div>

              {formData.paymentType === 'PARTIAL' && (
                <div className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200 space-y-4">
                  <p className="text-sm font-semibold text-blue-900">Укажите суммы предоплаты и постоплаты</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Предоплата</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={formData.prepayment}
                          onChange={(e) => setFormData({ ...formData, prepayment: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-4 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                        />
                        <span className="absolute right-4 top-3 text-sm font-medium text-gray-500">₽</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Постоплата</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={formData.postpayment}
                          onChange={(e) => setFormData({ ...formData, postpayment: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-4 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
                        />
                        <span className="absolute right-4 top-3 text-sm font-medium text-gray-500">₽</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 text-white text-lg font-bold rounded-xl hover:from-primary-700 hover:via-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Создание заказа...
                </span>
              ) : (
                '✨ Создать заказ'
              )}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-8 py-4 border-2 border-gray-300 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all transform hover:scale-[1.02]"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}


