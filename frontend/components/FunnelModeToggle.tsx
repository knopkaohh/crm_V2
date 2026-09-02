'use client'

type FunnelMode = 'project' | 'brandVisit'

export function FunnelModeToggle({
  mode,
  onChange,
}: {
  mode: FunnelMode
  onChange: (mode: FunnelMode) => void
}) {
  const isBrand = mode === 'brandVisit'

  return (
    <div className="inline-flex items-center gap-2 select-none">
      <button
        type="button"
        onClick={() => onChange('project')}
        className={`text-xs transition-colors ${
          !isBrand ? 'font-medium text-gray-900' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Проектные продажи
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={isBrand}
        aria-label="Переключить воронку"
        onClick={() => onChange(isBrand ? 'project' : 'brandVisit')}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
          isBrand ? 'bg-primary-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            isBrand ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange('brandVisit')}
        className={`text-xs transition-colors ${
          isBrand ? 'font-medium text-gray-900' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        Бренды на выезд
      </button>
    </div>
  )
}

export type { FunnelMode }
