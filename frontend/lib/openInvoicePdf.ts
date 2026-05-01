/**
 * PDF счёта на мобильных: атрибут download часто игнорируется.
 * Важно открыть вкладку синхронно с жестом пользователя (до await fetch).
 */

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}

/** Вызовите из обработчика клика ДО любого await, только на мобильных открывает вкладку-плейсхолдер. */
export function openInvoicePdfPlaceholderTab(): Window | null {
  if (!isLikelyMobileDevice()) return null
  const popup = window.open('about:blank', '_blank')
  if (!popup) return null
  try {
    popup.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/>' +
        '<title>Счёт PDF</title></head><body style="font-family:system-ui,sans-serif;padding:1rem">' +
        'Готовим счёт…</body></html>',
    )
    popup.document.close()
  } catch {
    /* ignore */
  }
  return popup
}

/** После получения Blob: либо в уже открытую вкладку, либо скачать / открыть через ссылку. */
export function showInvoicePdfFromBlob(blob: Blob, fileName: string, placeholderTab: Window | null): void {
  const url = URL.createObjectURL(blob)

  if (placeholderTab && !placeholderTab.closed) {
    placeholderTab.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 180_000)
    return
  }

  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()

  if (isLikelyMobileDevice() && !placeholderTab) {
    window.alert(
      'Не удалось открыть новую вкладку — возможно, заблокированы всплывающие окна. Разрешите их для сайта или сохраните счёт с компьютера.',
    )
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
