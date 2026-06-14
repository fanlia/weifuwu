import crypto from 'node:crypto'
import { Router } from '../router.ts'
import type { Middleware } from '../types.ts'
import type { DeployConfig, AppStatus } from './types.ts'
import { formatSSEData } from '../sse.ts'
import { stopProcess } from './process.ts'

export interface AppRuntime {
  config: import('./types.ts').AppConfig
  status: AppStatus
  logs: string[]
  process: import('node:child_process').ChildProcess | null
  currentPort: number
  startedAt: number | null
  restartCount: number
  restartTimer: ReturnType<typeof setTimeout> | undefined
}

export function createManager(
  config: DeployConfig,
  apps: Map<string, AppRuntime>,
  manager: {
    deployApp(name: string): Promise<void>
    reloadConfig(): Promise<void>
  },
): Router {
  const router = new Router()

  const auth: Middleware = (req, ctx, next) => {
    if (!config.deployToken) return next(req, ctx)
    const header = req.headers.get('authorization') ?? ''
    const token = header.replace('Bearer ', '')
    const tokenBuf = Buffer.from(token)
    const secretBuf = Buffer.from(config.deployToken)
    if (tokenBuf.length !== secretBuf.length ||
        !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return next(req, ctx)
  }

  router.get('/apps', auth, () => {
    const list = Array.from(apps.values()).map(a => a.status)
    return Response.json(list)
  })

  router.get('/apps/:name', auth, (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })
    return Response.json(app.status)
  })

  router.post('/apps/:name/deploy', auth, async (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })
    try {
      await manager.deployApp(ctx.params.name)
      return Response.json({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 500 })
    }
  })

  router.post('/apps/:name/restart', auth, async (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })
    try {
      await manager.deployApp(ctx.params.name)
      return Response.json({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 500 })
    }
  })

  router.post('/apps/:name/stop', auth, async (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })
    if (app.process) {
      await stopProcess({ child: app.process, port: app.currentPort })
      app.process = null
    }
    app.status = { ...app.status, status: 'stopped', pid: undefined }
    return Response.json({ success: true })
  })

  router.post('/apps/:name/start', auth, async (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })
    try {
      await manager.deployApp(ctx.params.name)
      return Response.json({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 500 })
    }
  })

  router.get('/apps/:name/logs', auth, (req, ctx) => {
    const app = apps.get(ctx.params.name)
    if (!app) return new Response('Not Found', { status: 404 })

    let index = app.logs.length
    let interval: ReturnType<typeof setInterval> | undefined

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        for (const line of app.logs) {
          controller.enqueue(encoder.encode(formatSSEData({ line })))
        }

        interval = setInterval(() => {
          while (index < app.logs.length) {
            controller.enqueue(encoder.encode(formatSSEData({ line: app.logs[index] })))
            index++
          }
        }, 500)
      },
      cancel() {
        if (interval) clearInterval(interval)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  })

  return router
}
