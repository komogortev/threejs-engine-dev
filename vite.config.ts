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
  /** App root (threejs-engine-dev/). Linked `@base/*` packages resolve under ../SHARED. */
  const appRoot = fileURLToPath(new URL('.', import.meta.url))
  const sharedRoot = resolve(appRoot, '../SHARED')

  return {
    base,
    plugins: [
      vue(),
      !disablePwa &&
        mode !== 'electron' &&
        VitePWA({
          registerType: 'autoUpdate',
          /** No `public/` icon files yet — listing missing paths causes 404 on every load. */
          includeAssets: [],
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
        /**
         * Force Vite to load @base/player-three from TypeScript source rather than compiled
         * dist/. Required so Vite transforms `import.meta.glob` in mixamoFbxClipUrls.ts —
         * the glob is expanded relative to the source file's location, giving correct
         * `@fs/` URLs for the package's `assets/` directory.
         */
        '@base/player-three': resolve(sharedRoot, 'packages/player-three/src/index.ts'),
        /**
         * @base/ui ships Vue SFCs — resolve from source so Vite processes them
         * with @vitejs/plugin-vue instead of loading a pre-built dist.
         */
        '@base/ui': resolve(sharedRoot, 'packages/ui/src/index.ts'),
      },
    },
    server: {
      fs: {
        allow: [appRoot, sharedRoot],
      },
    },
    optimizeDeps: {
      include: ['three', '@base/threejs-engine'],
      exclude: ['@base/player-three', '@base/ui'],
    },
  }
})
