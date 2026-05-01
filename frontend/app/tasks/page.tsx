'use client'

import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Plus, Filter, CheckCircle, Clock, AlertCircle, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  dueDate: string | null
  creator: {
    firstName: string
    lastName: string
  }
  assignee: {
    firstName: string
    lastName: string
  } | null
}

const statusLabels: Record<string, string> = {
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнено',
  CANCELLED: 'Отменено',
}

const priorityLabels = ['Низкая', 'Средняя', 'Высокая']
const priorityColors = ['bg-gray-100 text-gray-800', 'bg-yellow-100 text-yellow-800', 'bg-red-100 text-red-800']

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  useEffect(() => {
    loadTasks()
  }, [statusFilter, priorityFilter])

  const loadTasks = async () => {
    try {
      const params: any = {}
      if (statusFilter) params.status = statusFilter
      if (priorityFilter) params.priority = priorityFilter

      const response = await api.get('/tasks', { params })
      setTasks(response.data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Не удалось удалить задачу'
      alert(msg)
    }
  }

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Не удалось обновить статус задачи')
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

  const todayTasks = tasks.filter(
    (task) =>
      task.dueDate &&
      new Date(task.dueDate).toDateString() === new Date().toDateString() &&
      task.status !== 'COMPLETED'
  )

  const overdueTasks = tasks.filter(
    (task) =>
      task.dueDate &&
      new Date(task.dueDate) < new Date() &&
      task.status !== 'COMPLETED'
  )

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Задачи</h1>
            <p className="text-gray-600 mt-1">Управление задачами</p>
          </div>
          <Link
            href="/tasks/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>Новая задача</span>
          </Link>
        </div>

        {/* Alerts */}
        {(todayTasks.length > 0 || overdueTasks.length > 0) && (
          <div className="space-y-2">
            {overdueTasks.length > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <span>Просрочено задач: {overdueTasks.length}</span>
              </div>
            )}
            {todayTasks.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <span>Задач на сегодня: {todayTasks.length}</span>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Все статусы</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Все приоритеты</option>
              <option value="2">Высокий</option>
              <option value="1">Средний</option>
              <option value="0">Низкий</option>
            </select>
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Задача
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Приоритет
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Исполнитель
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Срок
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map((task) => {
                  const isOverdue =
                    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'
                  const description = task.description ?? ''
                  return (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/tasks/${task.id}`} className="block">
                          <div className="text-sm font-medium text-gray-900">{task.title}</div>
                          {description && (
                            <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                              {description.includes('Клиент:') ? (
                                <>
                                  {description.split('Клиент:')[0]}
                                  <Link
                                    href={`/clients`}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      // Try to find client by name in description
                                      const clientName = description.split('Клиент:')[1]?.trim()
                                      if (clientName) {
                                        window.location.href = `/clients?search=${encodeURIComponent(clientName)}`
                                      }
                                    }}
                                    className="text-primary-600 hover:text-primary-800 font-medium"
                                  >
                                    {description.split('Клиент:')[1]}
                                  </Link>
                                </>
                              ) : (
                                description
                              )}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${priorityColors[task.priority]}`}
                        >
                          {priorityLabels[task.priority]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.assignee
                          ? `${task.assignee.firstName} ${task.assignee.lastName}`
                          : 'Не назначен'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {task.dueDate ? (
                          <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                            {new Date(task.dueDate).toLocaleDateString('ru-RU')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={task.status}
                          onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-4">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            Открыть
                          </Link>
                          <button
                            className="text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                            onClick={() => deleteTask(task.id)}
                            title="Удалить задачу"
                          >
                            <Trash2 className="h-4 w-4" />
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {tasks.length === 0 && (
              <div className="text-center py-12 text-gray-500">Нет задач</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
