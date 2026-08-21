'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import { getCurrentMonthInput, formatPeriodLabel } from '@/lib/sales-report'
import {
  ClipboardList,
  Plus,
  UserRound,
  X,
  Clock,
  AlertCircle,
  CheckCircle2,
  Ban,
  Settings2,
  Trash2,
  ExternalLink,
  BarChart3,
} from 'lucide-react'

interface ManagerUser {
  id: string
  firstName: string
  lastName: string
}

interface MassTemplate {
  id: string
  title: string
  description: string | null
  priority: number
  systemKey: string
  weekdays: number
  isActive: boolean
  linkPath: string | null
  managerIds: string[]
}

interface WorkTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  dueDate: string | null
  systemKey: string | null
  massTemplateId: string | null
  massTemplate?: { linkPath: string | null } | null
  creator: { firstName: string; lastName: string }
  assignee: { firstName: string; lastName: string } | null
}

interface ManagerStats {
  managerId: string
  firstName: string
  lastName: string
  completed: number
  cancelled: number
  total: number
}

const COLUMNS = [
  { key: 'PENDING', label: 'Новые задачи', icon: Clock },
  { key: 'IN_PROGRESS', label: 'Задачи в работе', icon: AlertCircle },
  { key: 'COMPLETED', label: 'Завершенные задачи', icon: CheckCircle2 },
  { key: 'CANCELLED', label: 'Задача отклонена', icon: Ban },
] as const

const WEEKDAYS = [
  { bit: 1, label: 'Пн' },
  { bit: 2, label: 'Вт' },
  { bit: 4, label: 'Ср' },
  { bit: 8, label: 'Чт' },
  { bit: 16, label: 'Пт' },
  { bit: 32, label: 'Сб' },
  { bit: 64, label: 'Вс' },
]

const priorityLabels = ['Низкая', 'Средняя', 'Высокая']
const priorityColors = [
  'bg-gray-100 text-gray-800 border-gray-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-red-100 text-red-800 border-red-200',
]

const statusCardStyles: Record<string, { border: string; bg: string }> = {
  PENDING: { border: 'border-l-blue-400', bg: 'bg-blue-50/50' },
  IN_PROGRESS: { border: 'border-l-yellow-400', bg: 'bg-yellow-50/50' },
  COMPLETED: { border: 'border-l-green-500', bg: 'bg-green-50/50' },
  CANCELLED: { border: 'border-l-red-500', bg: 'bg-red-50/50' },
}

const emptyForm = {
  title: '',
  description: '',
  priority: '1',
  dueDate: '',
  assigneeId: '',
}

const emptyMassForm = {
  id: '',
  title: '',
  description: '',
  priority: '1',
  systemKey: '',
  weekdays: 31,
  isActive: true,
  linkPath: '',
  managerIds: [] as string[],
}

function isPrivileged(user: User | null) {
  return user?.role === 'ADMIN' || user?.role === 'EXECUTIVE'
}

function getTaskLink(task: WorkTask): string | null {
  if (task.massTemplate?.linkPath) return task.massTemplate.linkPath
  if (task.systemKey === 'daily_sales_report') return '/sales-report'
  return null
}

function getTaskTypeLabel(task: WorkTask): string {
  if (task.massTemplateId || task.systemKey) return 'Массовая'
  return 'Ручная'
}

export default function WorkTasksPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users, setUsers] = useState<ManagerUser[]>([])
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('')
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [statsPeriod, setStatsPeriod] = useState(getCurrentMonthInput())
  const [stats, setStats] = useState<ManagerStats[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const [massModalOpen, setMassModalOpen] = useState(false)
  const [massTemplates, setMassTemplates] = useState<MassTemplate[]>([])
  const [massForm, setMassForm] = useState(emptyMassForm)
  const [massSaving, setMassSaving] = useState(false)

  const privileged = isPrivileged(currentUser)

  useEffect(() => {
    void auth.getCurrentUser().then((u) => {
      setCurrentUser(u)
      setSelectedAssigneeId(u?.id ?? '')
    })
  }, [])

  useEffect(() => {
    void api.get('/tasks/board-managers').then((res) => {
      const list: ManagerUser[] = res.data ?? []
      if (currentUser && !list.some((u) => u.id === currentUser.id)) {
        setUsers([
          ...list,
          { id: currentUser.id, firstName: currentUser.firstName, lastName: currentUser.lastName },
        ])
      } else {
        setUsers(list)
      }
    })
  }, [currentUser])

  const canEditBoard = Boolean(
    currentUser && (privileged || selectedAssigneeId === currentUser.id),
  )

  const loadTasks = useCallback(async () => {
    if (!selectedAssigneeId) return
    setLoading(true)
    try {
      const res = await api.get('/tasks', {
        params: { board: '1', assigneeId: selectedAssigneeId },
        headers: { 'X-Skip-Cache': 'true' },
      })
      setTasks(res.data ?? [])
    } catch (e) {
      console.error('Failed to load work tasks:', e)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [selectedAssigneeId])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await api.get('/tasks/stats', {
        params: { period: statsPeriod },
        headers: { 'X-Skip-Cache': 'true' },
      })
      setStats(res.data?.managers ?? [])
    } catch (e) {
      console.error('Failed to load task stats:', e)
      setStats([])
    } finally {
      setStatsLoading(false)
    }
  }, [statsPeriod])

  useEffect(() => {
    if (selectedAssigneeId) void loadTasks()
  }, [loadTasks, selectedAssigneeId])

  useEffect(() => {
    if (currentUser) void loadStats()
  }, [loadStats, currentUser])

  const groupedTasks = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        if (!acc[task.status]) acc[task.status] = []
        acc[task.status].push(task)
        return acc
      },
      {} as Record<string, WorkTask[]>,
    )
  }, [tasks])

  const selectedUserLabel = useMemo(() => {
    if (!selectedAssigneeId) return ''
    if (selectedAssigneeId === currentUser?.id) return 'Мои задачи'
    const u = users.find((x) => x.id === selectedAssigneeId)
    return u ? `${u.firstName} ${u.lastName}` : 'Задачи пользователя'
  }, [selectedAssigneeId, currentUser?.id, users])

  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: string) => {
      if (!canEditBoard) return
      setDraggedTask(taskId)
      e.dataTransfer.effectAllowed = 'move'
    },
    [canEditBoard],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, status: string) => {
      if (!canEditBoard) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverStatus(status)
    },
    [canEditBoard],
  )

  const handleDragLeave = useCallback(() => setDragOverStatus(null), [])

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    setDragOverStatus(null)
    if (!canEditBoard || !draggedTask) return

    const task = tasks.find((t) => t.id === draggedTask)
    if (!task || task.status === newStatus) {
      setDraggedTask(null)
      return
    }

    const previousStatus = task.status
    setTasks((prev) =>
      prev.map((t) => (t.id === draggedTask ? { ...t, status: newStatus } : t)),
    )
    setDraggedTask(null)

    try {
      await api.put(`/tasks/${draggedTask}`, { status: newStatus })
      await loadTasks()
      await loadStats()
    } catch (error) {
      console.error('Failed to update task status:', error)
      setTasks((prev) =>
        prev.map((t) => (t.id === draggedTask ? { ...t, status: previousStatus } : t)),
      )
      alert('Не удалось обновить статус задачи')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!privileged) return
    if (!confirm('Удалить задачу?')) return
    try {
      await api.delete(`/tasks/${taskId}`)
      await loadTasks()
      await loadStats()
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Не удалось удалить задачу')
    }
  }

  const openCreateModal = () => {
    setFormData({
      ...emptyForm,
      assigneeId: currentUser?.id ?? selectedAssigneeId,
    })
    setModalOpen(true)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      alert('Введите название задачи')
      return
    }
    setSaving(true)
    try {
      await api.post('/tasks', {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        priority: parseInt(formData.priority, 10) || 0,
        assigneeId: formData.assigneeId || currentUser?.id,
        dueDate: formData.dueDate || undefined,
      })
      setModalOpen(false)
      await loadTasks()
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Ошибка при создании задачи')
    } finally {
      setSaving(false)
    }
  }

  const openMassModal = async () => {
    setMassModalOpen(true)
    try {
      const res = await api.get('/mass-task-templates')
      setMassTemplates(res.data ?? [])
    } catch (e) {
      console.error('Failed to load mass templates:', e)
      setMassTemplates([])
    }
  }

  const editMassTemplate = (tpl: MassTemplate) => {
    setMassForm({
      id: tpl.id,
      title: tpl.title,
      description: tpl.description ?? '',
      priority: String(tpl.priority),
      systemKey: tpl.systemKey,
      weekdays: tpl.weekdays,
      isActive: tpl.isActive,
      linkPath: tpl.linkPath ?? '',
      managerIds: [...tpl.managerIds],
    })
  }

  const toggleMassWeekday = (bit: number) => {
    setMassForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays & bit ? prev.weekdays & ~bit : prev.weekdays | bit,
    }))
  }

  const toggleMassManager = (managerId: string) => {
    setMassForm((prev) => ({
      ...prev,
      managerIds: prev.managerIds.includes(managerId)
        ? prev.managerIds.filter((id) => id !== managerId)
        : [...prev.managerIds, managerId],
    }))
  }

  const saveMassTemplate = async () => {
    if (!massForm.title.trim() || !massForm.systemKey.trim()) {
      alert('Укажите название и системный ключ')
      return
    }
    if (massForm.managerIds.length === 0) {
      alert('Выберите хотя бы одного менеджера')
      return
    }
    setMassSaving(true)
    try {
      const payload = {
        title: massForm.title.trim(),
        description: massForm.description.trim() || null,
        priority: parseInt(massForm.priority, 10) || 1,
        systemKey: massForm.systemKey.trim(),
        weekdays: massForm.weekdays,
        isActive: massForm.isActive,
        linkPath: massForm.linkPath.trim() || null,
        managerIds: massForm.managerIds,
      }
      if (massForm.id) {
        await api.put(`/mass-task-templates/${massForm.id}`, payload)
      } else {
        await api.post('/mass-task-templates', payload)
      }
      const res = await api.get('/mass-task-templates')
      setMassTemplates(res.data ?? [])
      setMassForm(emptyMassForm)
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Не удалось сохранить шаблон')
    } finally {
      setMassSaving(false)
    }
  }

  const deleteMassTemplate = async (id: string) => {
    if (!confirm('Удалить шаблон массовой задачи?')) return
    try {
      await api.delete(`/mass-task-templates/${id}`)
      const res = await api.get('/mass-task-templates')
      setMassTemplates(res.data ?? [])
      if (massForm.id === id) setMassForm(emptyMassForm)
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } }
      alert(ax.response?.data?.error || 'Не удалось удалить шаблон')
    }
  }

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null
    return new Date(dueDate).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!currentUser && loading) {
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
      <div className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-primary-600 shrink-0" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Задачи</h1>
              <p className="text-gray-600 mt-1 text-sm">{selectedUserLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <UserRound className="h-4 w-4 text-gray-500 shrink-0" />
              <select
                value={selectedAssigneeId}
                onChange={(e) => setSelectedAssigneeId(e.target.value)}
                className="text-sm border-0 bg-transparent focus:ring-0 text-gray-800 min-w-[180px]"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                    {u.id === currentUser?.id ? ' (я)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {privileged && (
              <button
                type="button"
                onClick={() => void openMassModal()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
              >
                <Settings2 className="h-4 w-4" />
                Массовые задачи
              </button>
            )}
            {canEditBoard && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Добавить задачу
              </button>
            )}
          </div>
        </div>

        {!canEditBoard && !privileged && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            Вы смотрите задачи другого пользователя — перетаскивание недоступно.
          </p>
        )}

        {privileged && selectedAssigneeId !== currentUser?.id && (
          <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
            Режим администратора: можно перетаскивать и удалять задачи этого пользователя.
          </p>
        )}

        {/* Статистика */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900">Статистика задач</h2>
            </div>
            <input
              type="month"
              value={statsPeriod}
              onChange={(e) => setStatsPeriod(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            />
          </div>
          <div className="p-4">
            {statsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : stats.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Нет данных за период</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3 text-left">Менеджер</th>
                    <th className="py-2 px-2 text-right">Завершено</th>
                    <th className="py-2 px-2 text-right">Отклонено</th>
                    <th className="py-2 pl-2 text-right">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row) => (
                    <tr key={row.managerId} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 pr-3 font-medium text-gray-900">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-green-700">
                        {row.completed}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-red-600">
                        {row.cancelled}
                      </td>
                      <td className="py-2.5 pl-2 text-right tabular-nums font-semibold">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Период: {formatPeriodLabel(statsPeriod)}. Учитываются завершённые и отклонённые задачи по дате закрытия.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map(({ key: status, label, icon: Icon }) => {
              const columnTasks = groupedTasks[status] || []
              const cardStyle = statusCardStyles[status]
              return (
                <div
                  key={status}
                  className={`overflow-hidden rounded-3xl border transition-colors shadow-xl shadow-primary-900/5 ${
                    dragOverStatus === status
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 bg-white'
                  }`}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  <div className="border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-primary-600 shrink-0" />
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{label}</h3>
                      </div>
                      <span className="text-xs text-gray-700 bg-white/80 border border-gray-200 px-2 py-1 rounded-lg shrink-0">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3 max-h-[calc(100vh-22rem)] overflow-y-auto">
                    {columnTasks.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Нет задач</p>
                    ) : (
                      columnTasks.map((task) => {
                        const dueLabel = formatDueDate(task.dueDate)
                        const taskLink = getTaskLink(task)
                        const isOverdue =
                          task.dueDate &&
                          task.status !== 'COMPLETED' &&
                          task.status !== 'CANCELLED' &&
                          new Date(task.dueDate) < new Date()

                        return (
                          <div
                            key={task.id}
                            draggable={canEditBoard}
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            className={`rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 ${cardStyle.border} ${cardStyle.bg} ${canEditBoard ? 'cursor-move' : 'cursor-pointer'} ${
                              draggedTask === task.id ? 'opacity-50' : ''
                            }`}
                            onClick={() => router.push(`/tasks/${task.id}`)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 text-sm leading-snug">
                                {task.title}
                              </h4>
                              <div className="flex items-center gap-1 shrink-0">
                                {privileged && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleDeleteTask(task.id)
                                    }}
                                    className="p-1 rounded hover:bg-red-50 text-red-600"
                                    title="Удалить"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${priorityColors[task.priority] ?? priorityColors[0]}`}
                                >
                                  {priorityLabels[task.priority] ?? priorityLabels[0]}
                                </span>
                              </div>
                            </div>
                            {task.description && (
                              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                                {getTaskTypeLabel(task)}
                              </span>
                              <div className="flex items-center gap-2">
                                {taskLink && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      router.push(taskLink)
                                    }}
                                    className="text-[10px] text-primary-600 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Открыть
                                  </button>
                                )}
                                {dueLabel && (
                                  <span
                                    className={`text-[10px] shrink-0 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}
                                  >
                                    {dueLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Новая задача</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label>
                <select
                  value={formData.assigneeId}
                  onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Приоритет</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  >
                    <option value="0">Низкая</option>
                    <option value="1">Средняя</option>
                    <option value="2">Высокая</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Срок</label>
                  <input
                    type="datetime-local"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Создание...' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {massModalOpen && privileged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Массовые задачи</h2>
              <button type="button" onClick={() => setMassModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="space-y-2">
                {massTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 bg-gray-50/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{tpl.title}</p>
                      <p className="text-xs text-gray-500">
                        {tpl.isActive ? 'Активна' : 'Выключена'} · менеджеров: {tpl.managerIds.length}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => editMassTemplate(tpl)}
                        className="text-xs px-2 py-1 rounded-lg border border-gray-300 hover:bg-white"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMassTemplate(tpl.id)}
                        className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  {massForm.id ? 'Редактировать шаблон' : 'Новый шаблон'}
                </h3>
                <input
                  type="text"
                  placeholder="Название"
                  value={massForm.title}
                  onChange={(e) => setMassForm({ ...massForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <textarea
                  placeholder="Описание"
                  value={massForm.description}
                  onChange={(e) => setMassForm({ ...massForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Системный ключ (уникальный)"
                    value={massForm.systemKey}
                    onChange={(e) => setMassForm({ ...massForm, systemKey: e.target.value })}
                    disabled={Boolean(massForm.id)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Ссылка (например /sales-report)"
                    value={massForm.linkPath}
                    onChange={(e) => setMassForm({ ...massForm, linkPath: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Дни повторения</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(({ bit, label }) => (
                      <button
                        key={bit}
                        type="button"
                        onClick={() => toggleMassWeekday(bit)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                          massForm.weekdays & bit
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Менеджеры</p>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={massForm.managerIds.includes(u.id)}
                          onChange={() => toggleMassManager(u.id)}
                        />
                        {u.firstName} {u.lastName}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={massForm.isActive}
                    onChange={(e) => setMassForm({ ...massForm, isActive: e.target.checked })}
                  />
                  Шаблон активен
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={massSaving}
                    onClick={() => void saveMassTemplate()}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {massSaving ? 'Сохранение...' : 'Сохранить шаблон'}
                  </button>
                  {massForm.id && (
                    <button
                      type="button"
                      onClick={() => setMassForm(emptyMassForm)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      Новый шаблон
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
