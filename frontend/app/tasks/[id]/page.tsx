'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { MessageSquare, User, Calendar, Flag, CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  creator: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  assignee: {
    id: string
    firstName: string
    lastName: string
    email: string
  } | null
  leadId: string | null
  orderId: string | null
  comments?: Comment[]
}

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    firstName: string
    lastName: string
  }
}

const statusLabels: Record<string, string> = {
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнено',
  CANCELLED: 'Отменено',
}

const priorityLabels = ['Низкая', 'Средняя', 'Высокая']
const priorityColors = ['bg-gray-100 text-gray-800', 'bg-yellow-100 text-yellow-800', 'bg-red-100 text-red-800']

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: '',
    priority: 0,
    assigneeId: '',
    dueDate: '',
  })
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])

  useEffect(() => {
    if (taskId) {
      loadTask()
      loadUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    if (task) {
      loadComments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task])

  const loadTask = async () => {
    try {
      const res = await api.get(`/tasks/${taskId}`)
      const taskData = res.data
      setTask(taskData)
      setEditForm({
        title: taskData.title,
        description: taskData.description || '',
        status: taskData.status,
        priority: taskData.priority,
        assigneeId: taskData.assignee?.id || '',
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString().split('T')[0] : '',
      })
      // Load comments if included in task data
      if (taskData.comments && taskData.comments.length > 0) {
        setComments(taskData.comments)
      }
    } catch (e) {
      console.error('Failed to load task:', e)
      alert('Не удалось загрузить задачу')
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    if (!task) return
    try {
      // Load comments from separate endpoint
      const res = await api.get(`/tasks/${taskId}/comments`).catch(() => ({ data: [] }))
      setComments(res.data || [])
    } catch (e) {
      console.error('Failed to load comments:', e)
      // If endpoint doesn't exist, comments will be empty
    }
  }

  const loadUsers = async () => {
    try {
      const res = await api.get('/users')
      setUsers(res.data || [])
    } catch (e) {
      console.error('Failed to load users:', e)
    }
  }

  const handleUpdate = async () => {
    if (!task) return
    setUpdating(true)
    try {
      const updateData: any = {
        title: editForm.title,
        description: editForm.description,
        status: editForm.status,
        priority: editForm.priority,
      }
      if (editForm.assigneeId) {
        updateData.assigneeId = editForm.assigneeId
      }
      if (editForm.dueDate) {
        updateData.dueDate = editForm.dueDate
      }
      const res = await api.put(`/tasks/${task.id}`, updateData)
      setTask(res.data)
      setEditing(false)
    } catch (e) {
      console.error('Failed to update task:', e)
      alert('Не удалось обновить задачу')
    } finally {
      setUpdating(false)
    }
  }

  const handleSubmitComment = async () => {
    if (!task || !newComment.trim()) return
    setSubmittingComment(true)
    try {
      const res = await api.post(`/tasks/${task.id}/comments`, { content: newComment })
      setComments([res.data, ...comments])
      setNewComment('')
    } catch (e) {
      console.error('Failed to submit comment:', e)
      alert('Не удалось добавить комментарий')
    } finally {
      setSubmittingComment(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'IN_PROGRESS':
        return <Clock className="h-5 w-5 text-blue-600" />
      case 'CANCELLED':
        return <XCircle className="h-5 w-5 text-gray-600" />
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
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

  if (!task) {
    return (
      <Layout>
        <div className="text-center text-gray-500">Задача не найдена</div>
      </Layout>
    )
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Задача</h1>
            <p className="text-gray-600 mt-1">Детальная информация о задаче</p>
          </div>
          <div className="flex gap-3">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Редактировать
              </button>
            )}
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Назад
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Task Details */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
              {editing ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название задачи</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Приоритет</label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value={0}>Низкая</option>
                        <option value={1}>Средняя</option>
                        <option value={2}>Высокая</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label>
                      <select
                        value={editForm.assigneeId}
                        onChange={(e) => setEditForm({ ...editForm, assigneeId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">Не назначен</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.firstName} {user.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Срок выполнения</label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleUpdate}
                      disabled={updating}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                      {updating ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false)
                        loadTask()
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
                      {task.description && (
                        <p className="text-gray-700 mt-2 whitespace-pre-wrap">{task.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {getStatusIcon(task.status)}
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${priorityColors[task.priority]}`}>
                        {priorityLabels[task.priority]}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Comments Section */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Комментарии</h3>
                <span className="text-sm text-gray-500">({comments.length})</span>
              </div>

              <div className="space-y-4 mb-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Напишите комментарий..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={submittingComment || !newComment.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {submittingComment ? 'Отправка...' : 'Отправить комментарий'}
                </button>
              </div>

              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Пока нет комментариев</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="border-b border-gray-200 pb-4 last:border-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {comment.user.firstName} {comment.user.lastName}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {new Date(comment.createdAt).toLocaleString('ru-RU')}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Информация</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Flag className="h-4 w-4" />
                    Статус
                  </div>
                  <p className="text-gray-900 font-medium">{statusLabels[task.status] || task.status}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <User className="h-4 w-4" />
                    Создатель
                  </div>
                  <p className="text-gray-900">
                    {task.creator.firstName} {task.creator.lastName}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <User className="h-4 w-4" />
                    Исполнитель
                  </div>
                  <p className="text-gray-900">
                    {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Не назначен'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Calendar className="h-4 w-4" />
                    Срок выполнения
                  </div>
                  {task.dueDate ? (
                    <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {new Date(task.dueDate).toLocaleDateString('ru-RU')}
                      {isOverdue && ' (просрочено)'}
                    </p>
                  ) : (
                    <p className="text-gray-500">Не установлен</p>
                  )}
                </div>
                {task.completedAt && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                      <CheckCircle className="h-4 w-4" />
                      Выполнено
                    </div>
                    <p className="text-gray-900">
                      {new Date(task.completedAt).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Calendar className="h-4 w-4" />
                    Создано
                  </div>
                  <p className="text-gray-900">{new Date(task.createdAt).toLocaleDateString('ru-RU')}</p>
                </div>
              </div>
            </div>

            {(task.leadId || task.orderId) && (
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Связанные объекты</h3>
                <div className="space-y-2">
                  {task.leadId && (
                    <Link
                      href={`/leads/${task.leadId}`}
                      className="block text-primary-600 hover:text-primary-800 underline"
                    >
                      Перейти к лиду
                    </Link>
                  )}
                  {task.orderId && (
                    <Link
                      href={`/orders/${task.orderId}`}
                      className="block text-primary-600 hover:text-primary-800 underline"
                    >
                      Перейти к заказу
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

