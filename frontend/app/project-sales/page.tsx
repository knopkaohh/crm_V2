'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Kanban, Plus, Loader2, UserCircle, Building2 } from 'lucide-react'

type ProjectSaleStage =
  | 'NEW_BRANDS'
  | 'IN_PROGRESS'
  | 'INTERESTED'
  | 'NOT_OUR_CLIENT'
  | 'ORDER_PLACED'

interface ManagerUser {
  id: string
  firstName: string
  lastName: string
}

interface ProjectSaleRow {
  id: string
  stage: ProjectSaleStage
  createdAt: string
  client: {
    id: string
    name: string
    company: string | null
    phone: string
  }
  manager: ManagerUser
}

const STAGES: { id: ProjectSaleStage; label: string }[] = [
  { id: 'NEW_BRANDS', label: 'Новые бренды' },
  { id: 'IN_PROGRESS', label: 'Бренды в работе' },
  { id: 'INTERESTED', label: 'Заинтересованные' },
  { id: 'NOT_OUR_CLIENT', label: 'Не наши клиенты' },
  { id: 'ORDER_PLACED', label: 'Оформили заказ' },
]

/** Порядок имён как у вас в списке (для сортировки выпадающих списков) */
const MANAGER_ORDER_KEYS = [
  'антон федотов',
  'георгий мониава',
  'хрусталев роман',
  'палтарацкас гинтарас',
  'царьков никита',
  'алескеров нариман',
  'шалагинов максим',
  'пендус владислав',
]

function normalizeManagerKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
}

function sortManagers(list: ManagerUser[]): ManagerUser[] {
  return [...list].sort((a, b) => {
    const ka = normalizeManagerKey(a.firstName, a.lastName)
    const kb = normalizeManagerKey(b.firstName, b.lastName)
    const ia = MANAGER_ORDER_KEYS.indexOf(ka)
    const ib = MANAGER_ORDER_KEYS.indexOf(kb)
    const da = ia === -1 ? 1000 : ia
    const db = ib === -1 ? 1000 : ib
    if (da !== db) return da - db
    return ka.localeCompare(kb, 'ru')
  })
}

function formatCardDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Как на странице заказов: левая полоса + лёгкий фон по этапу */
function getStageIndicator(stage: ProjectSaleStage): { border: string; bg: string } {
  switch (stage) {
    case 'NEW_BRANDS':
      return { border: 'border-l-blue-400', bg: 'bg-blue-50/40' }
    case 'IN_PROGRESS':
      return { border: 'border-l-yellow-400', bg: 'bg-yellow-50/40' }
    case 'INTERESTED':
      return { border: 'border-l-orange-400', bg: 'bg-orange-50/40' }
    case 'NOT_OUR_CLIENT':
      return { border: 'border-l-rose-400', bg: 'bg-rose-50/40' }
    case 'ORDER_PLACED':
      return { border: 'border-l-green-600', bg: 'bg-green-100/40' }
    default:
      return { border: 'border-l-gray-300', bg: 'bg-gray-50' }
  }
}

type RowDraft = { brandName: string; managerId: string }

export default function ProjectSalesPage() {
  const router = useRouter()
  const [items, setItems] = useState<ProjectSaleRow[]>([])
  const [managers, setManagers] = useState<ManagerUser[]>([])
  const [managerFilter, setManagerFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [batchRows, setBatchRows] = useState<RowDraft[]>(() =>
    Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' }))
  )
  const [batchSaving, setBatchSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<ProjectSaleStage | null>(null)

  const sortedManagers = useMemo(() => sortManagers(managers), [managers])

  const loadManagers = useCallback(async () => {
    const res = await api.get('/project-sales/managers', {
      headers: { 'X-Skip-Cache': 'true' },
    })
    setManagers(res.data || [])
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params =
        managerFilter !== 'ALL' ? { managerId: managerFilter } : undefined
      const res = await api.get('/project-sales', {
        params,
        headers: { 'X-Skip-Cache': 'true' },
      })
      setItems(res.data || [])
    } catch (e) {
      console.error(e)
      alert('Не удалось загрузить воронку')
    } finally {
      setLoading(false)
    }
  }, [managerFilter])

  useEffect(() => {
    loadManagers().catch(console.error)
  }, [loadManagers])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const byStage = useMemo(() => {
    const map = new Map<ProjectSaleStage, ProjectSaleRow[]>()
    for (const s of STAGES) map.set(s.id, [])
    for (const row of items) {
      const list = map.get(row.stage) ?? []
      list.push(row)
      map.set(row.stage, list)
    }
    return map
  }, [items])

  const openModal = () => {
    setBatchRows(Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' })))
    setModalOpen(true)
  }

  const addBatchRows = () => {
    setBatchRows((r) => [...r, ...Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' }))])
  }

  const updateBatchRow = (index: number, patch: Partial<RowDraft>) => {
    setBatchRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const submitBatch = async () => {
    const payload = batchRows
      .map((r) => ({
        brandName: r.brandName.trim(),
        managerId: r.managerId.trim(),
      }))
      .filter((r) => r.brandName && r.managerId)
    if (payload.length === 0) {
      alert('Заполните хотя бы одну строку: бренд и менеджер')
      return
    }
    setBatchSaving(true)
    try {
      await api.post('/project-sales/batch', { items: payload })
      setModalOpen(false)
      await loadItems()
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка при сохранении'
      alert(msg)
    } finally {
      setBatchSaving(false)
    }
  }

  const onDragStartCard = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragEndCard = () => {
    setDragId(null)
    setDragOverStage(null)
  }

  const onDragOverColumn = (e: React.DragEvent, stage: ProjectSaleStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }

  const onDragLeaveColumn = () => {
    setDragOverStage(null)
  }

  const onDropColumn = async (e: React.DragEvent, stage: ProjectSaleStage) => {
    e.preventDefault()
    setDragOverStage(null)

    if (!dragId) return
    const prev = items.find((i) => i.id === dragId)
    if (!prev || prev.stage === stage) {
      setDragId(null)
      return
    }
    try {
      const res = await api.patch(`/project-sales/${dragId}/stage`, { stage })
      const updated = res.data as ProjectSaleRow
      setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)))
    } catch (err) {
      console.error(err)
      alert('Не удалось переместить карточку')
    } finally {
      setDragId(null)
    }
  }

  const brandTitle = (row: ProjectSaleRow) =>
    row.client.company?.trim() || row.client.name

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
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Kanban className="h-8 w-8 text-primary-600" />
              <h1 className="text-3xl font-bold text-gray-900">Проектные продажи</h1>
            </div>
            <p className="text-gray-600 mt-1">Воронка брендов и ответственные менеджеры</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-primary-900/5 p-4">
          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600 flex-1 min-w-0">
              <UserCircle className="h-5 w-5 text-gray-400 shrink-0" />
              <label htmlFor="mgr-filter" className="sr-only">
                Менеджер
              </label>
              <select
                id="mgr-filter"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                className="w-full md:max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="ALL">Все менеджеры</option>
                {sortedManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shrink-0"
            >
              <Plus className="h-5 w-5" />
              <span>Назначить новые бренды</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAGES.map((col) => {
            const columnItems = byStage.get(col.id) ?? []
            return (
              <div
                key={col.id}
                className={`overflow-hidden rounded-3xl border transition-colors shadow-xl shadow-primary-900/5 ${
                  dragOverStage === col.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white'
                }`}
                onDragOver={(e) => onDragOverColumn(e, col.id)}
                onDragLeave={onDragLeaveColumn}
                onDrop={(e) => {
                  void onDropColumn(e, col.id)
                }}
              >
                <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm">{col.label}</h3>
                    <span className="text-xs text-gray-700 bg-white/80 border border-gray-200 px-2 py-1 rounded-lg">
                      {columnItems.length}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-3 max-h-[650px] overflow-y-auto">
                  {columnItems.map((row) => {
                    const indicator = getStageIndicator(row.stage)
                    return (
                      <div
                        key={row.id}
                        draggable
                        onDragStart={(e) => onDragStartCard(e, row.id)}
                        onDragEnd={onDragEndCard}
                        onClick={() => router.push(`/clients/${row.client.id}`)}
                        className={`rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 ${indicator.border} ${indicator.bg} cursor-move relative ${
                          dragId === row.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <h4 className="font-medium text-gray-900 text-sm leading-snug">
                            {brandTitle(row)}
                          </h4>
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        </div>
                        <p className="text-xs text-gray-500">
                          {row.manager.firstName} {row.manager.lastName}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{formatCardDate(row.createdAt)}</p>
                        <p className="text-[11px] font-medium text-primary-600 mt-2">Открыть клиента →</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-3 py-6 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Назначить новые бренды</h2>
              <button
                type="button"
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                onClick={() => setModalOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto px-5 py-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="pb-2 pr-3 font-medium">Название бренда</th>
                    <th className="pb-2 font-medium">Ответственный менеджер</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-2 pr-3 align-middle">
                        <input
                          type="text"
                          value={row.brandName}
                          onChange={(e) => updateBatchRow(index, { brandName: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Бренд"
                        />
                      </td>
                      <td className="py-2 align-middle">
                        <select
                          value={row.managerId}
                          onChange={(e) => updateBatchRow(index, { managerId: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="">Выберите менеджера</option>
                          {sortedManagers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.firstName} {m.lastName}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={addBatchRows}
                className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                + добавить еще 5
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={batchSaving}
                onClick={() => void submitBatch()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {batchSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
