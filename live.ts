import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import { compileTsxDev, compileHotComponent, compileVendorBundle, clearCompileCache, id } from './compile.ts'
import { compileTailwindCss } from './tailwind.ts'
import { markClientBundleDirty } from './ssr.ts'

const clients = new Set<WebSocket>()
const hotBundleCache = new Map<string, string>()
const hotKeys: string[] = []
const MAX_HOT = 10

function setHot(hash: string, code: string) {
  if (!hotBundleCache.has(hash)) {
    hotKeys.push(hash)
    if (hotKeys.length > MAX_HOT) {
      const old = hotKeys.shift()!
      hotBundleCache.delete(old)
    }
  }
  hotBundleCache.set(hash, code)
}

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

  // Auto-detect entry page (first dir / page.tsx)
  const entryPath = (() => {
    for (const dir of opts.dirs) {
      const p = join(resolve(dir), 'page.tsx')
      if (existsSync(p)) return p
    }
    return ''
  })()

  // single vendor bundle (includes react-refresh/runtime)
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
      markClientBundleDirty()
      try {
        const target = entryPath || filePath
        await compileTsxDev(target)
        const { hash, code } = await compileHotComponent(target)
        setHot(hash, code)
        let css: string | undefined
        for (const dir of opts.dirs) {
          const cssPath = join(resolve(dir), 'app.css')
          if (existsSync(cssPath)) {
            css = await compileTailwindCss(cssPath, resolve(dir))
          }
        }
        const entry = entryPath ? id(entryPath) : ''
        const msg: any = { type: 'component', hash, entry }
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
