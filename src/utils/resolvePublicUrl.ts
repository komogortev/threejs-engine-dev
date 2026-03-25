/**
 * Vite sets import.meta.env.BASE_URL from config.base (CI should set VITE_BASE_PATH).
 * If that is still `/` while the app is hosted under e.g. /threejs-engine-dev/, infer
 * the segment from this module's deployed URL (.../repo/assets/chunk.js).
 */
export function getAppBaseUrl(): string {
  const envBase = import.meta.env.BASE_URL
  if (typeof envBase === 'string' && envBase !== '' && envBase !== '/') {
    return envBase.endsWith('/') ? envBase : `${envBase}/`
  }
  try {
    const pathname = new URL(import.meta.url).pathname
    const mark = '/assets/'
    const idx = pathname.indexOf(mark)
    if (idx > 0) {
      let prefix = pathname.slice(0, idx)
      if (!prefix.endsWith('/')) prefix += '/'
      return prefix
    }
  } catch {
    /* opaque import.meta.url */
  }
  return '/'
}

/**
 * Resolves paths to files under `public/` when the app is not served from `/`.
 *
 * Descriptors use site-root paths like `/terrains/foo.png`; without the repo prefix
 * the browser requests `https://host/terrains/...` and GitHub project Pages 404s.
 */
export function resolvePublicUrl(url: string): string {
  if (!url) return url
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  if (url.startsWith('/')) {
    const base = getAppBaseUrl()
    return `${base}${url.slice(1)}`
  }
  return url
}
