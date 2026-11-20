'use client'

import { useState } from 'react'
import { FileText, Phone, ShoppingCart, UserX, X } from 'lucide-react'

export const FUNNEL_STAGES = [
  { id: 'NEW_LEAD', label: 'Новый лид', dot: 'bg-emerald-500' },
  { id: 'NO_CONTACT', label: 'Не удалось связаться', dot: 'bg-rose-500' },
  { id: 'IN_DIALOGUE', label: 'В диалоге', dot: 'bg-sky-500' },
  { id: 'PREPARING_KP', label: 'Готовим КП', dot: 'bg-amber-500' },
  { id: 'WAITING_CLIENT', label: 'Ждём клиента', dot: 'bg-violet-500' },
] as const

export type FunnelStageId = (typeof FUNNEL_STAGES)[number]['id']

export interface FunnelLead {
  id: string
  funnelStage?: string | null
  nextContactDate: string | null
  source?: string | null
  client: {
    id?: string
    name: string
    phone: string
    company?: string | null
  }
  manager: {
    firstName: string
    lastName: string
  } | null
}

interface LeadFunnelProps {
  leads: FunnelLead[]
  loading: boolean
  onStageChange: (leadId: string, stage: FunnelStageId) => void
  onCreateProposal: (lead: FunnelLead | null) => void
  onCreateOrder: (lead: FunnelLead) => void
  onCloseLead: (lead: FunnelLead) => void
  onDeleteLead: (lead: FunnelLead) => void
}

const formatWhen = (dateString: string | null) => {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function LeadFunnel({
  leads,
  loading,
  onStageChange,
  onCreateProposal,
  onCreateOrder,
  onCloseLead,
  onDeleteLead,
}: LeadFunnelProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const stageOf = (lead: FunnelLead): FunnelStageId => {
    const found = FUNNEL_STAGES.find((stage) => stage.id === lead.funnelStage)
    return found?.id ?? 'NEW_LEAD'
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="px-4 text-center sm:px-48">
          <h2 className="text-xl font-semibold text-gray-900">Воронка</h2>
          <p className="text-sm text-gray-500">
            Перетащите карточку в другой этап.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCreateProposal(null)}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 sm:absolute sm:right-0 sm:top-0 sm:mt-0"
        >
          <FileText className="h-4 w-4" />
          Сформировать КП
        </button>
      </div>

      {loading && leads.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex w-max min-w-full justify-center gap-3">
          {FUNNEL_STAGES.map((stage) => {
            const columnLeads = leads.filter((lead) => stageOf(lead) === stage.id)
            return (
              <div
                key={stage.id}
                className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-gray-50 ${
                  dragOverStage === stage.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200'
                }`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOverStage(stage.id)
                }}
                onDragLeave={() => setDragOverStage((current) => (current === stage.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOverStage(null)
                  if (!dragId) return
                  const lead = leads.find((item) => item.id === dragId)
                  if (!lead || stageOf(lead) === stage.id) return
                  onStageChange(dragId, stage.id)
                }}
              >
                <div className="flex items-center gap-2 px-3 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                  <h3 className="text-sm font-semibold text-gray-900">{stage.label}</h3>
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
                    {columnLeads.length}
                  </span>
                </div>
                <div className="flex min-h-40 flex-col gap-2 px-2 pb-3">
                  {columnLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400">
                      Пусто
                    </div>
                  ) : (
                    columnLeads.map((lead) => {
                      const when = formatWhen(lead.nextContactDate)
                      const overdue = lead.nextContactDate
                        ? new Date(lead.nextContactDate).getTime() < Date.now()
                        : false
                      return (
                        <article
                          key={lead.id}
                          draggable
                          onDragStart={() => setDragId(lead.id)}
                          onDragEnd={() => {
                            setDragId(null)
                            setDragOverStage(null)
                          }}
                          className="cursor-grab rounded-xl border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-semibold text-gray-900">{lead.client.name}</h4>
                              {lead.client.company?.trim() ? (
                                <p className="truncate text-xs font-medium text-gray-600">{lead.client.company}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => onDeleteLead(lead)}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Удалить"
                              title="Удалить"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="h-3.5 w-3.5" />
                            {lead.client.phone || '—'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {lead.source ? (
                              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700">
                                {lead.source}
                              </span>
                            ) : null}
                            {when ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                  overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {when}
                              </span>
                            ) : null}
                          </div>
                          {lead.manager ? (
                            <p className="mt-2 text-[11px] text-gray-400">
                              {lead.manager.firstName} {lead.manager.lastName}
                            </p>
                          ) : null}
                          <div className="mt-3 grid grid-cols-1 gap-1.5">
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => onCreateOrder(lead)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              Оформить заказ
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => onCloseLead(lead)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              Закрыть контакт
                            </button>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}
