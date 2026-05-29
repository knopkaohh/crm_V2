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
