/**
 * PDF счёта: на мобильных «Поделиться» из просмотра blob даёт blob:… и document.pdf.
 * Используем navigator.share({ files: [File] }) — тогда в Telegram/WhatsApp уходит нормальный файл и имя.
 */

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}

/** Вызовите из обработчика клика ДО любого await — только на мобильных открывает вкладку-плейсхолдер под просмотр PDF. */
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

function sanitizeInvoiceFileName(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
  const withPdf = t.toLowerCase().endsWith('.pdf') ? t : `${t || 'schet'}.pdf`
  return withPdf
}

function isShareDismissed(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') {
    return true
  }
  return false
}

/** После получения Blob: на телефоне сначала системное «Поделиться» с корректным именем файла; при отмене — просмотр PDF во вкладке. */
export async function showInvoicePdfFromBlob(
  blob: Blob,
  fileName: string,
  placeholderTab: Window | null,
): Promise<void> {
  const safeName = sanitizeInvoiceFileName(fileName)
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
  const file = new File([pdfBlob], safeName, { type: 'application/pdf', lastModified: Date.now() })

  let canShareFiles = false
  try {
    canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
  } catch {
    canShareFiles = false
  }

  if (isLikelyMobileDevice() && canShareFiles) {
    try {
      await navigator.share({
        files: [file],
        title: safeName.replace(/\.pdf$/i, ''),
      })
      try {
        placeholderTab?.close()
      } catch {
        /* ignore */
      }
      return
    } catch (err: unknown) {
      if (!isShareDismissed(err)) {
        console.warn('navigator.share:', err)
      }
      /* Отмена или ошибка — ниже открываем просмотр */
    }
  }

  const url = URL.createObjectURL(pdfBlob)

  if (placeholderTab && !placeholderTab.closed) {
    placeholderTab.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 180_000)
    return
  }

  const a = document.createElement('a')
  a.href = url
  a.download = safeName
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
