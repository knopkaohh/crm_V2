import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ToastProvider'
import { NotificationListener } from '@/components/NotificationListener'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'CRM Birka Market',
  description: 'Система управления продажами и производством',
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
