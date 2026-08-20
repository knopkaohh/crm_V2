'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import {
  ClipboardList,
  Plus,
  UserRound,
  X,
  Clock,
  AlertCircle,
  CheckCircle2,
  Ban,
} from 'lucide-react'

interface ManagerUser {
  id: string
  firstName: string
  lastName: string
}

interface WorkTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  dueDate: string | null
  systemKey: string | null
  creator: { firstName: string; lastName: string }
  assignee: { firstName: string; lastName: string } | null
}

const COLUMNS = [
  { key: 'PENDING', label: 'Новые задачи', icon: Clock },
  { key: 'IN_PROGRESS', label: 'Задачи в работе', icon: AlertCircle },
  { key: 'COMPLETED', label: 'Завершенные задачи', icon: CheckCircle2 },
  { key: 'CANCELLED', label: 'Задача отклонена', icon: Ban },
] as const

const priorityLabels = ['Низкая', 'Средняя', 'Высокая']
const priorityColors = [
  'bg-gray-100 text-gray-800 border-gray-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-red-100 text-red-800 border-red-200',
]

const emptyForm = {
  title: '',
  description: '',
  priority: '1',
  dueDate: '',
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

  useEffect(() => {
    void auth.getCurrentUser().then((u) => {
      setCurrentUser(u)
      setSelectedAssigneeId(u?.id ?? '')
    })
    void api.get('/leads/managers').then((res) => setUsers(res.data ?? []))
  }, [])

  const canEditBoard = Boolean(currentUser && selectedAssigneeId === currentUser.id)

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

  useEffect(() => {
    if (selectedAssigneeId) void loadTasks()
  }, [loadTasks, selectedAssigneeId])

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

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null)
  }, [])

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
    } catch (error) {
      console.error('Failed to update task status:', error)
      setTasks((prev) =>
        prev.map((t) => (t.id === draggedTask ? { ...t, status: previousStatus } : t)),
      )
      alert('Не удалось обновить статус задачи')
    }
  }

  const openCreateModal = () => {
    setFormData(emptyForm)
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
        assigneeId: selectedAssigneeId,
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
            {canEditBoard && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Добавить задачу
              </button>
            )}
          </div>
        </div>

        {!canEditBoard && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            Вы смотрите задачи другого пользователя — перетаскивание и создание недоступны.
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map(({ key: status, label, icon: Icon }) => {
              const columnTasks = groupedTasks[status] || []
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
                  <div className="relative border-b border-gray-200 bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent px-4 py-3">
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
                  <div className="p-4 space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">
                    {columnTasks.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Нет задач</p>
                    ) : (
                      columnTasks.map((task) => {
                        const dueLabel = formatDueDate(task.dueDate)
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
                            className={`rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow bg-white border-l-4 ${
                              task.priority >= 2
                                ? 'border-l-red-500'
                                : task.priority === 1
                                  ? 'border-l-amber-500'
                                  : 'border-l-gray-300'
                            } ${canEditBoard ? 'cursor-move' : 'cursor-pointer'} ${
                              draggedTask === task.id ? 'opacity-50' : ''
                            }`}
                            onClick={() => router.push(`/tasks/${task.id}`)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 text-sm leading-snug">
                                {task.title}
                              </h4>
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${priorityColors[task.priority] ?? priorityColors[0]}`}
                              >
                                {priorityLabels[task.priority] ?? priorityLabels[0]}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-2">
                              {task.systemKey ? (
                                <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                                  Авто
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400">Ручная</span>
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
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="h-5 w-5" />
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  placeholder="Введите название задачи"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  placeholder="Дополнительная информация"
                />
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
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Создание...' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
