import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Router } from './router.ts'
import { broadcastReload } from './live.ts'

const isDev = process.env.NODE_ENV !== 'production'

const extraSources = new Set<string>()

export function addTailwindSource(dir: string) {
  extraSources.add(resolve(dir))
}

export function tailwind(dir: string): Router {
  const cssDir = resolve(dir)
  const cssPath = join(cssDir, 'app.css')
  let compiledCss = ''
  let twWatcher: any = null

  const r = new Router()

  // Middleware — set ctx.compiledTailwindCss for ssr() to inject <link>
  r.use(async (req, ctx, next) => {
    if (!compiledCss) compiledCss = await compile(cssPath, cssDir)
    ctx.compiledTailwindCss = compiledCss

    if (isDev && !twWatcher) {
      twWatcher = watchFile(cssPath, () => {
        compiledCss = ''
        broadcastReload()
      })
    }

    return next(req, ctx)
  })

  // Route — serve compiled CSS
  r.get('/__wfw/style.css', async (req, ctx) => {
    if (!compiledCss) compiledCss = await compile(cssPath, cssDir)
    return new Response(compiledCss || '', {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  })

  return r
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
