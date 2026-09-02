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
    <div className="flex items-center justify-center gap-3 sm:gap-4 select-none">
      <button
        type="button"
        onClick={() => onChange('project')}
        className={`text-sm sm:text-base transition-colors ${
          !isBrand ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'
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
        className={`relative h-9 w-16 shrink-0 rounded-full border transition-colors duration-300 ${
          isBrand ? 'border-primary-500 bg-primary-600' : 'border-gray-300 bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-300 ease-out ${
            isBrand ? 'translate-x-7' : 'translate-x-0'
          }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange('brandVisit')}
        className={`text-sm sm:text-base transition-colors ${
          isBrand ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Бренды на выезд
      </button>
    </div>
  )
}

export type { FunnelMode }
