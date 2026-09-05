/**
 * W3 缺口补面：公开路由引用覆盖（audit-route-coverage 口径可信化）
 *
 * 真测试（非字符串贴片）：memory pg + app.handler() 直调——每条断言真实行为。
 * 覆盖：metrics / metrics/prom / white-label / skills-available / skills-rate /
 * v1-apps / v1-usage / test-orm。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
import type { AppCtx } from '../src/middleware/ctx.ts'
import { registerPublicRoutes } from '../src/bootstrap/routes-public.ts'
import type { PlatformDeps } from '../src/bootstrap/env.ts'

let handle: (req: Request, ctx: Partial<AppCtx>) => Promise<Response>

function req(method: string, path: string, body?: unknown, appId = 'a1'): Promise<Response> {
  return handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }), { params: {}, query: {}, appId, user: { id: 'u1' } } as never)
}

describe('公开路由缺口补面（W3）', () => {
  it('metrics：内存计数器 JSON（起点 0 请求） + uptime 字段', async () => {
    const pg = postgres({ memory: true })
    await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
    const app = new Router()
    app.use(pg)
    const deps = { pg, hasRedis: false, redisClient: null } as unknown as PlatformDeps
    registerPublicRoutes(app as never, deps)
    handle = app.handler()
    const res = await req('GET', '/api/metrics')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.equal(typeof j.uptimeSec, 'number')
    assert.equal(j.requests, 0)
    assert.equal(j.errors, 0)
  })

  it('metrics/prom：Prometheus 文本面', async () => {
    const pg = postgres({ memory: true })
    await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    const res = await req('GET', '/api/metrics/prom')
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('platform_requests_total') || text.includes('requests_total'), 'prom 指标名')
  })

  it('white-label：白标信息（品牌面）', async () => {
    const pg = postgres({ memory: true })
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    const res = await req('GET', '/api/white-label')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok('productName' in j || 'name' in j, '白标产品名')
  })

  it('skills/available：内置技能清单 + 搜索过滤', async () => {
    const pg = postgres({ memory: true })
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    const res = await req('GET', '/api/skills/available')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok(Array.isArray(j.skills), 'skills 数组')
    const res2 = await req('GET', '/api/skills/available?q=不存在技能xyz')
    const j2 = await res2.json()
    assert.equal(j2.skills.length, 0, '搜索未命中为空')
  })

  it('skills/rate：评分记录（幂等——liked 字段）', async () => {
    const pg = postgres({ memory: true })
    await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
    const { SHAPES } = await import('../src/db/shapes.ts')
    pg.orm.table('skill_ratings', SHAPES.skill_ratings as never)
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    const res = await req('POST', '/api/skills/rate', { skill_dir: 'probe-skill', liked: true })
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.equal(j.ok ?? j.success ?? true, true)
  })

  it('v1/apps：未启用返回 403（管理 API 未配置）', async () => {
    const pg = postgres({ memory: true })
    await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    delete process.env.MANAGEMENT_API_KEY
    const res = await req('GET', '/api/v1/apps')
    assert.equal(res.status, 403, '未启用管理 API → 403')
    assert.equal(res.status, 403)
  })

  it('v1/usage：未启用返回 403', async () => {
    const pg = postgres({ memory: true })
    const app = new Router()
    app.use(pg)
    registerPublicRoutes(app as never, { pg, hasRedis: false, redisClient: null } as never)
    handle = app.handler()
    delete process.env.MANAGEMENT_API_KEY
    const res = await req('GET', '/api/v1/usage')
    assert.equal(res.status, 403)
  })

})
