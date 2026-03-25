import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/** GitHub project Pages lives at /repo-name/; CI sets VITE_BASE_PATH=/threejs-engine-dev/ */
function viteBase(): string {
  const p = process.env.VITE_BASE_PATH?.trim()
  if (p == null || p === '' || p === '/') return '/'
  const lead = p.startsWith('/') ? p : `/${p}`
  return lead.endsWith('/') ? lead : `${lead}/`
}

export default defineConfig(({ mode }) => ({
  base: viteBase(),
  plugins: [
    vue(),
    mode !== 'electron' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico'],
        manifest: {
          name: 'pwa-shell',
          short_name: 'shell',
          description: '@base PWA shell template',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
  ],
  resolve: {
    /** Linked `@base/threejs-engine` can pull a second `three`; dedupe fixes instanceof / Object3D.add. */
    dedupe: ['three'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['three', '@base/threejs-engine'],
  },
}))
