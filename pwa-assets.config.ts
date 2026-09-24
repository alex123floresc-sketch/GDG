import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Genera los iconos PNG de la PWA a partir de public/favicon.svg:
//   npx @vite-pwa/assets-generator
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#0f766e' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#0f766e' },
    },
  },
  images: ['public/favicon.svg'],
})
