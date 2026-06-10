import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDev } from './env.ts'
import { Router } from './router.ts'
import { compile } from './compile.ts'
import { tailwindContext, tailwindRouter } from './tailwind.ts'
import { liveRouter, liveWatcher, liveWs } from './live.ts'

export function rootLayout(dir: string): Router & { close?: () => void } {
  const r = new Router()
  const resolved = resolve(dir)

  // Layout middleware — sets ctx.layoutStack
  const layoutPath = join(resolved, 'layout.tsx')
  r.use(async (req, ctx, next) => {
    const mod = await compile(layoutPath)
    if (mod?.default) ctx.layoutStack = [{ path: layoutPath, component: mod.default }]
    ctx.rootLayoutBase = (ctx.mountPath || '').replace(/\/$/, '')
    return next(req, ctx)
  })

  // Tailwind CSS — context middleware + CSS serving route
  if (existsSync(join(resolved, 'app.css'))) {
    r.use(tailwindContext(resolved))
    r.use('/', tailwindRouter(resolved))
  }

  // Dev: vendor + WS + watcher
  if (isDev()) {
    r.use('/', liveRouter(resolved))
    r.ws('/__weifuwu/livereload', liveWs())
    const watcher = liveWatcher(resolved)
    ;(r as any).close = watcher.close
  }

  return r
}
