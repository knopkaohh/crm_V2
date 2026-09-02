/** Нормализация «Имя Фамилия» для сопоставления с белым списком менеджеров воронки */
export function normalizeManagerKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

/**
 * Белый список менеджеров воронки (порядок как в CRM).
 * emails — надёжное сопоставление (роль ADMIN/TECHNOLOGIST и т.д. не мешает).
 * keys — варианты «имя фамилия» / «фамилия имя» в БД.
 */
export const FUNNEL_MANAGER_SLOTS: {
  sortOrder: number;
  keys: string[];
  emails?: string[];
}[] = [
  {
    sortOrder: 0,
    keys: ['гинтарас палтарацкас', 'палтарацкас гинтарас'],
    emails: ['gintar+lera@mail.ru'],
  },
  {
    sortOrder: 1,
    keys: ['нариман алескеров', 'нариман аляскеров', 'алескеров нариман'],
    emails: ['aleskerov98@mail.ru'],
  },
  {
    sortOrder: 2,
    keys: ['максим шалагинов', 'шалагинов максим'],
  },
  {
    sortOrder: 3,
    keys: ['антон федотов', 'федотов антон'],
    emails: ['antonfedtube@gmail.com'],
  },
  {
    sortOrder: 4,
    keys: ['георгий мониава', 'мониава георгий'],
    emails: ['gmoniava15@gmail.com'],
  },
  {
    sortOrder: 5,
    keys: ['роман хрусталев', 'хрусталев роман'],
    emails: ['hrystalb@bk.ru'],
  },
  {
    sortOrder: 6,
    keys: ['никита царьков', 'царьков никита'],
    emails: ['hnikita@gmail.com'],
  },
  {
    sortOrder: 7,
    keys: ['михаил чирков', 'чирков михаил'],
  },
];

export function funnelManagerSortOrder(user: {
  firstName: string;
  lastName: string;
  email: string;
}): number | null {
  const nameKey = normalizeManagerKey(user.firstName, user.lastName);
  const emailLower = user.email.toLowerCase();
  for (const slot of FUNNEL_MANAGER_SLOTS) {
    if (slot.emails?.some((e) => e.toLowerCase() === emailLower)) {
      return slot.sortOrder;
    }
    if (slot.keys.includes(nameKey)) {
      return slot.sortOrder;
    }
  }
  return null;
}

export function sortFunnelManagers<
  T extends { firstName: string; lastName: string; email: string },
>(users: T[]): T[] {
  return users
    .map((u) => ({ u, order: funnelManagerSortOrder(u) }))
    .sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      const nameA = `${a.u.lastName} ${a.u.firstName}`.toLowerCase();
      const nameB = `${b.u.lastName} ${b.u.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB, 'ru');
    })
    .map((x) => x.u);
}
