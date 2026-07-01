/**
 * css — Tailwind v4 CSS compilation pipeline.
 *
 * Compiles `globals.css` into production CSS using `@tailwindcss/postcss`.
 * Cached and served with content-hash URL for cache busting.
 *
 * ```ts
 * app.use(cssContext('./ui'))  // → ctx.css = { url: '/__wfw/style/abc123.css' }
 * app.use(cssRouter('./ui'))   // → serves /__wfw/style/:hash.css
 * ```
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import tailwindPlugin from '@tailwindcss/postcss'
import postcss from 'postcss'
import { Router } from '../core/router.ts'
import type { Context, Middleware } from '../types.ts'

export interface CssAsset {
  css: string
  hash: string
  url: string
}

declare module '../types.ts' {
  interface Context {
    css?: CssAsset
  }
}

const cssCache = new Map<string, CssAsset>()

export async function compileCSS(cssPath: string, sourceDir: string): Promise<CssAsset> {
  if (!existsSync(cssPath)) {
    return { css: '', hash: 'empty', url: '' }
  }

  const raw = readFileSync(cssPath, 'utf-8')
  const src = `@source "${sourceDir}";\n${raw}`

  const result = await postcss([tailwindPlugin()]).process(src, { from: cssPath })
  const hash = createHash('md5').update(result.css).digest('hex').slice(0, 8)

  const asset: CssAsset = { css: result.css, hash, url: `/__wfw/style/${hash}.css` }
  cssCache.set(cssPath, asset)
  return asset
}

export function cssContext(dir: string): Middleware {
  const appDir = resolve(dir, 'app')
  const cssPath = join(appDir, 'globals.css')
  let cached: Promise<CssAsset> | null = null

  return async (req, ctx, next) => {
    if (!cached) cached = compileCSS(cssPath, appDir)
    const asset = await cached
    if (asset.css) (ctx as Context & { css: CssAsset }).css = asset
    return next(req, ctx)
  }
}

export function cssRouter(dir: string): Router {
  const router = new Router()
  router.get('/__wfw/style/:hash.css', async () => {
    const cssPath = join(resolve(dir, 'app'), 'globals.css')
    const asset = cssCache.get(cssPath)
    if (!asset) return new Response('', { status: 404 })
    return new Response(asset.css, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  })
  return router
}

export function clearCSSCache(): void {
  cssCache.clear()
}
