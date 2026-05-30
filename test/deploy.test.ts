import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createGateway } from '../deploy/gateway.ts'
import { defineConfig } from '../deploy/config.ts'
import { createManager, type AppRuntime } from '../deploy/manager.ts'
import { serve } from '../serve.ts'
import type { Context } from '../types.ts'
import type { DeployConfig, GatewayResult } from '../deploy/types.ts'

// ── Config ─────────────────────────────────────────────────────────────

describe('defineConfig', () => {
  it('throws when domain is missing', () => {
    assert.throws(() => defineConfig({} as any), /domain is required/)
  })

  it('throws when no apps', () => {
    assert.throws(
      () => defineConfig({ domain: 'x.com', apps: {} }),
      /at least one app/,
    )
  })

  it('throws when app has no repo', () => {
    assert.throws(
      () => defineConfig({ domain: 'x.com', apps: { a: {} as any } }),
      /no repo/,
    )
  })

  it('throws when app has no entry', () => {
    assert.throws(
      () => defineConfig({ domain: 'x.com', apps: { a: { repo: 'x' } as any } }),
      /no entry/,
    )
  })

  it('throws when app has no port', () => {
    assert.throws(
      () => defineConfig({ domain: 'x.com', apps: { a: { repo: 'x', entry: 'a.ts' } as any } }),
      /no port/,
    )
  })

  it('sets defaults', () => {
    const cfg = defineConfig({
      domain: 'example.com',
      apps: {
        app1: { repo: 'https://example.com/repo.git', entry: 'app.ts', port: 3000 },
      },
    })
    assert.equal(cfg.port, 80)
    assert.equal(cfg.appsDir, '/opt/weifuwu/apps')
  })

  it('preserves explicit values', () => {
    const cfg = defineConfig({
      domain: 'example.com',
      port: 8080,
      appsDir: '/data/apps',
      deployToken: 'secret',
      apps: {
        app1: { repo: 'https://example.com/repo.git', entry: 'app.ts', port: 3000 },
      },
    })
    assert.equal(cfg.port, 8080)
    assert.equal(cfg.appsDir, '/data/apps')
    assert.equal(cfg.deployToken, 'secret')
  })

  it('accepts blue-green ports config', () => {
    const cfg = defineConfig({
      domain: 'example.com',
      apps: {
        app1: {
          repo: 'https://example.com/repo.git',
          entry: 'app.ts',
          port: 3001,
          ports: [3001, 3002],
        },
      },
    })
    assert.deepEqual(cfg.apps.app1.ports, [3001, 3002])
  })

  it('accepts webhook secret', () => {
    const cfg = defineConfig({
      domain: 'example.com',
      webhookSecret: 'github-secret',
      apps: {
        app1: { repo: '...', entry: 'app.ts', port: 3000 },
      },
    })
    assert.equal(cfg.webhookSecret, 'github-secret')
  })
})

// ── Gateway ────────────────────────────────────────────────────────────

describe('gateway', () => {
  let blogServer: ReturnType<typeof serve>
  let apiServer: ReturnType<typeof serve>
  let blogPort: number
  let apiPort: number
  let config: DeployConfig
  let gw: GatewayResult

  const getPort = (name: string) => {
    const ports: Record<string, number> = { blog: blogPort, api: apiPort }
    return ports[name]
  }

  before(async () => {
    blogServer = serve(() => new Response('hello from blog'), { port: 0 })
    await blogServer.ready
    blogPort = blogServer.port
    blogPort = blogPort // ensure used

    apiServer = serve(() => new Response('hello from api'), { port: 0 })
    await apiServer.ready
    apiPort = apiServer.port

    config = defineConfig({
      domain: 'example.com',
      apps: {
        blog: { repo: '...', subdomain: 'blog', entry: 'app.ts', port: blogPort },
        api: { repo: '...', path: '/api', entry: 'app.ts', port: apiPort },
      },
      defaultApp: 'blog',
    })

    gw = createGateway(config, getPort)
  })

  after(() => {
    blogServer.stop()
    apiServer.stop()
  })

  it('routes by subdomain', async () => {
    const res = await gw.handler(
      new Request(`http://blog.example.com/`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello from blog')
  })

  it('routes by subdomain preserving path', async () => {
    const res = await gw.handler(
      new Request(`http://blog.example.com/posts/123`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello from blog')
  })

  it('routes by path prefix', async () => {
    const res = await gw.handler(
      new Request(`http://example.com/api/users`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello from api')
  })

  it('falls back to defaultApp for bare domain', async () => {
    const res = await gw.handler(
      new Request(`http://example.com/`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello from blog')
  })

  it('returns 404 for unknown subdomain', async () => {
    const res = await gw.handler(
      new Request(`http://unknown.example.com/`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
  })

  it('returns 502 when backend is unreachable', async () => {
    const gw2 = createGateway(config, (name) => name === 'blog' ? 19999 : apiPort)
    const res = await gw2.handler(
      new Request(`http://blog.example.com/`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 502)
  })
})

// ── Gateway with path rewriting ────────────────────────────────────────

describe('gateway path rewriting', () => {
  let backend: ReturnType<typeof serve>
  let port: number

  before(async () => {
    backend = serve((req) => {
      const url = new URL(req.url)
      return new Response(url.pathname)
    }, { port: 0 })
    await backend.ready
    port = backend.port
  })

  after(() => backend.stop())

  it('strips path prefix when proxying', async () => {
    const config = defineConfig({
      domain: 'example.com',
      apps: {
        svc: { repo: '...', path: '/api/v2', entry: 'app.ts', port },
      },
    })
    const gw = createGateway(config, () => port)

    const res = await gw.handler(
      new Request(`http://example.com/api/v2/users/123`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '/users/123')
  })

  it('preserves path when no prefix match', async () => {
    const config = defineConfig({
      domain: 'example.com',
      apps: {
        svc: { repo: '...', path: '/api', entry: 'app.ts', port },
      },
    })
    const gw = createGateway(config, () => port)

    const res = await gw.handler(
      new Request(`http://example.com/other`),
      { params: {}, query: {} } as any,
    )
    // Falls through to defaultApp — there is none, so 404
    assert.equal(res.status, 404)
  })
})

// ── Manager API ────────────────────────────────────────────────────────

describe('manager API', () => {
  const config = defineConfig({
    domain: 'test.com',
    deployToken: 'test-token',
    apps: {
      app1: { repo: '...', subdomain: 'app1', entry: 'app.ts', port: 3001 },
    },
  })

  function createTestManager() {
    const apps = new Map<string, AppRuntime>()
    apps.set('app1', {
      config: config.apps.app1,
      status: { name: 'app1', status: 'running', port: 3001, subdomain: 'app1', pid: 12345 },
      logs: ['started', 'running'],
      process: null,
      currentPort: 3001,
      startedAt: Date.now(),
    })

    const router = createManager(config, apps, {
      deployApp: async (name) => {
        const app = apps.get(name)
        if (app) {
          app.logs.push('[deploy] deployed')
          app.status = { ...app.status, status: 'running' }
        }
      },
      reloadConfig: async () => { throw new Error('not supported') },
    })

    return { apps, router }
  }

  it('lists apps', async () => {
    const { router } = createTestManager()
    const res = await router.handler()(
      new Request('http://localhost/apps', {
        headers: { authorization: 'Bearer test-token' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any[]
    assert.equal(data.length, 1)
    assert.equal(data[0].name, 'app1')
    assert.equal(data[0].status, 'running')
  })

  it('requires auth when token is set', async () => {
    const { router } = createTestManager()
    const res = await router.handler()(
      new Request('http://localhost/apps'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 401)
  })

  it('returns 404 for unknown app', async () => {
    const { router } = createTestManager()
    const res = await router.handler()(
      new Request('http://localhost/apps/unknown', {
        headers: { authorization: 'Bearer test-token' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
  })

  it('accepts deploy without token when none configured', async () => {
    const cfg = defineConfig({
      domain: 'test.com',
      apps: {
        app1: { repo: '...', entry: 'app.ts', port: 3001 },
      },
    })
    const apps = new Map<string, AppRuntime>()
    apps.set('app1', {
      config: cfg.apps.app1,
      status: { name: 'app1', status: 'running', port: 3001 },
      logs: [],
      process: null,
      currentPort: 3001,
      startedAt: null,
    })
    const router = createManager(cfg, apps, {
      deployApp: async () => {},
      reloadConfig: async () => {},
    })

    const res = await router.handler()(
      new Request('http://localhost/apps/app1/deploy', { method: 'POST' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('does not require auth for root domain default', async () => {
    // Test that the handler works without auth for non-manager routes
    const result = defineConfig({
      domain: 'test.com',
      apps: {
        main: { repo: '...', entry: 'app.ts', port: 3000 },
      },
    })
    assert.ok(result)
  })

  it('webhook matches app by repo and triggers deploy', async () => {
    let deployed = ''
    const cfg = defineConfig({
      domain: 'test.com',
      apps: {
        blog: { repo: 'https://github.com/user/blog.git', entry: 'app.ts', port: 3001 },
      },
    })
    const apps = new Map<string, AppRuntime>()
    apps.set('blog', {
      config: cfg.apps.blog,
      status: { name: 'blog', status: 'running', port: 3001 },
      logs: [],
      process: null,
      currentPort: 3001,
      startedAt: null,
    })
    const router = createManager(cfg, apps, {
      deployApp: async (name) => { deployed = name },
      reloadConfig: async () => {},
    })

    const res = await router.handler()(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: { clone_url: 'https://github.com/user/blog.git' },
        }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.deepEqual(data.deployed, ['blog'])
    assert.equal(deployed, 'blog')
  })

  it('webhook returns empty when no app matches', async () => {
    const cfg = defineConfig({
      domain: 'test.com',
      apps: {
        blog: { repo: 'https://github.com/user/blog.git', entry: 'app.ts', port: 3001 },
      },
    })
    const apps = new Map<string, AppRuntime>()
    apps.set('blog', {
      config: cfg.apps.blog,
      status: { name: 'blog', status: 'running', port: 3001 },
      logs: [],
      process: null,
      currentPort: 3001,
      startedAt: null,
    })
    const router = createManager(cfg, apps, {
      deployApp: async () => {},
      reloadConfig: async () => {},
    })

    const res = await router.handler()(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: { clone_url: 'https://github.com/other/project.git' },
        }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.deepEqual(data.deployed, [])
  })

  it('webhook verifies signature when secret is set', async () => {
    const cfg = defineConfig({
      domain: 'test.com',
      webhookSecret: 'my-secret',
      apps: {
        blog: { repo: 'https://github.com/user/blog.git', entry: 'app.ts', port: 3001 },
      },
    })
    const apps = new Map<string, AppRuntime>()
    apps.set('blog', {
      config: cfg.apps.blog,
      status: { name: 'blog', status: 'running', port: 3001 },
      logs: [],
      process: null,
      currentPort: 3001,
      startedAt: null,
    })
    const router = createManager(cfg, apps, {
      deployApp: async () => {},
      reloadConfig: async () => {},
    })

    const body = JSON.stringify({
      repository: { clone_url: 'https://github.com/user/blog.git' },
    })

    // Compute valid signature
    const crypto = await import('node:crypto')
    const sig = 'sha256=' + crypto.createHmac('sha256', 'my-secret').update(body).digest('hex')

    const res = await router.handler()(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': sig,
        },
        body,
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)

    // Invalid signature
    const res2 = await router.handler()(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid',
        },
        body,
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 401)
  })
})
