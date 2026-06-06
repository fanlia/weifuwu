import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Router } from './router.ts'

const extraSources = new Set<string>()
const cssCache = new Map<string, string>()

export function addTailwindSource(dir: string) {
  extraSources.add(resolve(dir))
}

export function tailwind(dir: string): Router {
  const cssDir = resolve(dir)
  const cssPath = join(cssDir, 'app.css')

  const r = new Router()

  r.use(async (req, ctx, next) => {
    if (!cssCache.has(cssPath)) {
      cssCache.set(cssPath, await compileTailwindCss(cssPath, cssDir))
    }
    ctx.compiledTailwindCss = cssCache.get(cssPath)!
    return next(req, ctx)
  })

  r.get('/__wfw/style.css', async (req, ctx) => {
    if (!cssCache.has(cssPath)) {
      cssCache.set(cssPath, await compileTailwindCss(cssPath, cssDir))
    }
    return new Response(cssCache.get(cssPath) || '', {
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
    cssCache.set(cssPath, result.css)
    return result.css
  } catch (err) {
    console.warn('Tailwind CSS processing failed:', (err as Error).message)
    return ''
  }
}
