'use client'

import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react'

export interface Toast {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

export function ToastComponent({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const duration = toast.duration || 5000
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onClose])

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertCircle,
  }

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  }

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    info: 'text-blue-600',
    warning: 'text-yellow-600',
  }

  const Icon = icons[toast.type] || Bell

  return (
    <div
      className={`${colors[toast.type]} border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px] animate-in slide-in-from-top-5 fade-in duration-300`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColors[toast.type]}`} />
        <div className="flex-1 min-w-0">
          {toast.title && (
            <h4 className="font-semibold text-sm mb-1">{toast.title}</h4>
          )}
          <p className="text-sm">{toast.message}</p>
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastComponent toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}






