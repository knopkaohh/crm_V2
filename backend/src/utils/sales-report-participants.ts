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

export function parseDateOnly(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function formatDateOnly(d: Date): string {
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

  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const target = new Date(reportDate);
  target.setHours(0, 0, 0, 0);
  const prevBiz = getPreviousBusinessDay(t);

  return target.getTime() === t.getTime() || target.getTime() === prevBiz.getTime();
}

export function parsePeriodMonth(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
