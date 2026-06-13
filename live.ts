import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import type { WebSocketHandler } from './router.ts'
import { compileTsxDev, compileHotComponent, compileVendorBundle, clearCompileCache, id } from './compile.ts'
import { compileTailwindCss } from './tailwind.ts'
import { ssrEntries } from './ssr-entries.ts'

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

export function liveWs(): WebSocketHandler {
  return {
    open(ws: WebSocket) {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    },
  }
}

export function liveRouter(dir: string): Router {
  const r = new Router()

  // Pre-warm vendor bundle so vendorHash is available for importmap
  compileVendorBundle().catch(() => {})

  r.get('/__wfw/v/bundle', async () => {
    const code = await compileVendorBundle()
    return new Response(code, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

  r.get('/__wfw/h/:hash', async (req, ctx) => {
    const hash = ctx.params.hash.replace(/\.js$/i, '')
    const code = hotBundleCache.get(hash)
    if (!code) return new Response('', { status: 404 })
    return new Response(code, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

  return r
}

export function liveWatcher(dir: string): { close: () => void } {
  const resolved = resolve(dir)
  const entryPath = join(resolved, 'page.tsx')

  const watcher = chokidar.watch(dir, {
    ignored: /(^|[/\\])\.|node_modules|[/\\]\.weifuwu[/\\]/,
    ignoreInitial: true,
  })

  function findEntries(changedPath: string): string[] {
    const matched: string[] = []
    for (const [, entry] of ssrEntries) {
      if (!entry.path.startsWith(resolved)) continue
      if (entry.path === changedPath) {
        matched.push(entry.path)
      } else {
        const ed = dirname(entry.path)
        if (changedPath.startsWith(ed)) matched.push(entry.path)
      }
    }
    if (matched.length === 0) {
      for (const [, entry] of ssrEntries) {
        if (entry.path.startsWith(resolved)) matched.push(entry.path)
      }
    }
    return matched
  }

  watcher.on('change', async (filePath: string) => {
    if (/\.tsx?$/i.test(filePath)) {
      if (filePath.endsWith('layout.tsx')) {
        return broadcastReload()
      }
      clearCompileCache()
      const targets = existsSync(entryPath)
        ? [entryPath]
        : findEntries(resolve(filePath))
      if (targets.length === 0) return broadcastReload()
      try {
        let css: string | undefined
        const cssPath = join(resolved, 'app', 'globals.css')
        if (existsSync(cssPath)) {
          css = await compileTailwindCss(cssPath, resolved)
        }
        for (const target of targets) {
          await compileTsxDev(target)
          const { hash, code } = await compileHotComponent(target)
          setHot(hash, code)
          const entry = id(target)
          const msg: any = { type: 'component', hash, entry }
          if (css) msg.css = css
          const str = JSON.stringify(msg)
          for (const ws of clients) {
            try { ws.send(str) } catch { clients.delete(ws) }
          }
        }
      } catch (e) {
        console.error('live reload failed, fallback to full reload:', e)
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
