import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ToastProvider'
import { NotificationListener } from '@/components/NotificationListener'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'CRM Birka Market',
  description: 'Система управления продажами и производством',
  applicationName: 'Birka CRM',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.svg', type: 'image/svg+xml', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Birka CRM',
    statusBarStyle: 'default',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <ToastProvider>
          <NotificationListener />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
