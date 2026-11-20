'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import api from '@/lib/api'
import { showInvoicePdfFromBlob } from '@/lib/openInvoicePdf'
import type { FunnelLead } from '@/components/leads/LeadFunnel'

interface ProposalItemForm {
  name: string
  detail: string
  quantity: string
  unitPrice: string
}

interface ProposalForm {
  productLine: string
  subtitle: string
  intro: string
  termsPrice: string
  termsPayment: string
  termsDelivery: string
  closingTitle: string
  closingText: string
  items: ProposalItemForm[]
}

const emptyItem = (): ProposalItemForm => ({
  name: '',
  detail: '',
  quantity: '1',
  unitPrice: '',
})

const defaultForm = (): ProposalForm => ({
  productLine: '',
  subtitle: 'на изготовление и поставку продукции',
  intro:
    'Компания «Бирка Маркет» предлагает изготовление и поставку продукции в соответствии с указанными ниже параметрами и объёмами заказа.',
  termsPrice: 'Указана в рублях согласно спецификации выше.',
  termsPayment: 'Согласовываются индивидуально при подтверждении заказа.',
  termsDelivery: 'Условия и стоимость доставки согласовываются отдельно.',
  closingTitle: 'Будем рады сотрудничеству!',
  closingText: 'Готовы уточнить детали заказа и согласовать удобные условия поставки.',
  items: [emptyItem()],
})

const parseAmount = (value: string) => {
  const numeric = Number(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : 0
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(value)

interface ProposalModalProps {
  open: boolean
  leads: FunnelLead[]
  lead: FunnelLead | null
  onClose: () => void
  onCompleted: (leadId: string, movedToWaiting: boolean) => void
}

export default function ProposalModal({
  open,
  leads,
  lead,
  onClose,
  onCompleted,
}: ProposalModalProps) {
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<ProposalForm>(defaultForm)
  const [moveToWaiting, setMoveToWaiting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedId(lead?.id ?? '')
    setMoveToWaiting(false)
    if (!lead?.id) setForm(defaultForm())
  }, [open, lead?.id])

  useEffect(() => {
    if (!open || !selectedId) return
    let cancelled = false
    setForm(defaultForm())
    setLoadingSaved(true)
    api
      .get(`/leads/${selectedId}/proposal`)
      .then((response) => {
        if (cancelled) return
        const saved = response.data?.proposal
        if (!saved) return
        setForm({
          productLine: saved.productLine ?? '',
          subtitle: saved.subtitle ?? '',
          intro: saved.intro ?? '',
          termsPrice: saved.termsPrice ?? '',
          termsPayment: saved.termsPayment ?? '',
          termsDelivery: saved.termsDelivery ?? '',
          closingTitle: saved.closingTitle ?? '',
          closingText: saved.closingText ?? '',
          items:
            Array.isArray(saved.items) && saved.items.length > 0
              ? saved.items.map((item: ProposalItemForm & { quantity: number; unitPrice: number }) => ({
                  name: item.name ?? '',
                  detail: item.detail ?? '',
                  quantity: String(item.quantity ?? 1),
                  unitPrice: item.unitPrice === undefined || item.unitPrice === null ? '' : String(item.unitPrice),
                }))
              : [emptyItem()],
        })
      })
      .catch((error) => {
        console.error('Failed to load proposal:', error)
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedId])

  if (!open) return null

  const total = form.items.reduce((sum, item) => {
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity)) return sum
    return sum + quantity * parseAmount(item.unitPrice)
  }, 0)

  const updateItem = (index: number, patch: Partial<ProposalItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }))
  }

  const handleSubmit = async () => {
    if (!selectedId) {
      alert('Выберите контакт')
      return
    }
    setSaving(true)
    try {
      const response = await api.post(
        `/leads/${selectedId}/proposal`,
        {
          ...form,
          moveToWaiting,
          items: form.items.map((item) => ({
            name: item.name,
            detail: item.detail,
            quantity: Number(item.quantity),
            unitPrice: parseAmount(item.unitPrice),
          })),
        },
        { responseType: 'blob' },
      )
      const clientName = leads.find((item) => item.id === selectedId)?.client.name || lead?.client.name || 'клиент'
      const fileName = `КП ${form.productLine || 'Бирка Маркет'} — ${clientName}.pdf`
      await showInvoicePdfFromBlob(response.data, fileName, null)
      onCompleted(selectedId, moveToWaiting)
    } catch (error: any) {
      console.error('Failed to create proposal:', error)
      let message = 'Не удалось сформировать КП'
      const data = error?.response?.data
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text())
          if (parsed?.error) message = parsed.error
        } catch {
          /* ответ не JSON */
        }
      } else if (data?.error) {
        message = data.error
      }
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Сформировать КП</h3>
            <p className="text-xs text-gray-500">PDF собирается по бланку «Бирка Маркет», Word-шаблон не нужен.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Контакт</span>
            <select
              value={selectedId}
              disabled={Boolean(lead)}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"
            >
              <option value="">Выберите контакт</option>
              {leads.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.client.name}
                  {item.client.phone ? ` · ${item.client.phone}` : ''}
                </option>
              ))}
            </select>
          </label>

          {loadingSaved ? <p className="text-sm text-gray-500">Подставляем прошлое предложение…</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block font-medium text-gray-700">Линейка</span>
              <input
                value={form.productLine}
                onChange={(event) => setForm((prev) => ({ ...prev, productLine: event.target.value }))}
                placeholder="Например: Zip-Lock"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Подзаголовок</span>
              <input
                value={form.subtitle}
                onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Вводный текст</span>
            <textarea
              value={form.intro}
              onChange={(event) => setForm((prev) => ({ ...prev, intro: event.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Спецификация</h4>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-700"
              >
                <Plus className="h-4 w-4" />
                Позиция
              </button>
            </div>
            {form.items.map((item, index) => {
              const quantity = Number(item.quantity)
              const lineSum = Number.isFinite(quantity) ? quantity * parseAmount(item.unitPrice) : 0
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-12">
                  <input
                    value={item.name}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                    placeholder="Наименование"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-5"
                  />
                  <input
                    value={item.detail}
                    onChange={(event) => updateItem(index, { detail: event.target.value })}
                    placeholder="Размер, 40 × 40 см"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
                  />
                  <input
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    inputMode="numeric"
                    placeholder="Кол-во"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-1"
                  />
                  <input
                    value={item.unitPrice}
                    onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                    inputMode="decimal"
                    placeholder="Цена"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <div className="flex items-center justify-between gap-2 sm:col-span-1">
                    <span className="text-xs font-medium text-gray-700 sm:hidden">{formatMoney(lineSum)}</span>
                    <button
                      type="button"
                      disabled={form.items.length === 1}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))
                      }
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-30"
                    >
                      Удалить
                    </button>
                  </div>
                  <p className="hidden text-right text-xs font-medium text-gray-600 sm:col-span-12 sm:block">
                    Сумма строки: {formatMoney(lineSum)}
                  </p>
                </div>
              )
            })}
            <p className="text-right text-sm font-semibold text-gray-900">Итого: {formatMoney(total)}</p>
          </div>

          <div className="grid gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Стоимость</span>
              <input
                value={form.termsPrice}
                onChange={(event) => setForm((prev) => ({ ...prev, termsPrice: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Оплата и сроки</span>
              <input
                value={form.termsPayment}
                onChange={(event) => setForm((prev) => ({ ...prev, termsPayment: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Доставка</span>
              <input
                value={form.termsDelivery}
                onChange={(event) => setForm((prev) => ({ ...prev, termsDelivery: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={moveToWaiting}
              onChange={(event) => setMoveToWaiting(event.target.checked)}
              className="mt-1"
            />
            <span>После скачивания перевести контакт в «Ждём клиента»</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Скачать PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
