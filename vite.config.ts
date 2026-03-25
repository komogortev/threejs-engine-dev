import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/** GitHub project Pages lives at /repo-name/; CI sets VITE_BASE_PATH=/threejs-engine-dev/ */
function viteBase(): string {
  const p = process.env.VITE_BASE_PATH?.trim()
  if (p == null || p === '' || p === '/') return '/'
  const lead = p.startsWith('/') ? p : `/${p}`
  return lead.endsWith('/') ? lead : `${lead}/`
}

/** GitHub Pages serves 404 for unknown paths; copy index.html so Vue Router can boot on refresh. */
function ghPagesSpaFallback(base: string): Plugin {
  return {
    name: 'gh-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      if (base === '/') return
      const out = resolve(process.cwd(), 'dist')
      const indexHtml = resolve(out, 'index.html')
      const notFound = resolve(out, '404.html')
      if (existsSync(indexHtml)) copyFileSync(indexHtml, notFound)
    },
  }
}

const disablePwa =
  process.env.VITE_DISABLE_PWA === '1' || process.env.VITE_DISABLE_PWA === 'true'

export default defineConfig(({ mode }) => {
  const base = viteBase()

  return {
    base,
    plugins: [
      vue(),
      !disablePwa &&
        mode !== 'electron' &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico'],
          scope: base,
          manifest: {
            name: 'threejs-engine-dev',
            short_name: 'threejs-dev',
            description: 'Three.js + @base engine editor and scene harness',
            theme_color: '#09090b',
            background_color: '#09090b',
            display: 'standalone',
            start_url: base,
            scope: base,
            icons: [
              { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
              { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
            ],
          },
          workbox: {
            navigateFallback: `${base}index.html`,
            navigateFallbackDenylist: [/^\/api\//],
          },
        }),
      ghPagesSpaFallback(base),
    ].filter(Boolean) as Plugin[],
    resolve: {
      dedupe: ['three'],
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ['three', '@base/threejs-engine'],
    },
  }
})
