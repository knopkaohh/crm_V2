import { prisma } from './prisma';
import { isTaskExcludedEmail } from './task-exclusions';

export async function getTaskBoardManagers() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      assignedOrders: { some: {} },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return users.filter((u) => !isTaskExcludedEmail(u.email));
}
