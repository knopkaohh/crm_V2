import axios, { AxiosRequestConfig } from 'axios'
import { apiCache, generateCacheKey } from './cache'
import { getApiBaseUrl } from './url'

const api = axios.create()

// baseURL на каждый запрос — после загрузки в браузере попадает на https://текущий-домен/api
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()

  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  
  // Проверяем кэш для GET запросов
  if (config.method === 'get' && !config.headers['X-Skip-Cache']) {
    const cacheKey = generateCacheKey(config.url || '', config.params);
    const cached = apiCache.get(cacheKey);
    
    if (cached) {
      // Возвращаем кэшированные данные как отклоненный промис с специальной меткой
      return Promise.reject({
        __cached: true,
        config,
        data: cached,
      });
    }
  }
  
  return config
}, (error) => {
  return Promise.reject(error);
})

// Обработка ответов + кэширование
api.interceptors.response.use(
  (response) => {
    // Кэшируем GET запросы
    if (response.config.method === 'get' && !response.config.headers['X-Skip-Cache']) {
      const cacheKey = generateCacheKey(response.config.url || '', response.config.params);
      // TTL: 30 секунд для списков, 60 секунд для отдельных объектов
      const ttl = response.config.url?.includes('/') && response.config.url.split('/').length > 2 
        ? 60000 
        : 30000;
      apiCache.set(cacheKey, response.data, ttl);
    }
    
    // Инвалидируем кэш при мутациях
    if (['post', 'put', 'patch', 'delete'].includes(response.config.method || '')) {
      const baseUrl = response.config.url?.split('?')[0] || '';
      // Извлекаем первый сегмент после начального слэша, например: '/orders/123' -> 'orders'
      const resource = baseUrl.split('/').filter(s => s.length > 0)[0];
      if (resource) {
      apiCache.invalidatePattern(resource);
      }
    }
    
    return response;
  },
  (error) => {
    // Обрабатываем кэшированные данные
    if (error.__cached) {
      return Promise.resolve({
        data: error.data,
        status: 200,
        statusText: 'OK (cached)',
        headers: {},
        config: error.config,
      });
    }
    
    // Обработка ошибок авторизации
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      apiCache.clear(); // Очищаем кэш при выходе
      // Редиректим только если мы не на странице логина
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
