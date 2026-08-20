export const SALES_REPORT_CHANNELS = [
  'AVITO',
  'SITE',
  'REFERRAL_SOCIAL',
  'PROJECT_SALES',
  'CLIENT_BASE_NEW',
  'CLIENT_BASE_REGULAR',
  'CLIENT_BASE_LOST',
  'CLIENT_BASE_CROSS_SELL',
] as const

export type SalesReportChannelId = (typeof SALES_REPORT_CHANNELS)[number]

export const SALES_REPORT_CHANNEL_LABELS: Record<SalesReportChannelId, string> = {
  AVITO: 'Avito',
  SITE: 'Сайт',
  REFERRAL_SOCIAL: 'Сарафанное радио / соцсети',
  PROJECT_SALES: 'Проектные продажи',
  CLIENT_BASE_NEW: 'Новые клиенты',
  CLIENT_BASE_REGULAR: 'Постоянные клиенты',
  CLIENT_BASE_LOST: 'Потерянные клиенты',
  CLIENT_BASE_CROSS_SELL: 'Cross-sell',
}

export const SALES_REPORT_CHANNEL_GROUPS = [
  {
    title: 'Входящие заявки',
    channels: ['AVITO', 'SITE', 'REFERRAL_SOCIAL'] as SalesReportChannelId[],
  },
  {
    title: 'Исходящие заявки',
    channels: [
      'PROJECT_SALES',
      'CLIENT_BASE_NEW',
      'CLIENT_BASE_REGULAR',
      'CLIENT_BASE_LOST',
      'CLIENT_BASE_CROSS_SELL',
    ] as SalesReportChannelId[],
  },
]

export function conversionPercent(applications: number, orders: number): number {
  if (applications <= 0) return 0
  return Math.round((orders / applications) * 1000) / 10
}

export function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(n)
}

export function getCurrentMonthInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export function formatPeriodLabel(period: string) {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateRu(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function todayDateInput() {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function getPreviousBusinessDayDateInput(from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
