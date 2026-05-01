/**
 * PDF счёта на телефоне:
 * - Прямой переход на blob:… в адресной строке выглядит как «ссылка», не как документ.
 * - Открываем полноэкранный просмотр во вкладке about:blank + iframe с PDF.
 * - Кнопка «Поделиться PDF» вызывает navigator.share({ files }) — в мессенджеры уходит файл, не blob URL.
 */

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}

/** Вызовите из обработчика клика ДО любого await — только на мобильных открывает вкладку под просмотр. */
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Вкладка остаётся обычной страницей; PDF внутри iframe — не blob в адресной строке. */
function mountMobilePdfShell(win: Window, blobUrl: string, fileName: string): void {
  const shareTitle = fileName.replace(/\.pdf$/i, '')
  const doc = win.document
  doc.open()
  doc.write(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${escapeHtml(fileName)}</title>
<style>
  html,body{margin:0;height:100%;background:#1a1a1a;}
  #frame-wrap{position:fixed;top:0;left:0;right:0;bottom:calc(56px + env(safe-area-inset-bottom, 0px));}
  iframe{border:0;width:100%;height:100%;display:block;background:#525659;}
  #toolbar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;justify-content:center;align-items:center;gap:10px;padding:10px;padding-bottom:max(10px, env(safe-area-inset-bottom));background:rgba(0,0,0,.88);backdrop-filter:blur(10px);}
  #toolbar button{font:inherit;padding:12px 20px;border-radius:12px;border:0;background:#EDC147;color:#1a1a1a;font-weight:700;}
</style>
</head>
<body>
<div id="frame-wrap"><iframe id="pdf" title="${escapeHtml(fileName)}"></iframe></div>
<div id="toolbar"><button type="button" id="shareBtn">Поделиться PDF</button></div>
<script>
(function () {
  var blobUrl = ${JSON.stringify(blobUrl)};
  var fn = ${JSON.stringify(fileName)};
  var stitle = ${JSON.stringify(shareTitle)};
  var iframe = document.getElementById('pdf');
  if (iframe) iframe.src = blobUrl;
  var btn = document.getElementById('shareBtn');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    try {
      var res = await fetch(blobUrl);
      var blob = await res.blob();
      var pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      var file = new File([pdfBlob], fn, { type: 'application/pdf', lastModified: Date.now() });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: stitle });
      } else {
        alert('Отправка файла недоступна. Используйте «Поделиться страницей» в меню браузера или сохраните счёт с компьютера.');
      }
    } catch (e) {
      if (!e || e.name !== 'AbortError') alert('Не удалось открыть окно «Поделиться»');
    }
  });
})();
</script>
</body>
</html>`)
  doc.close()
}

function isShareDismissed(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') {
    return true
  }
  return false
}

export async function showInvoicePdfFromBlob(
  blob: Blob,
  fileName: string,
  placeholderTab: Window | null,
): Promise<void> {
  const safeName = sanitizeInvoiceFileName(fileName)
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })

  if (isLikelyMobileDevice() && placeholderTab && !placeholderTab.closed) {
    const url = URL.createObjectURL(pdfBlob)
    mountMobilePdfShell(placeholderTab, url, safeName)
    const revokeLater = () => window.setTimeout(() => URL.revokeObjectURL(url), 600_000)
    try {
      placeholderTab.addEventListener('pagehide', revokeLater)
    } catch {
      revokeLater()
    }
    return
  }

  const url = URL.createObjectURL(pdfBlob)
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
      URL.revokeObjectURL(url)
      return
    } catch (err: unknown) {
      if (!isShareDismissed(err)) {
        console.warn('navigator.share:', err)
      }
    }
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
      'Не удалось открыть вкладку со счётом. Разрешите всплывающие окна для сайта или откройте заказ с компьютера.',
    )
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}
