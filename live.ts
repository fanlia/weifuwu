import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import { compileTsxDev, clearCompileCache } from './compile.ts'
import { clearClientBundleCache } from './ssr.ts'
import { compileTailwindCss } from './tailwind.ts'

const clients = new Set<WebSocket>()

export function broadcastReload() {
  for (const ws of clients) {
    try { ws.send('reload') } catch { clients.delete(ws) }
  }
}

function broadcastCss(css: string) {
  const msg = JSON.stringify({ type: 'css', css })
  for (const ws of clients) {
    try { ws.send(msg) } catch { clients.delete(ws) }
  }
}

export function liveReload(opts: { dirs: string[] }): Router & { close: () => void } {
  const r = new Router()

  r.ws('/__weifuwu/livereload', {
    open(ws: WebSocket) {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    },
  })

  const watcher = chokidar.watch(opts.dirs, {
    ignored: /(^|[/\\])\.|node_modules|[/\\]\.weifuwu[/\\]/,
    ignoreInitial: true,
  })

  watcher.on('change', async (filePath: string) => {
    if (/\.tsx?$/i.test(filePath)) {
      clearCompileCache()
      clearClientBundleCache()
      try {
        await compileTsxDev(filePath)
        for (const dir of opts.dirs) {
          const cssPath = join(resolve(dir), 'app.css')
          if (existsSync(cssPath)) {
            await compileTailwindCss(cssPath, resolve(dir))
          }
        }
      } catch (e) {
        console.error('live reload compile failed:', e)
      }
      broadcastReload()
    } else if (/\.css$/i.test(filePath)) {
      for (const dir of opts.dirs) {
        const cssPath = join(resolve(dir), 'app.css')
        if (existsSync(cssPath)) {
          const css = await compileTailwindCss(cssPath, resolve(dir))
          if (css) broadcastCss(css)
        }
      }
    }
  })

  ;(r as any).close = () => {
    watcher.close()
    clients.clear()
  }

  return r as Router & { close: () => void }
}
