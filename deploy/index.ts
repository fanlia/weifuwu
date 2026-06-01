import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { serve } from '../serve.ts'
import type { Context, Handler } from '../types.ts'
import type { DeployConfig, DeployServer, AppConfig } from './types.ts'
import { createGateway } from './gateway.ts'
import { createManager, type AppRuntime } from './manager.ts'
import { forkApp, stopProcess, healthCheck } from './process.ts'

export { defineConfig } from './config.ts'
export type { DeployConfig, AppConfig, DeployServer, AppStatus, GatewayResult } from './types.ts'

export async function deploy(config: DeployConfig): Promise<DeployServer> {
  const appsDir = config.appsDir ?? '/opt/weifuwu/apps'
  const apps = new Map<string, AppRuntime>()
  let httpServer: ReturnType<typeof serve> | undefined

  if (!fs.existsSync(appsDir)) {
    fs.mkdirSync(appsDir, { recursive: true })
  }

  // ── Low-level process fork + health check ───────────────────────────

  async function forkAndCheck(
    cwd: string,
    entry: string,
    port: number,
    env: Record<string, string> | undefined,
    onLog: (line: string) => void,
    healthEndpoint: string | undefined,
  ) {
    try {
      const mp = forkApp({ cwd, entry, port, env, onLog })
      onLog(`[deploy] forked pid ${mp.child.pid} on port ${mp.port}`)

      const healthy = await healthCheck(port, healthEndpoint ?? '/')
      if (healthy) onLog('[deploy] health check passed')
      else onLog('[deploy] health check failed')

      return mp
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onLog(`[deploy] fork error: ${msg}`)
      return null
    }
  }

  // ── Schedule auto-restart with exponential backoff ──────────────────

  function scheduleRestart(name: string, runtime: AppRuntime) {
    const delay = Math.min(1000 * Math.pow(2, runtime.restartCount), 30_000)
    runtime.restartCount++
    runtime.logs.push(`[deploy] auto-restart in ${delay}ms (attempt ${runtime.restartCount})`)
    runtime.restartTimer = setTimeout(() => initApp(name), delay)
  }

  // ── Full app init: git → npm → build → fork (blue-green) ───────────

  async function initApp(name: string): Promise<void> {
    const ac = config.apps[name]
    if (!ac) return

    const old = apps.get(name)
    if (old?.restartTimer) {
      clearTimeout(old.restartTimer)
      old.restartTimer = undefined
    }

    const appDir = path.join(appsDir, name)
    const logs: string[] = []
    const log = (line: string) => {
      logs.push(line)
      if (logs.length > 1000) logs.splice(0, logs.length - 1000)
    }

    // ── git ─────────────────────────────────────────────────────────
    try {
      // Validate repo URL to prevent shell injection
      if (typeof ac.repo !== 'string' || !/^https?:\/\/[^\s"']+\/[^\s"']+/.test(ac.repo) && !/^git@[^\s"']+:[^\s"']+/.test(ac.repo)) {
        throw new Error(`Invalid repo URL: ${ac.repo}`)
      }
      if (ac.branch && typeof ac.branch === 'string' && !/^[\w.\-/]+$/.test(ac.branch)) {
        throw new Error(`Invalid branch name: ${ac.branch}`)
      }

      if (fs.existsSync(path.join(appDir, '.git'))) {
        execSync('git pull', { cwd: appDir, stdio: 'pipe', timeout: 120_000 })
        log('[deploy] git pull done')
      } else {
        if (fs.existsSync(appDir)) {
          fs.rmSync(appDir, { recursive: true })
        }
        execSync(`git clone --depth=1 ${ac.repo} ${appDir}`, { stdio: 'pipe', timeout: 120_000 })
        log('[deploy] git clone done')
        if (ac.branch) {
          execSync(`git checkout ${ac.branch}`, { cwd: appDir, stdio: 'pipe', timeout: 30_000 })
          log(`[deploy] switched to branch ${ac.branch}`)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAppRuntime(name, ac, logs, { status: 'error', port: ac.port, error: msg })
      log(`[deploy] git error: ${msg}`)
      if (old?.process) {
        // Keep old process running
        apps.set(name, old)
      }
      return
    }

    // ── npm install ─────────────────────────────────────────────────
    try {
      execSync('npm install', { cwd: appDir, stdio: 'pipe', timeout: 120_000 })
      log('[deploy] npm install done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAppRuntime(name, ac, logs, { status: 'error', port: ac.port, error: msg })
      log(`[deploy] npm install error: ${msg}`)
      if (old?.process) apps.set(name, old)
      return
    }

    // ── build (optional) ────────────────────────────────────────────
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

    // ── Determine target port (blue-green) ──────────────────────────
    let targetPort = ac.port
    if (ac.ports && old?.process) {
      targetPort = old.currentPort === ac.ports[0] ? ac.ports[1] : ac.ports[0]
    }

    // ── Fork new process ────────────────────────────────────────────
    const mp = await forkAndCheck(appDir, ac.entry, targetPort, ac.env, log, ac.healthEndpoint)
    if (!mp) {
      log('[deploy] new process failed to start, keeping old running')
      if (old?.process) apps.set(name, old)
      else {
        setAppRuntime(name, ac, logs, { status: 'error', port: targetPort, error: 'failed to start' })
      }
      return
    }

    // ── Create new AppRuntime ────────────────────────────────────────
    const runtime: AppRuntime = {
      config: ac,
      status: { name, status: 'running', port: targetPort, subdomain: ac.subdomain, path: ac.path, pid: mp.child.pid ?? undefined },
      logs,
      process: mp.child,
      currentPort: targetPort,
      startedAt: Date.now(),
      restartCount: 0,
      restartTimer: undefined,
    }
    apps.set(name, runtime)

    // ── Monitor for crashes (auto-restart) ──────────────────────────
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

    // ── Kill old process (zero-downtime handoff) ────────────────────
    if (old?.process && old.currentPort !== targetPort) {
      if (old.restartTimer) clearTimeout(old.restartTimer)
      log(`[deploy] stopping old process on port ${old.currentPort}`)
      await stopProcess({ child: old.process, port: old.currentPort })
    }
  }

  function setAppRuntime(
    name: string,
    ac: AppConfig,
    logs: string[],
    overrides: Partial<AppRuntime['status']>,
  ) {
    apps.set(name, {
      config: ac,
      status: { name, ...overrides } as any,
      logs,
      process: null,
      currentPort: overrides.port ?? ac.port,
      startedAt: null,
      restartCount: 0,
      restartTimer: undefined,
    })
  }

  // ── Init all apps ──────────────────────────────────────────────────

  for (const name of Object.keys(config.apps)) {
    await initApp(name)
  }

  // ── Gateway + Manager ─────────────────────────────────────────────

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

  // ── SSL ────────────────────────────────────────────────────────────

  if (config.ssl) {
    ensureCertificates(config)
  }

  // ── Start ─────────────────────────────────────────────────────────

  httpServer = serve(fullHandler, {
    port: config.port,
    websocket: gw.wsHandler,
  })

  const portSuffix = config.port !== 80 ? `:${config.port}` : ''

  return {
    stop: async () => {
      for (const [, app] of apps) {
        if (app.restartTimer) clearTimeout(app.restartTimer)
        if (app.process) {
          await stopProcess({ child: app.process, port: app.currentPort })
        }
      }
      httpServer?.stop()
    },
    ready: httpServer.ready,
    url: `http://${config.domain}${portSuffix}`,
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

// ── SSL helpers ──────────────────────────────────────────────────────

function ensureCertificates(config: DeployConfig): void {
  const { domain, ssl } = config
  if (!ssl) return

  const certDir = '/etc/weifuwu/ssl'
  const certPath = path.join(certDir, `${domain}.pem`)
  const keyPath = path.join(certDir, `${domain}-key.pem`)

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
  }

  const acmeHome = path.join(certDir, '.acme.sh')

  try {
    execSync('which acme.sh', { stdio: 'pipe' })
  } catch {
    // Install acme.sh
    execSync(
      `curl -s https://get.acme.sh | sh -s email=${ssl.email}`,
      { stdio: 'pipe', timeout: 60_000 },
    )
  }

  const subdomains = Object.values(config.apps)
    .filter((a) => a.subdomain)
    .map((a) => `${a.subdomain}.${domain}`)
    .join(',')

  const allDomains = subdomains ? `${domain},${subdomains}` : domain

  const acmeSh = path.join(acmeHome, 'acme.sh')
  const staging = ssl.staging ? ' --staging' : ''

  execSync(
    `${acmeSh} --issue -d ${allDomains} --standalone${staging} ` +
    `--cert-file ${certPath} --key-file ${keyPath}`,
    { stdio: 'pipe', timeout: 120_000 },
  )

  execSync(
    `${acmeSh} --install-cronjob`,
    { stdio: 'pipe', timeout: 30_000 },
  )
}
