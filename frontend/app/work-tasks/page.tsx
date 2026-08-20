'use client'

import Layout from '@/components/Layout'
import { ClipboardList, CheckCircle2, Clock } from 'lucide-react'

export default function WorkTasksPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Задачи</h1>
            <p className="text-gray-600 mt-1">
              Личные и командные задачи — скоро здесь появится полный функционал
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 shadow-sm text-center">
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            В следующих обновлениях: задачи для каждого менеджера, напоминания и дневная задача
            «Заполнить отчёт о заявках».
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Заполнить отчёт о заявках</p>
              <p className="text-xs text-gray-500 mt-1">Планируется как ежедневная задача</p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex gap-3 opacity-60">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Другие задачи</p>
              <p className="text-xs text-gray-500 mt-1">В разработке</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
