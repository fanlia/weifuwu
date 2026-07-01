/* eslint-disable no-console */
import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Router, type WebSocketHandler, type Context, type WebSocket as WfWebSocket } from '@weifuwujs/core'
import { compileTsxDev, compileVendorBundle, clearCompileCache } from './compile.ts'
import { clearModuleCache, transformModule } from './module-server.ts'
import { compileTailwindCss } from './tailwind.ts'

const clients = new Set<WfWebSocket>()

export function broadcastReload() {
  for (const ws of clients) {
    try {
      ws.send('reload')
    } catch {
      clients.delete(ws)
    }
  }
}

function broadcastCss(css: string) {
  const msg = JSON.stringify({ type: 'css', css })
  for (const ws of clients) {
    try {
      ws.send(msg)
    } catch {
      clients.delete(ws)
    }
  }
}

export function liveWs(): WebSocketHandler {
  return {
    open(ws: WfWebSocket, _ctx: Context) {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    },
  }
}

export function liveRouter(_dir: string): Router {
  const r = new Router()
  compileVendorBundle().catch(() => {})
  return r
}

export function liveWatcher(dir: string): { close: () => void } {
  const resolved = resolve(dir)
  const watcher = chokidar.watch(dir, {
    ignored: /(^|[/\\])\.|node_modules|[/\\]\.weifuwu[/\\]/,
    ignoreInitial: true,
  })

  watcher.on('change', async (filePath: string) => {
    if (/\.tsx?$/i.test(filePath)) {
      if (filePath.endsWith('layout.tsx')) {
        return broadcastReload()
      }

      clearCompileCache()
      clearModuleCache()

      try {
        await compileTsxDev(filePath)
      } catch (e) {
        console.error('server-side recompile failed:', e)
        return broadcastReload()
      }

      let css: string | undefined
      const cssPath = join(resolved, 'app', 'globals.css')
      if (existsSync(cssPath)) {
        css = await compileTailwindCss(cssPath, resolved)
      }

      try {
        const absPath = resolve(filePath)
        const { url, code } = await transformModule(absPath, resolved)
        const msg: Record<string, unknown> = { type: 'update', url, code }
        if (css) msg.css = css
        const str = JSON.stringify(msg)
        for (const ws of clients) {
          try {
            ws.send(str)
          } catch {
            clients.delete(ws)
          }
        }
      } catch (e) {
        console.error('module transform failed for HMR:', e)
        broadcastReload()
      }
    } else if (/\.css$/i.test(filePath)) {
      const cssPath = join(resolved, 'app', 'globals.css')
      if (existsSync(cssPath)) {
        const css = await compileTailwindCss(cssPath, resolved)
        if (css) broadcastCss(css)
      }
    }
  })

  return {
    close: () => {
      watcher.close()
      clients.clear()
    },
  }
}
