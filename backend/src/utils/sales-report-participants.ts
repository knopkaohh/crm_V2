/** Участники отчёта по продажам — фиксированный список (порядок в таблице). */
export const SALES_REPORT_PARTICIPANT_EMAILS = [
  'antonfedtube@gmail.com',
  'gm@birka-market.ru',
  'rh@birka-market.ru',
  'pg@birka-market.ru',
  'ms@birka-market.ru',
  'mch@birka-market.ru',
  'na@birka-market.ru',
] as const;

export const SALES_REPORT_CHANNELS = [
  'AVITO',
  'SITE',
  'REFERRAL_SOCIAL',
  'PROJECT_SALES',
  'CLIENT_BASE_NEW',
  'CLIENT_BASE_REGULAR',
  'CLIENT_BASE_LOST',
  'CLIENT_BASE_CROSS_SELL',
] as const;

export type SalesReportChannelId = (typeof SALES_REPORT_CHANNELS)[number];

export const SALES_REPORT_CHANNEL_LABELS: Record<SalesReportChannelId, string> = {
  AVITO: 'Avito',
  SITE: 'Сайт',
  REFERRAL_SOCIAL: 'Сарафанное радио / соцсети',
  PROJECT_SALES: 'Проектные продажи',
  CLIENT_BASE_NEW: 'База: новые клиенты',
  CLIENT_BASE_REGULAR: 'База: постоянные клиенты',
  CLIENT_BASE_LOST: 'База: потерянные клиенты',
  CLIENT_BASE_CROSS_SELL: 'База: cross-sell',
};

export function conversionPercent(applications: number, orders: number): number {
  if (applications <= 0) return 0;
  return Math.round((orders / applications) * 1000) / 10;
}

export function getPreviousBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** YYYY-MM-DD из date input или ISO-строки */
export function normalizeDateOnlyString(input: string): string | null {
  const trimmed = input.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (!iso) return null;
  const parts = iso[1].split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return iso[1];
}

/** Календарная дата для PostgreSQL DATE (UTC, без сдвига часового пояса) */
export function parseDateOnly(input: string): Date | null {
  const normalized = normalizeDateOnlyString(input);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Чтение DATE из БД в YYYY-MM-DD */
export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Календарный день в локальной зоне сервера (для «сегодня») */
export function formatCalendarDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function canEditReportDate(
  userRole: string | undefined,
  reportDate: Date,
  today = new Date(),
): boolean {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') return true;

  const targetStr = formatDateOnly(reportDate);
  const todayStr = formatCalendarDateLocal(today);
  const prevBizStr = formatCalendarDateLocal(getPreviousBusinessDay(today));

  return targetStr === todayStr || targetStr === prevBizStr;
}

export function parsePeriodMonth(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}
