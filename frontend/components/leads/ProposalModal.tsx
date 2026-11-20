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
  clientName: string
  companyName: string
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

const EXAMPLE = {
  clientName: 'Иванов Иван Иванович',
  companyName: 'ООО «Ромашка»',
  productLine: 'Упаковка Zip-Lock',
  subtitle: 'на изготовление и поставку Zip-Lock пакетов',
  intro:
    'Компания «Бирка Маркет» предлагает изготовление Zip-Lock пакетов двух размеров в соответствии с указанными ниже параметрами и объёмами заказа.',
  itemName: 'Zip-Lock пакет',
  itemDetail: '40 × 40 см',
  itemQuantity: '60000',
  itemPrice: '13,70',
  termsPrice: 'Указана в рублях согласно спецификации выше.',
  termsPayment: 'Согласовываются индивидуально при подтверждении заказа.',
  termsDelivery: 'Условия и стоимость доставки согласовываются отдельно.',
}

const emptyItem = (): ProposalItemForm => ({
  name: '',
  detail: '',
  quantity: '',
  unitPrice: '',
})

const blankForm = (source?: FunnelLead | null): ProposalForm => ({
  clientName: source?.client.name ?? '',
  companyName: source?.client.company ?? '',
  productLine: '',
  subtitle: '',
  intro: '',
  termsPrice: '',
  termsPayment: '',
  termsDelivery: '',
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
  const [form, setForm] = useState<ProposalForm>(() => blankForm(null))
  const [exampleOpen, setExampleOpen] = useState(true)
  const [moveToWaiting, setMoveToWaiting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedId(lead?.id ?? '')
    setMoveToWaiting(false)
    if (!lead?.id) setForm(blankForm(null))
  }, [open, lead?.id])

  useEffect(() => {
    if (!open || !selectedId) return
    let cancelled = false
    const source = leads.find((item) => item.id === selectedId) ?? (lead?.id === selectedId ? lead : null)
    setForm(blankForm(source))
    setLoadingSaved(true)
    api
      .get(`/leads/${selectedId}/proposal`)
      .then((response) => {
        if (cancelled) return
        const saved = response.data?.proposal
        if (!saved) return
        setForm({
          clientName: saved.clientName ?? source?.client.name ?? '',
          companyName: saved.companyName ?? source?.client.company ?? '',
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

  const applyExample = () => {
    setForm((prev) => ({
      ...prev,
      clientName: prev.clientName.trim() || EXAMPLE.clientName,
      companyName: prev.companyName.trim() || EXAMPLE.companyName,
      productLine: EXAMPLE.productLine,
      subtitle: EXAMPLE.subtitle,
      intro: EXAMPLE.intro,
      termsPrice: EXAMPLE.termsPrice,
      termsPayment: EXAMPLE.termsPayment,
      termsDelivery: EXAMPLE.termsDelivery,
      items: [
        {
          name: EXAMPLE.itemName,
          detail: EXAMPLE.itemDetail,
          quantity: EXAMPLE.itemQuantity,
          unitPrice: EXAMPLE.itemPrice,
        },
        {
          name: 'Zip-Lock пакет',
          detail: '55 × 40 см',
          quantity: '60000',
          unitPrice: '17,40',
        },
      ],
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
          <div className="rounded-xl border border-amber-200 bg-amber-50">
            <button
              type="button"
              onClick={() => setExampleOpen((openState) => !openState)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-amber-950"
            >
              Пример, что куда писать
              <span className="text-xs font-medium text-amber-800">{exampleOpen ? 'Скрыть' : 'Показать'}</span>
            </button>
            {exampleOpen ? (
              <div className="space-y-2 border-t border-amber-200 px-4 py-3 text-sm text-amber-950">
                <p><span className="font-semibold">1. ФИО:</span> {EXAMPLE.clientName}</p>
                <p><span className="font-semibold">1. Компания:</span> {EXAMPLE.companyName}</p>
                <p><span className="font-semibold">2. Линейка:</span> {EXAMPLE.productLine}</p>
                <p><span className="font-semibold">3. Подзаголовок:</span> {EXAMPLE.subtitle}</p>
                <p><span className="font-semibold">4. Абзац:</span> {EXAMPLE.intro}</p>
                <p>
                  <span className="font-semibold">5. Позиция:</span> {EXAMPLE.itemName}, {EXAMPLE.itemDetail}, {EXAMPLE.itemQuantity} шт., {EXAMPLE.itemPrice} ₽. Вторая позиция добавляется кнопкой «+».
                </p>
                <p><span className="font-semibold">6. Стоимость:</span> {EXAMPLE.termsPrice}</p>
                <p><span className="font-semibold">6. Оплата и сроки:</span> {EXAMPLE.termsPayment}</p>
                <p><span className="font-semibold">6. Доставка:</span> {EXAMPLE.termsDelivery}</p>
                <button
                  type="button"
                  onClick={applyExample}
                  className="mt-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300"
                >
                  Подставить пример в поля
                </button>
              </div>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Контакт в воронке</span>
            <select
              value={selectedId}
              disabled={Boolean(lead)}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            >
              <option value="">Выберите контакт</option>
              {leads.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.client.name}
                  {item.client.company ? ` · ${item.client.company}` : ''}
                  {item.client.phone ? ` · ${item.client.phone}` : ''}
                </option>
              ))}
            </select>
          </label>

          {loadingSaved ? <p className="text-sm text-gray-500">Подставляем прошлое предложение…</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">1. ФИО клиента</span>
              <input
                value={form.clientName}
                onChange={(event) => setForm((prev) => ({ ...prev, clientName: event.target.value }))}
                placeholder={EXAMPLE.clientName}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">1. Название компании</span>
              <input
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                placeholder={EXAMPLE.companyName}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">2. Линейка</span>
            <input
              value={form.productLine}
              onChange={(event) => setForm((prev) => ({ ...prev, productLine: event.target.value }))}
              placeholder={EXAMPLE.productLine}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">3. Подзаголовок</span>
            <input
              value={form.subtitle}
              onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
              placeholder={EXAMPLE.subtitle}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">4. Абзац</span>
            <textarea
              value={form.intro}
              onChange={(event) => setForm((prev) => ({ ...prev, intro: event.target.value }))}
              rows={3}
              placeholder={EXAMPLE.intro}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">5. Спецификация заказа</h4>
                <p className="text-xs text-gray-500">Сначала одна позиция. Каждое поле вписывается вручную.</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700"
              >
                <Plus className="h-4 w-4" />
                Позиция
              </button>
            </div>
            <div className="hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-12">
              <span className="sm:col-span-5">Наименование</span>
              <span className="sm:col-span-3">Размер</span>
              <span className="sm:col-span-2">Количество</span>
              <span className="sm:col-span-2">Цена за ед.</span>
            </div>
            {form.items.map((item, index) => {
              const quantity = Number(item.quantity)
              const lineSum = Number.isFinite(quantity) ? quantity * parseAmount(item.unitPrice) : 0
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-12">
                  <p className="text-xs font-semibold text-gray-500 sm:col-span-12">Позиция {index + 1}</p>
                  <input
                    value={item.name}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                    placeholder={EXAMPLE.itemName}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-5"
                  />
                  <input
                    value={item.detail}
                    onChange={(event) => updateItem(index, { detail: event.target.value })}
                    placeholder={EXAMPLE.itemDetail}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
                  />
                  <input
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    inputMode="numeric"
                    placeholder={EXAMPLE.itemQuantity}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <input
                    value={item.unitPrice}
                    onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                    inputMode="decimal"
                    placeholder={EXAMPLE.itemPrice}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <div className="flex items-center justify-between gap-2 sm:col-span-12">
                    <span className="text-xs font-medium text-gray-600">Сумма строки: {formatMoney(lineSum)}</span>
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
                </div>
              )
            })}
            <p className="text-right text-sm font-semibold text-gray-900">Итого: {formatMoney(total)}</p>
          </div>

          <div className="grid gap-3">
            <h4 className="text-sm font-semibold text-gray-900">6. Условия заказа</h4>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Стоимость</span>
              <input
                value={form.termsPrice}
                onChange={(event) => setForm((prev) => ({ ...prev, termsPrice: event.target.value }))}
                placeholder={EXAMPLE.termsPrice}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Оплата и сроки</span>
              <input
                value={form.termsPayment}
                onChange={(event) => setForm((prev) => ({ ...prev, termsPayment: event.target.value }))}
                placeholder={EXAMPLE.termsPayment}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Доставка</span>
              <input
                value={form.termsDelivery}
                onChange={(event) => setForm((prev) => ({ ...prev, termsDelivery: event.target.value }))}
                placeholder={EXAMPLE.termsDelivery}
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
