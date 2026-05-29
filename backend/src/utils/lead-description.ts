/** Извлекает цель контакта из описания лида */
export function extractContactPurpose(description: string | null | undefined): string {
  if (!description) return ''
  const match = description.match(
    /Цель контакта:\s*([\s\S]*?)(?:\s*Заметки:|$)/i
  )
  return match?.[1]?.trim() ?? ''
}
