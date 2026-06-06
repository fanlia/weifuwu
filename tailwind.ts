import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Middleware } from './types.ts'

const isDev = process.env.NODE_ENV !== 'production'

export function tailwind(cssPath: string, scanDir?: string): Middleware {
  let compiledCss = ''
  let twWatcher: any = null

  return async (req, ctx, next) => {
    const url = new URL(req.url)

    // Eagerly compile on first request
    if (!compiledCss) {
      compiledCss = await compile(cssPath, scanDir)
    }

    // Serve compiled CSS
    if (url.pathname === '/__wfw/style.css') {
      return new Response(compiledCss || '', {
        headers: { 'content-type': 'text/css; charset=utf-8' },
      })
    }

    // Make compiled CSS available via ctx for ssr() to inject <link>
    ctx.compiledTailwindCss = compiledCss

    // Dev: watch css file
    if (isDev && !twWatcher) {
      twWatcher = watchFile(cssPath, () => {
        compiledCss = ''
      })
    }

    return next(req, ctx)
  }
}

async function compile(cssPath: string, scanDir?: string): Promise<string> {
  try {
    const inputFile = resolve(cssPath)
    if (!existsSync(inputFile)) {
      mkdirSync(dirname(inputFile), { recursive: true })
      writeFileSync(inputFile, '@import "tailwindcss"\n', 'utf-8')
    }

    const { default: tailwindPlugin } = await import('@tailwindcss/postcss')
    const { default: postcss } = await import('postcss')

    let src = readFileSync(inputFile, 'utf-8')
    const scanSource = scanDir
      ? relative(dirname(inputFile), scanDir) || '.'
      : '.'
    const sourcePath = scanSource === '.' ? './' : `./${scanSource}/`
    src = `@source "${sourcePath}";\n${src}`
    const result = await postcss([tailwindPlugin()]).process(src, { from: inputFile })
    return result.css
  } catch (err) {
    console.warn('Tailwind CSS processing failed:', (err as Error).message)
    return ''
  }
}

function dirname(p: string): string {
  return p.substring(0, p.lastIndexOf('/')) || '/'
}

function watchFile(path: string, onChange: () => void): any {
  let watcher: any = null
  import('chokidar').then(chokidar => {
    watcher = chokidar.default.watch(resolve(path), { persistent: false })
    watcher.on('change', onChange)
  })
  return watcher
}
