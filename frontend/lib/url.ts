/** База API: на клиенте всегда совпадает с origin страницы (HTTPS), без mixed content. */
export const getApiBaseUrl = (): string => {
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || '/api'

  if (typeof window !== 'undefined') {
    if (rawUrl.startsWith('/')) {
      return `${window.location.origin}${rawUrl}`
    }
    if (window.location.protocol === 'https:' && rawUrl.startsWith('http://')) {
      return `https://${rawUrl.slice('http://'.length)}`
    }
  }

  return rawUrl
}

export const getSocketBaseUrl = (): string | undefined => {
  const rawUrl = process.env.NEXT_PUBLIC_SOCKET_URL

  if (typeof window !== 'undefined' && !rawUrl) {
    return window.location.origin
  }

  if (!rawUrl) {
    return undefined
  }

  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:' && rawUrl.startsWith('http://')) {
      return `https://${rawUrl.slice('http://'.length)}`
    }
  }

  return rawUrl
}
