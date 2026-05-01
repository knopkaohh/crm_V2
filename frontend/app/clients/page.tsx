'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Plus, Search, Phone, Trash2, Archive, Calendar, User } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'

interface Client {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string
  whatsapp: string | null
  ordersCount: number
  lastOrderDate: string | null
  manager: {
    id: string
    firstName: string
    lastName: string
  } | null
}

interface ClosedContact {
  id: string
  clientName: string
  clientPhone: string | null
  source: string | null
  reason: string
  notes?: string | null
  createdAt: string
  manager?: {
    firstName: string
    lastName: string
  } | null
}

type ClientsTab = 'clients' | 'closed'
type SourceFilter = '' | 'Avito' | 'Сайт' | 'Проектные продажи' | 'Теплые обзвоны' | 'Постоянные клиенты' | 'Сарафанное радио'

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: '', label: 'Все источники' },
  { value: 'Avito', label: 'Avito' },
  { value: 'Сайт', label: 'Сайт' },
  { value: 'Проектные продажи', label: 'Проектные продажи' },
  { value: 'Теплые обзвоны', label: 'Теплые обзвоны' },
  { value: 'Постоянные клиенты', label: 'Постоянные клиенты' },
  { value: 'Сарафанное радио', label: 'Сарафанное радио' },
]

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ClientsPage() {
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [closedContacts, setClosedContacts] = useState<ClosedContact[]>([])
  const [closedContactsLoading, setClosedContactsLoading] = useState(false)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('')
  const [managerFilter, setManagerFilter] = useState('')
  const [activeTab, setActiveTab] = useState<ClientsTab>('clients')

  const debouncedSearch = useDebounce(search.trim(), 500) // Используем useDebounce hook

  useEffect(() => {
    if (activeTab === 'clients') {
      loadClients()
    } else {
      loadClosedContacts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, sourceFilter, managerFilter, activeTab])

  const loadClients = async () => {
    setClientsLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: 1,
        limit: 100,
      }
      if (debouncedSearch) {
        params.search = debouncedSearch
      }
      if (sourceFilter) {
        params.source = sourceFilter
      }
      if (managerFilter) {
        params.managerId = managerFilter
      }

      const response = await api.get('/clients', { params })
      const clientsData = response.data.data || response.data || []
      setClients(Array.isArray(clientsData) ? clientsData : [])
    } catch (error) {
      console.error('Failed to load clients:', error)
      setClients([])
    } finally {
      setClientsLoading(false)
    }
  }

  const loadClosedContacts = async () => {
    setClosedContactsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (debouncedSearch) {
        params.search = debouncedSearch
      }
      const response = await api.get('/clients/closed-contacts', { params })
      const contacts = response.data?.data || []
      setClosedContacts(Array.isArray(contacts) ? contacts : [])
    } catch (error) {
      console.error('Failed to load closed contacts:', error)
      setClosedContacts([])
    } finally {
      setClosedContactsLoading(false)
    }
  }

const confirmAndDeleteClosedContact = async (
  id: string,
  setClosedContacts: React.Dispatch<React.SetStateAction<ClosedContact[]>>,
) => {
  if (!confirm('Удалить закрытый контакт?')) {
    return
  }
  try {
    await api.delete(`/clients/closed-contacts/${id}`)
    setClosedContacts((prev) => prev.filter((contact) => contact.id !== id))
  } catch (error) {
    console.error('Failed to delete closed contact:', error)
    alert('Не удалось удалить закрытый контакт')
  }
}

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого клиента?')) {
      return
    }

    try {
      await api.delete(`/clients/${clientId}`)
      setClients((prev) => prev.filter((client) => client.id !== clientId))
    } catch (error) {
      console.error('Failed to delete client:', error)
      alert('Не удалось удалить клиента')
    }
  }

  const isClientsTab = activeTab === 'clients'
  const isClosedTab = activeTab === 'closed'
  const managerOptions = useMemo(() => {
    const map = new Map<string, string>()
    clients.forEach((client) => {
      if (client.manager?.id) {
        map.set(client.manager.id, `${client.manager.firstName} ${client.manager.lastName}`)
      }
    })
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [clients])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">База клиентов</h1>
            <p className="text-gray-600">
              Управление клиентами, активными заказами и архивом закрытых контактов
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('clients')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isClientsTab
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Клиенты
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('closed')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isClosedTab
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Закрытые контакты
              </button>
            </div>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              <span>Новый клиент</span>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={
                  isClientsTab
                    ? 'Поиск по имени клиента, бренду, телефону или номеру заказа...'
                    : 'Поиск по имени, телефону, источнику или менеджеру...'
                }
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {isClientsTab ? (
              <>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 md:w-64"
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={managerFilter}
                  onChange={(event) => setManagerFilter(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 md:w-64"
                >
                  <option value="">Все менеджеры</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        </div>

        {isClientsTab ? (
          clientsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-white shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Название бренда
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Имя клиента
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Телефон
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Менеджер
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Количество заказов
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Дата крайнего заказа
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {clients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {client.company || '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-sm font-semibold text-gray-900 hover:text-primary-600"
                          >
                            {client.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {client.phone || '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {client.manager
                            ? `${client.manager.firstName} ${client.manager.lastName}`
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                          {client.ordersCount || 0}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatDate(client.lastOrderDate)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/clients/${client.id}`}
                              className="text-primary-600 hover:text-primary-800"
                            >
                              Открыть
                            </Link>
                            <button
                              onClick={() => handleDeleteClient(client.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Удалить клиента"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clients.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-gray-500">
                    <p>Клиенты не найдены</p>
                    {debouncedSearch ? (
                      <p className="mt-2 text-xs text-gray-400">
                        Попробуйте изменить критерии поиска
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )
        ) : null}

        {isClosedTab ? (
          closedContactsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500" />
            </div>
          ) : (
            <div className="space-y-4">
              {closedContacts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                  <Archive className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                  <p className="font-medium text-gray-700">
                    В архиве пока пусто
                  </p>
                  <p className="text-sm text-gray-500">
                    Закрытые контакты будут появляться здесь после указания причины закрытия
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-white shadow">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Клиент
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Телефон
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Источник
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Менеджер
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Причина закрытия
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Дата закрытия
                          </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Действия
                      </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {closedContacts.map((contact) => (
                          <tr key={contact.id} className="align-top hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                  <Archive className="h-4 w-4 text-gray-400" />
                                  {contact.clientName}
                                </div>
                                {contact.notes ? (
                                  <p className="text-xs text-gray-500">
                                    {contact.notes}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                                <Phone className="h-3.5 w-3.5 text-gray-500" />
                                {contact.clientPhone || '—'}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              {contact.source || '—'}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                {contact.manager
                                  ? `${contact.manager.firstName} ${contact.manager.lastName}`
                                  : '—'}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {contact.reason}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                                <Calendar className="h-3.5 w-3.5 text-gray-500" />
                                {formatDateTime(contact.createdAt)}
                              </div>
                            </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              confirmAndDeleteClosedContact(
                                contact.id,
                                setClosedContacts,
                              )
                            }
                            className="inline-flex items-center rounded-full border border-gray-200 bg-white p-2 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            title="Удалить закрытый контакт"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        ) : null}
      </div>
    </Layout>
  )
}

