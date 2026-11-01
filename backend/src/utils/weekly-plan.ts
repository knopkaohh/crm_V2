/**
 * Календарь недельного планировщика.
 * Неделя считается по московскому времени: понедельник–пятница.
 * После пятницы (с субботы) рабочей становится следующая неделя,
 * а закончившаяся остаётся в архиве вместе со всеми задачами и статусами.
 */

export const PLANNER_TIMEZONE = 'Europe/Moscow';

export const WEEK_DAYS = [
  { dayOfWeek: 1, label: 'Понедельник', short: 'Пн' },
  { dayOfWeek: 2, label: 'Вторник', short: 'Вт' },
  { dayOfWeek: 3, label: 'Среда', short: 'Ср' },
  { dayOfWeek: 4, label: 'Четверг', short: 'Чт' },
  { dayOfWeek: 5, label: 'Пятница', short: 'Пт' },
] as const;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export type WeekAccess = 'current' | 'archive' | 'upcoming';

export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function moscowYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function weekdayIndex(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Понедельник недели, в которую попадает календарный день YYYY-MM-DD. */
export function mondayOf(ymd: string): string {
  const day = weekdayIndex(ymd);
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysYmd(ymd, diff);
}

export function isMondayYmd(ymd: string): boolean {
  return isValidYmd(ymd) && weekdayIndex(ymd) === 1;
}

/**
 * Понедельник рабочей недели.
 * Пн–пт — неделя этого понедельника.
 * Сб–вс — уже следующая, пустая неделя; предыдущая уходит в архив.
 */
export function activeWeekStart(now: Date = new Date()): string {
  const today = moscowYmd(now);
  const monday = mondayOf(today);
  const friday = addDaysYmd(monday, 4);
  if (today > friday) return addDaysYmd(monday, 7);
  return monday;
}

export function weekAccess(weekStart: string, now: Date = new Date()): WeekAccess {
  const active = activeWeekStart(now);
  if (weekStart === active) return 'current';
  if (weekStart < active) return 'archive';
  return 'upcoming';
}

export function isPlannerAdmin(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE';
}

/** Править можно только открытую неделю: свои задачи или любые, если это руководитель. */
export function canEditWeeklyPlan(input: {
  role?: string | null;
  userId: string;
  managerId: string;
  access: WeekAccess;
}): boolean {
  if (input.access !== 'current') return false;
  if (isPlannerAdmin(input.role)) return true;
  return input.userId === input.managerId;
}

export function formatWeekRange(weekStart: string): string {
  const weekEnd = addDaysYmd(weekStart, 4);
  const [startYear, startMonth, startDay] = weekStart.split('-').map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split('-').map(Number);
  if (startMonth === endMonth && startYear === endYear) {
    return `${startDay}–${endDay} ${MONTHS[startMonth - 1]} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${MONTHS[startMonth - 1]} – ${endDay} ${MONTHS[endMonth - 1]} ${startYear}`;
  }
  return `${startDay} ${MONTHS[startMonth - 1]} ${startYear} – ${endDay} ${MONTHS[endMonth - 1]} ${endYear}`;
}

/** Текущая неделя и несколько предыдущих — чтобы архив листался даже без задач. */
export function recentWeekStarts(active: string, pastWeeks = 16): string[] {
  const weeks = [active];
  for (let i = 1; i <= pastWeeks; i += 1) {
    weeks.push(addDaysYmd(active, -7 * i));
  }
  return weeks;
}

export function parseWeekStartParam(raw: unknown, now: Date = new Date()): string | null {
  if (raw == null || raw === '') return activeWeekStart(now);
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!isMondayYmd(value)) return null;
  return value;
}
