import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDev } from './env.ts'
import { Router } from './router.ts'
import { compile } from './compile.ts'
import { tailwind } from './tailwind.ts'
import { liveReload } from './live.ts'

export function rootLayout(dir: string): Router & { close?: () => void } {
  const r = new Router()
  const resolved = resolve(dir)

  // Layout middleware
  const layoutPath = join(resolved, 'layout.tsx')
  r.use(async (req, ctx, next) => {
    const mod = await compile(layoutPath)
    if (mod?.default) ctx.layoutStack = [{ path: layoutPath, component: mod.default }]
    ctx.rootLayoutBase = (ctx.mountPath || '').replace(/\/$/, '')
    return next(req, ctx)
  })

  // Tailwind
  if (existsSync(join(resolved, 'app.css'))) {
    r.use(tailwind(resolved))
  }

  // Dev: vendor + WS + watcher
  if (isDev()) {
    const lr = liveReload(resolved)
    r.use(lr)
    ;(r as any).close = lr.close
  }

  return r
}
