import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  // Versión visible en Más → Seguridad y respaldo (para saber cuál tienes).
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    rolldownOptions: {
      output: {
        // Librerías en chunks propios: el código de la app cambia en cada
        // versión pero estas no, así que el navegador/Service Worker las
        // reutiliza de caché y el chunk principal queda bajo 500 kB.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'dexie', test: /node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // El registro lo hace main.tsx (virtual:pwa-register), que además
      // recarga la página cuando llega una versión nueva: así los arreglos
      // llegan sin tener que recargar dos veces.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Gestor de Gastos',
        short_name: 'Gestor Gastos',
        description: 'Aplicación de control de finanzas personales',
        theme_color: '#1e1b4b',
        background_color: '#f4f5fb',
        display: 'standalone',
        start_url: '/',
        id: '/',
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
        // Atajos al mantener presionado el ícono de la app instalada. Los
        // abre Dashboard.tsx (`accionDeUrl`). Íconos en public/atajos/.
        // "Compartir → Gestor de Gastos" (foto de la boleta o texto de una
        // notificación). Lo recibe public/sw-extra.js.
        share_target: {
          action: '/compartir',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'imagen', accept: ['image/*'] }],
          },
        },
        shortcuts: [
          {
            name: 'Registrar gasto',
            short_name: 'Gasto',
            url: '/?accion=gasto',
            icons: [{ src: 'atajos/gasto.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Registrar ingreso',
            short_name: 'Ingreso',
            url: '/?accion=ingreso',
            icons: [{ src: 'atajos/ingreso.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Transferir entre cuentas',
            short_name: 'Transferir',
            url: '/?accion=transferencia',
            icons: [{ src: 'atajos/transferir.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Ver movimientos',
            short_name: 'Movimientos',
            url: '/?seccion=movimientos',
            icons: [{ src: 'atajos/movimientos.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Permite que cualquier ruta de la SPA cargue el shell cacheado
        // cuando no hay conexión (en vez de fallar la navegación).
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Recibe lo compartido a la app (Web Share Target) y las notificaciones push.
        importScripts: ['sw-extra.js'],
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
