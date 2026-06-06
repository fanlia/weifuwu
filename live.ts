import chokidar from 'chokidar'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import { clearCompileCache } from './compile.ts'

const clients = new Set<WebSocket>()

export function broadcastReload() {
  for (const ws of clients) {
    try { ws.send('reload') } catch { clients.delete(ws) }
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

  watcher.on('change', (path: string) => {
    if (!/\.tsx?$/.test(path)) return
    clearCompileCache()
    setTimeout(broadcastReload, 50)
  })

  ;(r as any).close = () => {
    watcher.close()
    clients.clear()
  }

  return r as Router & { close: () => void }
}
