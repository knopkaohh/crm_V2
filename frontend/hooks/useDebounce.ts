import { useEffect, useState } from 'react';

/**
 * Hook для debounce значений (оптимизация поиска)
 * @param value - значение для debounce
 * @param delay - задержка в миллисекундах (по умолчанию 300ms)
 * @returns debounced значение
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Устанавливаем таймер для обновления debounced значения
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Очищаем таймер при размонтировании или изменении value/delay
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}


