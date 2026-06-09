import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { serve } from '../serve.ts'
import type { Context, Handler } from '../types.ts'
import type { DeployConfig, DeployServer } from './types.ts'
import { createGateway } from './gateway.ts'
import { createManager, type AppRuntime } from './manager.ts'
import { forkApp, stopProcess, healthCheck } from './process.ts'

export { defineConfig } from './config.ts'
export type { DeployConfig, AppConfig, DeployServer, AppStatus, GatewayResult } from './types.ts'

export async function deploy(config: DeployConfig): Promise<DeployServer> {
  const apps = new Map<string, AppRuntime>()
  let httpServer: ReturnType<typeof serve> | undefined

  async function forkAndCheck(
    name: string,
    cwd: string,
    entry: string,
    port: number,
    env: Record<string, string> | undefined,
    onLog: (line: string) => void,
    healthEndpoint: string | undefined,
  ) {
    try {
      const mp = forkApp({ cwd, entry, port, env, onLog })
      onLog(`[deploy] forked ${name} (pid ${mp.child.pid}) on port ${mp.port}`)

      const healthy = await healthCheck(port, healthEndpoint ?? '/')
      if (healthy) onLog(`[deploy] health check passed`)
      else onLog(`[deploy] health check failed`)

      return mp
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onLog(`[deploy] fork error: ${msg}`)
      return null
    }
  }

  function scheduleRestart(name: string, runtime: AppRuntime) {
    const delay = Math.min(1000 * Math.pow(2, runtime.restartCount), 30_000)
    runtime.restartCount++
    runtime.logs.push(`[deploy] auto-restart in ${delay}ms (attempt ${runtime.restartCount})`)
    runtime.restartTimer = setTimeout(() => initApp(name), delay)
  }

  async function initApp(name: string): Promise<void> {
    const ac = config.apps[name]
    if (!ac) return

    const old = apps.get(name)
    if (old?.restartTimer) {
      clearTimeout(old.restartTimer)
      old.restartTimer = undefined
    }

    const appDir = path.resolve(ac.dir!)
    const logs: string[] = []
    const log = (line: string) => {
      logs.push(line)
      if (logs.length > 1000) logs.splice(0, logs.length - 1000)
    }

    if (!fs.existsSync(appDir)) {
      setAppRuntime(name, ac, logs, { status: 'error', error: `dir not found: ${appDir}` })
      log(`[deploy] dir not found: ${appDir}`)
      if (old?.process) apps.set(name, old)
      return
    }

    if (ac.buildCommand) {
      if (typeof ac.buildCommand !== 'string' || /[;&|`$()]/.test(ac.buildCommand)) {
        log(`[deploy] invalid build command (rejected): ${ac.buildCommand}`)
        return
      }
      try {
        execSync(ac.buildCommand, { cwd: appDir, stdio: 'pipe', timeout: 120_000 })
        log('[deploy] build done')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setAppRuntime(name, ac, logs, { status: 'error', port: ac.port, error: msg })
        log(`[deploy] build error: ${msg}`)
        if (old?.process) apps.set(name, old)
        return
      }
    }

    let targetPort = ac.port!
    if (ac.ports && old?.process) {
      targetPort = old.currentPort === ac.ports[0] ? ac.ports[1] : ac.ports[0]
    }

    const mp = await forkAndCheck(name, appDir, ac.entry!, targetPort, ac.env, log, ac.healthEndpoint)
    if (!mp) {
      log('[deploy] new process failed to start, keeping old running')
      if (old?.process) apps.set(name, old)
      else {
        setAppRuntime(name, ac, logs, { status: 'error', port: targetPort, error: 'failed to start' })
      }
      return
    }

    const runtime: AppRuntime = {
      config: ac,
      status: {
        name,
        status: 'running' as const,
        port: targetPort,
        path: ac.path,
        pid: mp.child.pid ?? undefined,
      },
      logs,
      process: mp.child,
      currentPort: targetPort,
      startedAt: Date.now(),
      restartCount: 0,
      restartTimer: undefined,
    }
    apps.set(name, runtime)

    mp.child.on('exit', (code, signal) => {
      runtime.process = null
      runtime.status = {
        ...runtime.status,
        status: 'error',
        error: `exited (code=${code} signal=${signal})`,
        pid: undefined,
      }
      log(`[deploy] process exited code=${code} signal=${signal}`)

      if (code !== 0 && signal !== 'SIGTERM') {
        scheduleRestart(name, runtime)
      }
    })

    if (old?.process && old.currentPort !== targetPort) {
      if (old.restartTimer) clearTimeout(old.restartTimer)
      log(`[deploy] stopping old process on port ${old.currentPort}`)
      await stopProcess({ child: old.process, port: old.currentPort })
    }
  }

  function setAppRuntime(
    name: string,
    ac: import('./types.ts').AppConfig,
    logs: string[],
    overrides: Partial<AppRuntime['status']>,
  ) {
    apps.set(name, {
      config: ac,
      status: { name, ...overrides } as any,
      logs,
      process: null,
      currentPort: overrides.port ?? ac.port ?? 0,
      startedAt: null,
      restartCount: 0,
      restartTimer: undefined,
    })
  }

  for (const name of Object.keys(config.apps)) {
    await initApp(name)
  }

  const getPort = (name: string): number | undefined => apps.get(name)?.currentPort
  const gw = createGateway(config, getPort)
  const managerRouter = createManager(config, apps, {
    deployApp: async (name) => { await initApp(name) },
    reloadConfig: async () => {
      throw new Error('reload not supported, restart the deploy process')
    },
  })

  const fullHandler: Handler = async (req, ctx) => {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/_deploy')) {
      const stripped = url.pathname.replace('/_deploy', '') || '/'
      const rewritten = new URL(stripped + url.search, 'http://deploy.local')
      const rewrittenReq = new Request(rewritten, req)
      return managerRouter.handler()(rewrittenReq, ctx)
    }
    return gw.handler(req, ctx)
  }

  httpServer = serve(fullHandler, {
    port: config.port,
    websocket: gw.wsHandler,
  })

  return {
    close: async () => {
      for (const [, app] of apps) {
        if (app.restartTimer) clearTimeout(app.restartTimer)
        if (app.process) {
          await stopProcess({ child: app.process, port: app.currentPort })
        }
      }
      httpServer?.stop()
    },
    ready: httpServer.ready,
    url: `http://localhost:${config.port}/`,
    apps: {
      list: () => Array.from(apps.values()).map(a => a.status),
      status: (name) => apps.get(name)?.status,
      deploy: async (name) => { await initApp(name) },
      restart: async (name) => { await initApp(name) },
      stop: async (name) => {
        const app = apps.get(name)
        if (app?.restartTimer) clearTimeout(app.restartTimer)
        if (app?.process) {
          await stopProcess({ child: app.process, port: app.currentPort })
          app.process = null
          app.status = { ...app.status, status: 'stopped', pid: undefined }
        }
      },
      start: async (name) => { await initApp(name) },
    },
  }
}
