import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Router } from './router.ts'
import type { Middleware } from './types.ts'

const extraSources = new Set<string>()

interface CssEntry {
  css: string
  hash: string
}
const cssCache = new Map<string, CssEntry>()

export function addTailwindSource(dir: string) {
  extraSources.add(resolve(dir))
}

// Middleware: sets ctx.tailwindCssUrl for SSR pages
export function tailwindContext(dir: string): Middleware {
  const cssDir = resolve(dir)
  const cssPath = join(cssDir, 'app.css')
  return async (req, ctx, next) => {
    if (!cssCache.has(cssPath)) {
      await compileTailwindCss(cssPath, cssDir)
    }
    const entry = cssCache.get(cssPath)!
    ctx.compiledTailwindCss = entry.css
    const base = (ctx.mountPath || '').replace(/\/$/, '')
    ctx.tailwindCssUrl = base ? `${base}/__wfw/style/${entry.hash}.css` : `/__wfw/style/${entry.hash}.css`
    return next(req, ctx)
  }
}

// Router: serves compiled CSS at /__wfw/style/:hash.css
export function tailwindRouter(dir: string): Router {
  const cssDir = resolve(dir)
  const cssPath = join(cssDir, 'app.css')
  const r = new Router()
  r.get('/__wfw/style/:hash.css', async (req, ctx) => {
    if (!cssCache.has(cssPath)) {
      await compileTailwindCss(cssPath, cssDir)
    }
    const entry = cssCache.get(cssPath)
    if (!entry) return new Response('', { status: 404 })
    return new Response(entry.css, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  })
  return r
}

export async function compileTailwindCss(cssPath: string, cssDir: string): Promise<string> {
  try {
    if (!existsSync(cssPath)) {
      mkdirSync(cssDir, { recursive: true })
      writeFileSync(cssPath, '@import "tailwindcss"\n', 'utf-8')
    }

    const { default: tailwindPlugin } = await import('@tailwindcss/postcss')
    const { default: postcss } = await import('postcss')

    let src = readFileSync(cssPath, 'utf-8')
    src = `@source "./";\n${src}`

    for (const srcDir of extraSources) {
      const rel = relative(cssDir, srcDir) || '.'
      src = `@source "${rel.startsWith('.') ? rel : './' + rel}";\n${src}`
    }

    const result = await postcss([tailwindPlugin()]).process(src, { from: cssPath })
    const hash = createHash('md5').update(result.css).digest('hex').slice(0, 8)
    cssCache.set(cssPath, { css: result.css, hash })
    return result.css
  } catch (err) {
    console.warn('Tailwind CSS processing failed:', (err as Error).message)
    return ''
  }
}
