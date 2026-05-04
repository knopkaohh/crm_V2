import axios from 'axios'
import api from './api'

function sanitizeFileName(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return t || 'file'
}

async function messageFromJsonBlob(blob: Blob): Promise<string | null> {
  try {
    const text = await blob.text()
    const j = JSON.parse(text) as { error?: string }
    return typeof j?.error === 'string' ? j.error : null
  } catch {
    return null
  }
}

/** Скачивание через API с Bearer-токеном (обычная ссылка в браузере токен не передаёт). */
export async function downloadProtectedFile(fileId: string, suggestedName: string): Promise<void> {
  try {
    const res = await api.get(`/files/${fileId}/download`, {
      responseType: 'blob',
      headers: { 'X-Skip-Cache': 'true' },
    })

    const blob = res.data as Blob
    const ct = String(res.headers['content-type'] || '').toLowerCase()
    if (ct.includes('application/json')) {
      const msg = (await messageFromJsonBlob(blob)) || 'Не удалось скачать файл'
      throw new Error(msg)
    }

    const url = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = sanitizeFileName(suggestedName)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
      const msg = await messageFromJsonBlob(e.response.data)
      if (msg) throw new Error(msg)
    }
    throw e
  }
}
