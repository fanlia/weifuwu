import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import { compileTsxDev, compileHotComponent, compileVendorBundle, clearCompileCache } from './compile.ts'
import { compileTailwindCss } from './tailwind.ts'

const clients = new Set<WebSocket>()
const hotBundleCache = new Map<string, string>()

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

  // single vendor bundle
  r.get('/__wfw/v/bundle', async (req, ctx) => {
    const code = await compileVendorBundle()
    return new Response(code, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

  // hot component 端点
  r.get('/__wfw/h/:hash', async (req, ctx) => {
    const hash = ctx.params.hash.replace(/\.js$/i, '')
    const code = hotBundleCache.get(hash)
    if (!code) return new Response('', { status: 404 })
    return new Response(code, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

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
      try {
        await compileTsxDev(filePath)
        const { hash, code } = await compileHotComponent(filePath)
        hotBundleCache.set(hash, code)
        let css: string | undefined
        for (const dir of opts.dirs) {
          const cssPath = join(resolve(dir), 'app.css')
          if (existsSync(cssPath)) {
            css = await compileTailwindCss(cssPath, resolve(dir))
          }
        }
        const msg: any = { type: 'component', hash }
        if (css) msg.css = css
        const str = JSON.stringify(msg)
        for (const ws of clients) {
          try { ws.send(str) } catch { clients.delete(ws) }
        }
      } catch (e) {
        console.error('live reload failed, fallback to full reload:', e)
        broadcastReload()
      }
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
