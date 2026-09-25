import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Gestor de Gastos',
        short_name: 'Gestor Gastos',
        description: 'Aplicación de control de finanzas personales',
        theme_color: '#1e1b4b',
        background_color: '#f4f5fb',
        display: 'standalone',
        start_url: '/',
        // Generados desde public/favicon.svg con pwa-assets.config.ts
        // (`npx pwa-assets-generator`).
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Permite que cualquier ruta de la SPA cargue el shell cacheado
        // cuando no hay conexión (en vez de fallar la navegación).
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Activa el Service Worker también en `npm run dev` para poder
        // probar el comportamiento offline sin necesidad de un build.
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
