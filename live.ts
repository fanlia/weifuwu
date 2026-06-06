import chokidar from 'chokidar'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import { compileTsxDev, compileHotComponent, compileVendorModule, clearCompileCache } from './compile.ts'
import { compileTailwindCss } from './tailwind.ts'

const clients = new Set<WebSocket>()
const hotBundleCache = new Map<string, string>()

const VENDOR_ENTRIES: Record<string, string> = (() => {
  const root = process.cwd()
  return {
    'react': resolve(root, 'node_modules/react'),
    'react-dom': resolve(root, 'node_modules/react-dom'),
    'jsx-runtime': resolve(root, 'node_modules/react/jsx-runtime.js'),
    'weifuwu-react': resolve(root, 'node_modules/weifuwu/dist/react.js'),
  }
})()

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

  // vendor 端点
  r.get('/__wfw/v/:name', async (req, ctx) => {
    const name = ctx.params.name.replace(/\.js$/i, '')
    const entry = VENDOR_ENTRIES[name]
    if (!entry || !existsSync(entry)) return new Response('', { status: 404 })
    const code = await compileVendorModule(name, entry)
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
