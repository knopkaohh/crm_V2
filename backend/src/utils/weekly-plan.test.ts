import assert from 'assert';
import {
  activeWeekStart,
  addDaysYmd,
  canEditWeeklyPlan,
  formatWeekRange,
  isMondayYmd,
  mondayOf,
  moscowYmd,
  weekAccess,
} from './weekly-plan';

// Воскресенье 1 ноября 2026, 12:00 по Москве.
const sunday = new Date('2026-11-01T09:00:00.000Z');
assert.equal(moscowYmd(sunday), '2026-11-01');
assert.equal(mondayOf('2026-11-01'), '2026-10-26');
assert.equal(activeWeekStart(sunday), '2026-11-02');
assert.equal(weekAccess('2026-10-26', sunday), 'archive');
assert.equal(weekAccess('2026-11-02', sunday), 'current');
assert.equal(weekAccess('2026-11-09', sunday), 'upcoming');

// Пятница 6 ноября 2026, 21:00 по Москве — неделя ещё открыта.
const fridayEvening = new Date('2026-11-06T18:00:00.000Z');
assert.equal(moscowYmd(fridayEvening), '2026-11-06');
assert.equal(activeWeekStart(fridayEvening), '2026-11-02');
assert.equal(weekAccess('2026-11-02', fridayEvening), 'current');

// Суббота 7 ноября 2026, 00:30 по Москве — открывается следующая пустая неделя.
const saturday = new Date('2026-11-06T21:30:00.000Z');
assert.equal(moscowYmd(saturday), '2026-11-07');
assert.equal(activeWeekStart(saturday), '2026-11-09');
assert.equal(weekAccess('2026-11-02', saturday), 'archive');
assert.equal(weekAccess('2026-11-09', saturday), 'current');

// Среда внутри недели.
const wednesday = new Date('2026-11-04T07:00:00.000Z');
assert.equal(activeWeekStart(wednesday), '2026-11-02');
assert.equal(addDaysYmd('2026-11-02', 4), '2026-11-06');
assert.equal(isMondayYmd('2026-11-02'), true);
assert.equal(isMondayYmd('2026-11-03'), false);
assert.equal(isMondayYmd('2026-02-31'), false);

assert.equal(formatWeekRange('2026-11-02'), '2–6 ноября 2026');
assert.equal(formatWeekRange('2026-11-30'), '30 ноября – 4 декабря 2026');

assert.equal(
  canEditWeeklyPlan({
    role: 'SALES_MANAGER',
    userId: 'mgr-1',
    managerId: 'mgr-1',
    access: 'current',
  }),
  true,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'SALES_MANAGER',
    userId: 'mgr-1',
    managerId: 'mgr-2',
    access: 'current',
  }),
  false,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'ISOLATED',
    userId: 'iso-1',
    managerId: 'mgr-1',
    access: 'current',
  }),
  false,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'ADMIN',
    userId: 'admin-1',
    managerId: 'mgr-2',
    access: 'current',
  }),
  true,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'EXECUTIVE',
    userId: 'exec-1',
    managerId: 'mgr-2',
    access: 'current',
  }),
  true,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'ADMIN',
    userId: 'admin-1',
    managerId: 'mgr-2',
    access: 'archive',
  }),
  false,
);
assert.equal(
  canEditWeeklyPlan({
    role: 'SALES_MANAGER',
    userId: 'mgr-1',
    managerId: 'mgr-1',
    access: 'upcoming',
  }),
  false,
);

console.log('weekly-plan.test.ts: ok');
