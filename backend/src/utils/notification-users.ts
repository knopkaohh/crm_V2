import { prisma } from './prisma'

/** Технолог для этапа «Разработка макетов» (Никита Царьков) */
export async function getDesignTechnologistUserId(): Promise<string | null> {
  const email = process.env.DESIGN_TECHNOLOGIST_EMAIL?.trim()
  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true },
    })
    if (byEmail) return byEmail.id
  }

  const byName = await prisma.user.findFirst({
    where: {
      firstName: 'Никита',
      lastName: 'Царьков',
      isActive: true,
    },
    select: { id: true },
  })
  return byName?.id ?? null
}
