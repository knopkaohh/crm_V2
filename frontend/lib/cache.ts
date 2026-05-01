/**
 * Простой клиентский кэш для API запросов
 */
interface CacheEntry {
  data: any;
  expires: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry>();
  
  /**
   * Получить данные из кэша
   */
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Проверяем, не истек ли срок действия
    if (item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  /**
   * Сохранить данные в кэш
   */
  set(key: string, data: any, ttl: number = 30000): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl,
    });
  }
  
  /**
   * Удалить данные из кэша
   */
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * Очистить весь кэш
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Очистить устаревшие записи
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of Array.from(this.cache.entries())) {
      if (item.expires < now) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Инвалидировать кэш по паттерну
   */
  invalidatePattern(pattern: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new DataCache();

// Очищаем устаревшие записи каждую минуту
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanup();
  }, 60000);
}

/**
 * Генерация ключа кэша из URL и параметров
 */
export function generateCacheKey(url: string, params?: any): string {
  const paramString = params ? JSON.stringify(params) : '';
  return `${url}?${paramString}`;
}


