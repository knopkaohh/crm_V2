'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import { Kanban, Plus, Loader2, UserCircle, Building2, X, ExternalLink, Paperclip } from 'lucide-react'

type ProjectSaleStage =
  | 'NEW_BRANDS'
  | 'IN_PROGRESS'
  | 'INTERESTED'
  | 'NOT_OUR_CLIENT'
  | 'ORDER_PLACED'

type ProjectSaleOrderKind = 'SAMPLES' | 'ORDER'

interface ManagerUser {
  id: string
  firstName: string
  lastName: string
}

interface ProjectFileMeta {
  id: string
  originalName: string
  size: number
  mimeType: string
}

interface ProjectSaleRow {
  id: string
  stage: ProjectSaleStage
  createdAt: string
  rejectionReason?: string | null
  orderBrief?: string | null
  orderKind?: ProjectSaleOrderKind | null
  files?: ProjectFileMeta[]
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
  { id: 'ORDER_PLACED', label: 'Оформили заказ/Образец' },
  { id: 'NOT_OUR_CLIENT', label: 'Не наш клиент' },
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

function canActOnSale(row: ProjectSaleRow, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  return row.manager.id === user.id
}

type RowDraft = { brandName: string; managerId: string }

type DialogState =
  | { kind: 'takeWork'; row: ProjectSaleRow }
  | { kind: 'decline'; row: ProjectSaleRow }
  | { kind: 'order'; row: ProjectSaleRow; orderKind: ProjectSaleOrderKind }

function FunnelModalShell({
  title,
  children,
  onClose,
  visible,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  visible: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Закрыть"
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-primary-900/10 ring-1 ring-black/5 transition-all duration-300 ease-out ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-[0.97] opacity-0'
        }`}
      >
        <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-500 transition hover:bg-white/80 hover:text-gray-800"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function ProjectSalesPage() {
  const router = useRouter()
  const [items, setItems] = useState<ProjectSaleRow[]>([])
  const [managers, setManagers] = useState<ManagerUser[]>([])
  const [managerFilter, setManagerFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [batchRows, setBatchRows] = useState<RowDraft[]>(() =>
    Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' }))
  )
  const [batchSaving, setBatchSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<ProjectSaleStage | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogVisible, setDialogVisible] = useState(false)
  const [dialogBusy, setDialogBusy] = useState(false)

  const [takeForm, setTakeForm] = useState({ fullName: '', phone: '', position: '', notes: '' })
  const [declineReason, setDeclineReason] = useState('')
  const [orderForm, setOrderForm] = useState({ brief: '' })
  const [orderFiles, setOrderFiles] = useState<File[]>([])

  const sortedManagers = useMemo(() => sortManagers(managers), [managers])

  const loadManagers = useCallback(async () => {
    const res = await api.get('/project-sales/managers', {
      headers: { 'X-Skip-Cache': '1' },
    })
    setManagers(res.data as ManagerUser[])
  }, [])

  const loadSales = useCallback(async () => {
    const params =
      managerFilter !== 'ALL' ? { managerId: managerFilter } : ({} as Record<string, string>)
    const res = await api.get('/project-sales', {
      params,
      headers: { 'X-Skip-Cache': '1' },
    })
    setItems(res.data as ProjectSaleRow[])
  }, [managerFilter])

  const bootstrapDone = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!bootstrapDone.current) {
        setLoading(true)
        try {
          const u = await auth.getCurrentUser().catch(() => null)
          if (cancelled) return
          setCurrentUser(u)
          await loadManagers()
        } catch (e) {
          console.error(e)
        } finally {
          if (!cancelled) {
            bootstrapDone.current = true
            setLoading(false)
          }
        }
      }
      try {
        await loadSales()
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadManagers, loadSales])

  useEffect(() => {
    if (!dialog) {
      setDialogVisible(false)
      return
    }
    const id = requestAnimationFrame(() => setDialogVisible(true))
    return () => cancelAnimationFrame(id)
  }, [dialog])

  const closeDialog = () => {
    setDialogVisible(false)
    window.setTimeout(() => {
      setDialog(null)
      setTakeForm({ fullName: '', phone: '', position: '', notes: '' })
      setDeclineReason('')
      setOrderForm({ brief: '' })
      setOrderFiles([])
      setDialogBusy(false)
    }, 280)
  }

  const byStage = useMemo(() => {
    const map = new Map<ProjectSaleStage, ProjectSaleRow[]>()
    for (const s of STAGES) map.set(s.id, [])
    for (const row of items) {
      const list = map.get(row.stage)
      if (list) list.push(row)
    }
    return map
  }, [items])

  const openModal = () => {
    setBatchRows(Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' })))
    setModalOpen(true)
  }

  const addBatchRows = () => {
    setBatchRows((rows) => [...rows, ...Array.from({ length: 5 }, () => ({ brandName: '', managerId: '' }))])
  }

  const updateBatchRow = (index: number, patch: Partial<RowDraft>) => {
    setBatchRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
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
      const res = await api.post('/project-sales/batch', { items: payload })
      const created = res.data as ProjectSaleRow[]
      setItems((prev) => [...created, ...prev])
      setModalOpen(false)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка при сохранении'
      alert(msg)
    } finally {
      setBatchSaving(false)
    }
  }

  const mergeRow = (updated: ProjectSaleRow) => {
    setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)))
  }

  const onDragStartCard = (e: React.DragEvent, row: ProjectSaleRow) => {
    if (!canActOnSale(row, currentUser)) {
      e.preventDefault()
      return
    }
    setDragId(row.id)
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
    if (!canActOnSale(prev, currentUser)) {
      setDragId(null)
      alert('Недостаточно прав для перемещения этой карточки')
      return
    }
    try {
      const res = await api.patch(`/project-sales/${dragId}/stage`, { stage })
      const updated = res.data as ProjectSaleRow
      mergeRow(updated)
    } catch (err: unknown) {
      console.error(err)
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      alert(msg || 'Не удалось переместить карточку')
    } finally {
      setDragId(null)
    }
  }

  const submitTakeWork = async () => {
    if (!dialog || dialog.kind !== 'takeWork') return
    setDialogBusy(true)
    try {
      const res = await api.post(`/project-sales/${dialog.row.id}/take-in-work`, {
        fullName: takeForm.fullName.trim(),
        phone: takeForm.phone.trim(),
        position: takeForm.position.trim(),
        notes: takeForm.notes.trim(),
      })
      mergeRow(res.data as ProjectSaleRow)
      closeDialog()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка при сохранении'
      alert(msg)
    } finally {
      setDialogBusy(false)
    }
  }

  const submitInterested = async (row: ProjectSaleRow) => {
    try {
      const res = await api.post(`/project-sales/${row.id}/interested`)
      mergeRow(res.data as ProjectSaleRow)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка'
      alert(msg)
    }
  }

  const submitDecline = async () => {
    if (!dialog || dialog.kind !== 'decline') return
    setDialogBusy(true)
    try {
      const res = await api.post(`/project-sales/${dialog.row.id}/not-our-client`, {
        reason: declineReason.trim(),
      })
      mergeRow(res.data as ProjectSaleRow)
      closeDialog()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка при сохранении'
      alert(msg)
    } finally {
      setDialogBusy(false)
    }
  }

  const submitOrderPlacement = async () => {
    if (!dialog || dialog.kind !== 'order') return
    setDialogBusy(true)
    try {
      const fd = new FormData()
      fd.append('orderKind', dialog.orderKind)
      fd.append('brief', orderForm.brief.trim())
      for (const f of orderFiles) {
        fd.append('files', f)
      }
      const res = await api.post(`/project-sales/${dialog.row.id}/order-placement`, fd)
      mergeRow(res.data as ProjectSaleRow)
      closeDialog()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Ошибка при сохранении'
      alert(msg)
    } finally {
      setDialogBusy(false)
    }
  }

  const brandTitle = (row: ProjectSaleRow) => row.client.company?.trim() || row.client.name

  const downloadProjectFile = async (fileId: string, originalName: string) => {
    try {
      const res = await api.get(`/files/${fileId}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = originalName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Не удалось скачать файл')
    }
  }

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
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">{col.label}</h3>
                    <span className="text-xs text-gray-700 bg-white/80 border border-gray-200 px-2 py-1 rounded-lg shrink-0">
                      {columnItems.length}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-3 max-h-[650px] overflow-y-auto">
                  {columnItems.map((row) => {
                    const indicator = getStageIndicator(row.stage)
                    const canAct = canActOnSale(row, currentUser)
                    const draggable = canAct
                    return (
                      <div
                        key={row.id}
                        draggable={draggable}
                        onDragStart={(e) => onDragStartCard(e, row)}
                        onDragEnd={onDragEndCard}
                        className={`rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 ${indicator.border} ${indicator.bg} relative ${
                          dragId === row.id ? 'opacity-50' : ''
                        } ${draggable ? 'cursor-move' : 'cursor-default'}`}
                      >
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <h4 className="font-medium text-gray-900 text-sm leading-snug pr-1">{brandTitle(row)}</h4>
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        </div>
                        <p className="text-xs text-gray-500">
                          {row.manager.firstName} {row.manager.lastName}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{formatCardDate(row.createdAt)}</p>

                        {row.stage === 'NEW_BRANDS' && canAct && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDialog({ kind: 'takeWork', row })
                              }}
                              className="w-full rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-primary-700"
                            >
                              Взять в работу
                            </button>
                          </div>
                        )}

                        {row.stage === 'IN_PROGRESS' && canAct && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void submitInterested(row)
                                }}
                                className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-800 transition-colors"
                              >
                                Заинтересован
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDialog({ kind: 'decline', row })
                                }}
                                className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-800 transition-colors"
                              >
                                Не наш клиент
                              </button>
                            </div>
                          </div>
                        )}

                        {row.stage === 'INTERESTED' && canAct && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDialog({ kind: 'order', row, orderKind: 'SAMPLES' })
                                }}
                                className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-800 transition-colors"
                              >
                                Образцы
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDialog({ kind: 'order', row, orderKind: 'ORDER' })
                                }}
                                className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold text-gray-800 transition-colors"
                              >
                                Заказ
                              </button>
                            </div>
                          </div>
                        )}

                        {row.stage === 'NOT_OUR_CLIENT' && row.rejectionReason && (
                          <p className="mt-2 text-[11px] leading-snug text-rose-700 bg-rose-50/80 rounded-lg px-2 py-1.5 border border-rose-100">
                            {row.rejectionReason}
                          </p>
                        )}

                        {row.stage === 'ORDER_PLACED' && row.orderBrief && (
                          <p className="mt-2 text-[11px] text-gray-600 line-clamp-3">{row.orderBrief}</p>
                        )}

                        {row.stage === 'ORDER_PLACED' && row.files && row.files.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {row.files.map((f) => (
                              <li key={f.id}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void downloadProjectFile(f.id, f.originalName)
                                  }}
                                  className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 truncate"
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{f.originalName}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/clients/${row.client.id}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800"
                          >
                            Карточка клиента
                            <ExternalLink className="h-3 w-3" />
                          </button>
                          {!canAct && (
                            <span className="text-[10px] text-gray-400 text-right">Только просмотр</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {dialog?.kind === 'takeWork' && (
        <FunnelModalShell
          title="Взять в работу"
          visible={dialogVisible}
          onClose={() => !dialogBusy && closeDialog()}
        >
          <div className="space-y-4 bg-gray-50/60 px-5 py-5">
            <p className="text-sm text-gray-600">
              Контактные данные попадут в карточку клиента; бренд перейдёт в колонку «Бренды в работе».
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                ФИО <span className="text-primary-500">*</span>
              </label>
              <input
                value={takeForm.fullName}
                onChange={(e) => setTakeForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                Номер телефона <span className="text-primary-500">*</span>
              </label>
              <input
                value={takeForm.phone}
                onChange={(e) => setTakeForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="+7 …"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">Должность</label>
              <input
                value={takeForm.position}
                onChange={(e) => setTakeForm((f) => ({ ...f, position: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Коммерческий директор"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">Заметки</label>
              <textarea
                value={takeForm.notes}
                onChange={(e) => setTakeForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Краткий контекст, договорённости…"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200/80 pt-4">
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => closeDialog()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => void submitTakeWork()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </FunnelModalShell>
      )}

      {dialog?.kind === 'decline' && (
        <FunnelModalShell
          title="Не наш клиент"
          visible={dialogVisible}
          onClose={() => !dialogBusy && closeDialog()}
        >
          <div className="space-y-4 bg-gray-50/60 px-5 py-5">
            <p className="text-sm text-gray-600">Укажите причину — она сохранится в карточке воронки и в заметках клиента.</p>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                Причина <span className="text-primary-500">*</span>
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Кратко опишите причину отказа"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200/80 pt-4">
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => closeDialog()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={dialogBusy || !declineReason.trim()}
                onClick={() => void submitDecline()}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Перенести
              </button>
            </div>
          </div>
        </FunnelModalShell>
      )}

      {dialog?.kind === 'order' && (
        <FunnelModalShell
          title={dialog.orderKind === 'SAMPLES' ? 'Образцы — ТЗ и макеты' : 'Заказ — ТЗ и макеты'}
          visible={dialogVisible}
          onClose={() => !dialogBusy && closeDialog()}
        >
          <div className="space-y-4 bg-gray-50/60 px-5 py-5">
            <p className="text-sm text-gray-600">
              После сохранения карточка перейдёт в «Оформили заказ/Образец». Текст ТЗ и вложения будут доступны здесь; краткое резюме попадёт в заметки клиента.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                Техническое задание <span className="text-primary-500">*</span>
              </label>
              <textarea
                value={orderForm.brief}
                onChange={(e) => setOrderForm({ brief: e.target.value })}
                rows={5}
                className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[120px]"
                placeholder="Опишите требования текстом…"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">Макеты (файлы)</label>
              <input
                type="file"
                multiple
                onChange={(e) => setOrderFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              />
              {orderFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {orderFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="truncate">
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200/80 pt-4">
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => closeDialog()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={dialogBusy || !orderForm.brief.trim()}
                onClick={() => void submitOrderPlacement()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </FunnelModalShell>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-3 py-6 backdrop-blur-sm">
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
