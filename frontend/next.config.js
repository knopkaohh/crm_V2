/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Оптимизация минификации с помощью SWC
  swcMinify: true,
  
  // Удаление console.log в production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Оптимизация изображений
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Экспериментальные оптимизации
  experimental: {
    // Disabled due to missing critters module during server builds
    optimizeCss: false,
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  
  // Настройка заголовков для кэширования
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
