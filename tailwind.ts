import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Middleware } from './types.ts'
import { broadcastReload } from './live.ts'

const isDev = process.env.NODE_ENV !== 'production'

const extraSources = new Set<string>()

export function addTailwindSource(dir: string) {
  extraSources.add(resolve(dir))
}

export function tailwind(dir: string): Middleware {
  const cssDir = resolve(dir)
  const cssPath = join(cssDir, 'app.css')
  let compiledCss = ''
  let twWatcher: any = null

  return async (req, ctx, next) => {
    const url = new URL(req.url)

    // Eagerly compile on first request
    if (!compiledCss) compiledCss = await compile(cssPath, cssDir)

    // Serve compiled CSS at {mountPath}/__wfw/style.css
    const stylePath = (ctx.mountPath || '') + '/__wfw/style.css'
    if (url.pathname === stylePath) {
      return new Response(compiledCss || '', {
        headers: { 'content-type': 'text/css; charset=utf-8' },
      })
    }

    ctx.compiledTailwindCss = compiledCss

    if (isDev && !twWatcher) {
      twWatcher = watchFile(cssPath, () => {
        compiledCss = ''
        broadcastReload()
      })
    }

    return next(req, ctx)
  }
}

async function compile(cssPath: string, cssDir: string): Promise<string> {
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
    return result.css
  } catch (err) {
    console.warn('Tailwind CSS processing failed:', (err as Error).message)
    return ''
  }
}

function watchFile(path: string, onChange: () => void): any {
  let watcher: any = null
  import('chokidar').then(chokidar => {
    watcher = chokidar.default.watch(resolve(path), { persistent: false })
    watcher.on('change', onChange)
  })
  return watcher
}
