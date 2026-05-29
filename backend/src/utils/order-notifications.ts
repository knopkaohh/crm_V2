/** Сумма в формате 24.500₽ (точка — разделитель тысяч) */
export function formatOrderAmountRub(amount: number): string {
  const rounded = Math.round(Number(amount) || 0)
  const withDots = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${withDots}₽`
}

export function formatNewOrderNotification(params: {
  creatorFirstName: string
  creatorLastName: string
  orderNumber: string
  totalAmount: number
}): { title: string; message: string } {
  const creatorName = [params.creatorFirstName, params.creatorLastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Менеджер'

  return {
    title: 'Новый заказ 💰',
    message: `${creatorName} оформил заказ ${params.orderNumber} на сумму ${formatOrderAmountRub(params.totalAmount)}!`,
  }
}

/** Push: отдельный тег и звук (файл public/sounds/new-order.mp3 на фронте) */
export const NEW_ORDER_PUSH_OPTIONS = {
  tagPrefix: 'new-order',
  sound: '/sounds/new-order.mp3',
  vibrate: [120, 60, 120, 60, 200] as number[],
}

export function formatDesignInDevelopmentNotification(params: {
  actorFirstName: string
  actorLastName: string
  orderNumber: string
}): { title: string; message: string } {
  const actorName = [params.actorFirstName, params.actorLastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Менеджер'

  return {
    title: 'Заказ в разработку макетов!',
    message: `${actorName} направил на разработку макетов заказ ${params.orderNumber}, нужно подготовить макет!`,
  }
}

export function formatOrderReadyNotification(params: {
  orderNumber: string
  brand: string
}): { title: string; message: string } {
  const brand = params.brand.trim() || '—'
  return {
    title: `Заказ ${params.orderNumber} ${brand} готов!`,
    message: 'Сообщите об этом клиенту!',
  }
}

export function orderEnteredDesignDevelopment(params: {
  prevStatus: string
  prevDesignStage: string | null
  nextStatus: string
  nextDesignStage: string | null
}): boolean {
  const nextStage = params.nextDesignStage ?? 'IN_DEVELOPMENT'
  if (params.nextStatus !== 'DESIGN_APPROVAL' || nextStage !== 'IN_DEVELOPMENT') {
    return false
  }
  const prevStage = params.prevDesignStage ?? 'IN_DEVELOPMENT'
  return (
    params.prevStatus !== 'DESIGN_APPROVAL' || prevStage !== 'IN_DEVELOPMENT'
  )
}
