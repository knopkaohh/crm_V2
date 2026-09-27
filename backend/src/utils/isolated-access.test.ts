import assert from 'assert';
import {
  andWhere,
  creatorExclusion,
  isIsolatedRole,
  managerExclusion,
  orderVisibleToRole,
} from './isolated-access';

const order = { managerId: 'mgr-1', creatorId: 'creator-1' };

assert.equal(isIsolatedRole('SALES_MANAGER'), false);
assert.equal(isIsolatedRole('ADMIN'), false);
assert.equal(isIsolatedRole('EXECUTIVE'), false);
assert.equal(isIsolatedRole('ISOLATED'), true);
assert.equal(isIsolatedRole(undefined), false);

assert.equal(managerExclusion([]), null);
assert.equal(creatorExclusion([]), null);
assert.deepEqual(managerExclusion(['iso-1']), { managerId: { notIn: ['iso-1'] } });

assert.deepEqual(andWhere({ status: 'NEW_ORDER' }, null), { status: 'NEW_ORDER' });
assert.deepEqual(andWhere({}, { managerId: 'a' }), { managerId: 'a' });
assert.deepEqual(andWhere({ status: 'NEW_ORDER' }, { managerId: { notIn: ['iso-1'] } }), {
  AND: [{ status: 'NEW_ORDER' }, { managerId: { notIn: ['iso-1'] } }],
});

assert.equal(
  orderVisibleToRole({
    role: 'SALES_MANAGER',
    userId: 'someone',
    ...order,
    isolatedManagerIds: [],
  }),
  true,
);
assert.equal(
  orderVisibleToRole({
    role: 'ADMIN',
    userId: 'admin',
    ...order,
    isolatedManagerIds: [],
  }),
  true,
);
assert.equal(
  orderVisibleToRole({
    role: 'TECHNOLOGIST',
    userId: 'tech',
    ...order,
    isolatedManagerIds: ['other'],
  }),
  true,
);
assert.equal(
  orderVisibleToRole({
    role: 'EXECUTIVE',
    userId: 'exec',
    ...order,
    isolatedManagerIds: ['mgr-1'],
  }),
  false,
);
assert.equal(
  orderVisibleToRole({
    role: 'ISOLATED',
    userId: 'mgr-1',
    ...order,
    isolatedManagerIds: [],
  }),
  true,
);
assert.equal(
  orderVisibleToRole({
    role: 'ISOLATED',
    userId: 'creator-1',
    ...order,
    isolatedManagerIds: [],
  }),
  true,
);
assert.equal(
  orderVisibleToRole({
    role: 'ISOLATED',
    userId: 'stranger',
    ...order,
    isolatedManagerIds: [],
  }),
  false,
);

console.log('isolated-access tests passed');
