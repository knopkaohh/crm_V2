'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { io, type Socket } from 'socket.io-client'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { auth, type User } from '@/lib/auth'
import { getSocketBaseUrl } from '@/lib/url'
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'

type WeekAccess = 'current' | 'archive' | 'upcoming'

interface PlannerManager {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
  canEdit: boolean
}

interface PlannerTask {
  id: string
  managerId: string
  dayOfWeek: number
  title: string
  completed: boolean
  completedAt: string | null
  createdById: string
  createdByName: string
  sortOrder: number
  createdAt: string
}

interface PlannerDay {
  dayOfWeek: number
  label: string
  short: string
  date: string
  isToday: boolean
}

interface PlannerBoard {
  weekStart: string
  weekEnd: string
  label: string
  access: WeekAccess
  today: string
  scope: 'own' | 'department'
  days: PlannerDay[]
  managers: PlannerManager[]
  tasks: PlannerTask[]
  summary: {
    total: number
    completed: number
    managersWithoutTasks: number
  }
}

interface WeekOption {
  weekStart: string
  label: string
  access: WeekAccess
  total: number
  completed: number
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-indigo-100 text-indigo-800',
  'bg-lime-100 text-lime-800',
]

function errorText(error: unknown, fallback: string) {
  const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg || fallback
}

function formatDay(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function summarize(tasks: PlannerTask[], managers: PlannerManager[]) {
  const withTasks = new Set(tasks.map((task) => task.managerId))
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
    managersWithoutTasks: managers.filter((manager) => !withTasks.has(manager.id)).length,
  }
}

function accessLabel(access: WeekAccess) {
  if (access === 'current') return 'Текущая неделя'
  if (access === 'archive') return 'Архив'
  return 'Неделя ещё не открыта'
}

export default function WeeklyPlannerPage() {
  const [me, setMe] = useState<User | null>(null)
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [board, setBoard] = useState<PlannerBoard | null>(null)
  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const weekRef = useRef<string | null>(null)
  const pending = useRef(0)
  const requestId = useRef(0)
  const inflight = useRef(new Map<string, Promise<boolean>>())
  const boardRef = useRef<PlannerBoard | null>(null)

  useEffect(() => {
    weekRef.current = weekStart
  }, [weekStart])

  useEffect(() => {
    boardRef.current = board
  }, [board])

  useEffect(() => {
    void auth.getCurrentUser().then(setMe)
    const fromUrl = new URLSearchParams(window.location.search).get('week')
    setWeekStart(fromUrl ?? '')
  }, [])

  const load = useCallback(async (week: string | null, mode: 'full' | 'silent') => {
    const id = ++requestId.current
    if (mode === 'full') setLoading(true)
    try {
      const params = week ? { weekStart: week } : undefined
      const headers = { 'X-Skip-Cache': '1' }
      const [boardRes, weeksRes] = await Promise.all([
        api.get('/weekly-plans', { params, headers }),
        api.get('/weekly-plans/weeks', { headers }),
      ])
      if (id !== requestId.current) return
      const nextBoard = boardRes.data as PlannerBoard
      if (week && weekRef.current && weekRef.current !== week && weekRef.current !== '') return
      setBoard(nextBoard)
      setWeeks(weeksRes.data?.weeks ?? [])
      setError(null)
      setEditingId((current) =>
        current && !nextBoard.tasks.some((task) => task.id === current) ? null : current,
      )
      if (!weekRef.current) {
        weekRef.current = nextBoard.weekStart
        setWeekStart(nextBoard.weekStart)
      }
    } catch (loadError) {
      if (id !== requestId.current) return
      setError(errorText(loadError, 'Не удалось загрузить планировщик'))
    } finally {
      if (id === requestId.current && mode === 'full') setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (weekStart === null) return
    if (boardRef.current && weekStart && boardRef.current.weekStart === weekStart) return
    void load(weekStart || null, 'full')
  }, [weekStart, load])

  useEffect(() => {
    if (!board?.weekStart) return
    const refresh = () => {
      if (pending.current > 0 || document.visibilityState === 'hidden') return
      void load(weekRef.current, 'silent')
    }
    const timer = window.setInterval(refresh, 20000)
    const onFocus = () => {
      if (pending.current > 0) return
      void load(weekRef.current, 'silent')
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', refresh)

    let socket: Socket | null = null
    try {
      socket = io(getSocketBaseUrl(), { transports: ['websocket', 'polling'] })
      socket.on('weekly-plan-update', (payload: { weekStart?: string }) => {
        if (pending.current > 0) return
        if (!payload?.weekStart || payload.weekStart !== weekRef.current) return
        void load(payload.weekStart, 'silent')
      })
    } catch {
      socket = null
    }

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', refresh)
      socket?.disconnect()
    }
  }, [board?.weekStart, load])

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      const dirtyDraft = Object.values(drafts).some((value) => value.trim())
      const task = boardRef.current?.tasks.find((item) => item.id === editingId)
      const dirtyEdit = Boolean(editingId && task && editValue.trim() !== task.title)
      if (dirtyDraft || dirtyEdit) event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [drafts, editingId, editValue])

  const replaceTask = (task: PlannerTask) => {
    setBoard((current) => {
      if (!current) return current
      const tasks = current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => (item.id === task.id ? task : item))
        : [...current.tasks, task]
      return { ...current, tasks, summary: summarize(tasks, current.managers) }
    })
  }

  const createTask = (managerId: string, dayOfWeek: number, title: string) => {
    const key = `${managerId}:${dayOfWeek}`
    const existing = inflight.current.get(key)
    if (existing) return existing
    const clean = title.trim()
    if (!clean || !boardRef.current || boardRef.current.access !== 'current') {
      return Promise.resolve(!clean)
    }
    const week = boardRef.current.weekStart
    const promise = (async () => {
      pending.current += 1
      try {
        const res = await api.post('/weekly-plans/tasks', {
          weekStart: week,
          managerId,
          dayOfWeek,
          title: clean,
        })
        if (weekRef.current === week) replaceTask(res.data as PlannerTask)
        setDrafts((current) => ({ ...current, [key]: '' }))
        setSavedAt(new Date())
        setError(null)
        return true
      } catch (createError) {
        setError(errorText(createError, 'Не удалось сохранить задачу'))
        return false
      } finally {
        pending.current -= 1
        inflight.current.delete(key)
      }
    })()
    inflight.current.set(key, promise)
    return promise
  }

  const savingEdit = useRef(false)

  const saveEdit = async () => {
    if (savingEdit.current) return true
    if (!editingId || !boardRef.current) return true
    const task = boardRef.current.tasks.find((item) => item.id === editingId)
    if (!task) {
      setEditingId(null)
      return true
    }
    const title = editValue.trim()
    if (!title) {
      setError('Текст задачи не может быть пустым')
      return false
    }
    if (title === task.title) {
      setEditingId(null)
      return true
    }
    savingEdit.current = true
    pending.current += 1
    try {
      const res = await api.patch(`/weekly-plans/tasks/${task.id}`, { title })
      replaceTask(res.data as PlannerTask)
      setEditingId(null)
      setSavedAt(new Date())
      setError(null)
      return true
    } catch (saveError) {
      setError(errorText(saveError, 'Не удалось сохранить задачу'))
      return false
    } finally {
      savingEdit.current = false
      pending.current -= 1
    }
  }

  const toggleTask = async (task: PlannerTask) => {
    const next = !task.completed
    setBoard((current) => {
      if (!current) return current
      const tasks = current.tasks.map((item) =>
        item.id === task.id ? { ...item, completed: next } : item,
      )
      return { ...current, tasks, summary: summarize(tasks, current.managers) }
    })
    pending.current += 1
    try {
      const res = await api.patch(`/weekly-plans/tasks/${task.id}`, { completed: next })
      replaceTask(res.data as PlannerTask)
      setSavedAt(new Date())
      setError(null)
    } catch (toggleError) {
      setError(errorText(toggleError, 'Не удалось обновить статус'))
      void load(weekRef.current, 'silent')
    } finally {
      pending.current -= 1
    }
  }

  const deleteTask = async (task: PlannerTask) => {
    if (!window.confirm('Удалить задачу из плана?')) return
    pending.current += 1
    try {
      await api.delete(`/weekly-plans/tasks/${task.id}`)
      setBoard((current) => {
        if (!current) return current
        const tasks = current.tasks.filter((item) => item.id !== task.id)
        return { ...current, tasks, summary: summarize(tasks, current.managers) }
      })
      setSavedAt(new Date())
      setError(null)
    } catch (deleteError) {
      setError(errorText(deleteError, 'Не удалось удалить задачу'))
    } finally {
      pending.current -= 1
    }
  }

  const flushDrafts = async () => {
    const entries = Object.entries(drafts).filter(([, value]) => value.trim())
    for (const [key, value] of entries) {
      const [managerId, dayRaw] = key.split(':')
      const ok = await createTask(managerId, Number(dayRaw), value)
      if (!ok) return false
    }
    const saved = await saveEdit()
    return saved
  }

  const changeWeek = async (next: string) => {
    if (!next || next === board?.weekStart) return
    const ok = await flushDrafts()
    if (!ok) return
    setDrafts({})
    setEditingId(null)
    const url = new URL(window.location.href)
    url.searchParams.set('week', next)
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    setWeekStart(next)
  }

  const weekIndex = weeks.findIndex((week) => week.weekStart === board?.weekStart)
  const newer = weekIndex > 0 ? weeks[weekIndex - 1] : null
  const older = weekIndex >= 0 && weekIndex < weeks.length - 1 ? weeks[weekIndex + 1] : null

  const progress = useMemo(() => {
    if (!board) return 0
    if (board.summary.total === 0) return 0
    return Math.round((board.summary.completed / board.summary.total) * 100)
  }, [board])

  if (loading && !board) {
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Link
              href="/work-tasks"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              <ArrowLeft className="h-4 w-4" />
              К задачам
            </Link>
            <div className="flex items-center gap-3">
              <CalendarRange className="h-8 w-8 text-primary-600 shrink-0" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Планировщик задач</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Планы отдела продаж на неделю. Время недель — московское.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => older && void changeWeek(older.weekStart)}
                disabled={!older}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm disabled:opacity-40"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <select
                value={board?.weekStart ?? ''}
                onChange={(event) => void changeWeek(event.target.value)}
                className="h-10 min-w-[240px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm"
              >
                {board && !weeks.some((week) => week.weekStart === board.weekStart) && (
                  <option value={board.weekStart}>{board.label}</option>
                )}
                {weeks.map((week) => (
                  <option key={week.weekStart} value={week.weekStart}>
                    {week.access === 'current' ? 'Текущая' : 'Архив'} · {week.label}
                    {week.total > 0 ? ` · ${week.completed}/${week.total}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => newer && void changeWeek(newer.weekStart)}
                disabled={!newer}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm disabled:opacity-40"
                aria-label="Следующая неделя"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {savedAt && <span>Сохранено в {formatTime(savedAt)}</span>}
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{error}</p>
            {!board && (
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState(null, '', '/work-tasks/planner')
                  setWeekStart('')
                }}
                className="mt-2 font-medium text-red-900 underline"
              >
                Открыть текущую неделю
              </button>
            )}
          </div>
        )}

        {board && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Задач на неделе" value={String(board.summary.total)} />
              <SummaryCard
                label="Выполнено"
                value={
                  board.summary.total === 0
                    ? '0'
                    : `${board.summary.completed} · ${progress}%`
                }
                tone="green"
              />
              <SummaryCard
                label="Осталось"
                value={String(board.summary.total - board.summary.completed)}
              />
              <SummaryCard
                label="Менеджеров без плана"
                value={String(board.summary.managersWithoutTasks)}
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      board.access === 'current'
                        ? 'bg-primary-100 text-primary-800'
                        : board.access === 'archive'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {accessLabel(board.access)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{board.label}</span>
                </div>
                <span className="text-sm text-gray-500">{progress}% выполнено</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${progress === 100 && board.summary.total > 0 ? 'bg-emerald-500' : 'bg-primary-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {board.access === 'archive'
                  ? 'Архив хранит задачи и отметки выполнения. Редактирование закрыто, ничего не удаляется.'
                  : board.access === 'upcoming'
                    ? 'Эта неделя откроется, когда закончится текущая. Сейчас её можно только посмотреть.'
                    : board.scope === 'own'
                      ? 'Показан только ваш план. Отмеченные задачи остаются в сетке.'
                      : board.managers.some((manager) => manager.canEdit && manager.id !== me?.id)
                        ? 'Можно смотреть и править планы всех менеджеров.'
                        : 'Чужие планы видны, изменять можно только свои задачи.'}
              </p>
            </div>

            {board.managers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
                В отделе продаж нет активных менеджеров для планировщика.
              </div>
            ) : (
              <>
                <div className="hidden xl:block overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="min-w-[1080px]">
                    <div className="grid grid-cols-[220px_repeat(5,minmax(160px,1fr))] border-b border-gray-200 bg-gray-50">
                      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Менеджер
                      </div>
                      {board.days.map((day) => {
                        const dayTasks = board.tasks.filter((task) => task.dayOfWeek === day.dayOfWeek)
                        const done = dayTasks.filter((task) => task.completed).length
                        return (
                          <div
                            key={day.dayOfWeek}
                            className={`border-l border-gray-100 px-3 py-3 ${day.isToday ? 'bg-primary-50' : ''}`}
                          >
                            <div className="text-sm font-semibold text-gray-900">{day.label}</div>
                            <div className="text-xs text-gray-500">
                              {formatDay(day.date)}
                              {dayTasks.length > 0 ? ` · ${done}/${dayTasks.length}` : ''}
                              {day.isToday ? ' · сегодня' : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {board.managers.map((manager, index) => (
                      <ManagerRow
                        key={manager.id}
                        manager={manager}
                        index={index}
                        board={board}
                        mine={manager.id === me?.id}
                        drafts={drafts}
                        editingId={editingId}
                        editValue={editValue}
                        onDraft={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))}
                        onCreate={(day, title) => createTask(manager.id, day, title)}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        onStartEdit={(task) => {
                          setEditingId(task.id)
                          setEditValue(task.title)
                        }}
                        onEditValue={setEditValue}
                        onSaveEdit={() => void saveEdit()}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4 xl:hidden">
                  {board.managers.map((manager, index) => (
                    <ManagerCard
                      key={manager.id}
                      manager={manager}
                      index={index}
                      board={board}
                      mine={manager.id === me?.id}
                      drafts={drafts}
                      editingId={editingId}
                      editValue={editValue}
                      onDraft={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))}
                      onCreate={(day, title) => createTask(manager.id, day, title)}
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      onStartEdit={(task) => {
                        setEditingId(task.id)
                        setEditValue(task.title)
                      }}
                      onEditValue={setEditValue}
                      onSaveEdit={() => void saveEdit()}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'green'
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'green' ? 'text-emerald-700' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}

interface CellProps {
  manager: PlannerManager
  index: number
  board: PlannerBoard
  mine: boolean
  drafts: Record<string, string>
  editingId: string | null
  editValue: string
  onDraft: (key: string, value: string) => void
  onCreate: (day: number, title: string) => Promise<boolean>
  onToggle: (task: PlannerTask) => void
  onDelete: (task: PlannerTask) => void
  onStartEdit: (task: PlannerTask) => void
  onEditValue: (value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}

function managerTasks(board: PlannerBoard, managerId: string) {
  return board.tasks.filter((task) => task.managerId === managerId)
}

function ManagerHeading({ manager, index, board, mine }: Pick<CellProps, 'manager' | 'index' | 'board' | 'mine'>) {
  const tasks = managerTasks(board, manager.id)
  const done = tasks.filter((task) => task.completed).length
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}
      >
        {initials(manager.firstName, manager.lastName)}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-gray-900">
          {manager.firstName} {manager.lastName}
          {mine ? <span className="ml-1 text-xs font-medium text-primary-700">вы</span> : null}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          {tasks.length === 0 ? (
            'Нет задач'
          ) : done === tasks.length ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {done}/{tasks.length} выполнено
            </>
          ) : (
            `${done}/${tasks.length} выполнено`
          )}
          {!manager.isActive ? ' · неактивен' : ''}
        </div>
      </div>
    </div>
  )
}

function ManagerRow(props: CellProps) {
  const { manager, board, mine } = props
  return (
    <div
      className={`grid grid-cols-[220px_repeat(5,minmax(160px,1fr))] border-b border-gray-100 last:border-b-0 ${
        mine ? 'bg-primary-50/40' : 'bg-white'
      }`}
    >
      <div className={`sticky left-0 z-10 border-r border-gray-100 p-4 ${mine ? 'bg-primary-50' : 'bg-white'}`}>
        <ManagerHeading {...props} />
      </div>
      {board.days.map((day) => (
        <DayCell key={day.dayOfWeek} day={day} {...props} manager={manager} />
      ))}
    </div>
  )
}

function ManagerCard(props: CellProps) {
  const { manager, board, mine } = props
  return (
    <section className={`rounded-2xl border bg-white shadow-sm ${mine ? 'border-primary-300' : 'border-gray-200'}`}>
      <div className="border-b border-gray-100 px-4 py-3">
        <ManagerHeading {...props} />
      </div>
      <div className="divide-y divide-gray-100">
        {board.days.map((day) => (
          <div key={day.dayOfWeek} className={day.isToday ? 'bg-primary-50/60' : ''}>
            <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {day.short} · {formatDay(day.date)}
              {day.isToday ? ' · сегодня' : ''}
            </div>
            <DayCell day={day} bordered={false} {...props} manager={manager} />
          </div>
        ))}
      </div>
    </section>
  )
}

function DayCell({
  day,
  manager,
  board,
  drafts,
  editingId,
  editValue,
  onDraft,
  onCreate,
  onToggle,
  onDelete,
  onStartEdit,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  bordered = true,
}: CellProps & { day: PlannerDay; bordered?: boolean }) {
  const skipSave = useRef(false)
  const tasks = board.tasks.filter(
    (task) => task.managerId === manager.id && task.dayOfWeek === day.dayOfWeek,
  )
  const key = `${manager.id}:${day.dayOfWeek}`
  const canEdit = manager.canEdit && board.access === 'current'
  const canAdd = canEdit && manager.isActive

  return (
    <div className={`min-h-[92px] p-2 ${bordered ? 'border-l border-gray-100' : ''} ${day.isToday && bordered ? 'bg-primary-50/50' : ''}`}>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <div key={task.id} className="group flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-white/80">
            <input
              type="checkbox"
              checked={task.completed}
              disabled={!canEdit}
              onChange={() => onToggle(task)}
              aria-label={task.completed ? 'Отметить невыполненной' : 'Отметить выполненной'}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600 disabled:opacity-60"
            />
            <div className="min-w-0 flex-1">
              {editingId === task.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(event) => onEditValue(event.target.value)}
                  onBlur={() => {
                    if (skipSave.current) {
                      skipSave.current = false
                      return
                    }
                    onSaveEdit()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onSaveEdit()
                    }
                    if (event.key === 'Escape') {
                      skipSave.current = true
                      onCancelEdit()
                    }
                  }}
                  className="w-full rounded-md border border-primary-300 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => canEdit && onStartEdit(task)}
                  title={`Создал: ${task.createdByName}`}
                  className={`w-full text-left text-sm leading-snug break-words ${
                    task.completed ? 'text-gray-400 line-through' : 'text-gray-800'
                  } ${canEdit ? 'cursor-text' : 'cursor-default'}`}
                >
                  {task.title}
                </button>
              )}
              {editingId !== task.id && task.createdById !== manager.id && (
                <div className="text-[11px] leading-tight text-gray-400">создал {task.createdByName}</div>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(task)}
                className="rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 xl:text-gray-300 xl:opacity-0 xl:group-hover:opacity-100"
                aria-label="Удалить задачу"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {canAdd ? (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            void onCreate(day.dayOfWeek, drafts[key] ?? '')
          }}
        >
          <input
            value={drafts[key] ?? ''}
            onChange={(event) => onDraft(key, event.target.value)}
            onBlur={() => {
              if ((drafts[key] ?? '').trim()) void onCreate(day.dayOfWeek, drafts[key] ?? '')
            }}
            placeholder="Новая задача"
            className="w-full rounded-lg border border-dashed border-gray-300 bg-white/70 px-2 py-1 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
          />
          <button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            aria-label="Добавить задачу"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>
      ) : tasks.length === 0 ? (
        <div className="px-1 py-2 text-xs text-gray-400">Нет задач</div>
      ) : null}
    </div>
  )
}
