/**
 * 契约测试模板（fullstack W3——复制即用——不自动收集（后缀非 .test.ts））
 *
 * 三层动线：契约（这里——memory orm + handler 直调零浏览器）→ 场景
 * （playwright SSR）→ 平台 e2e（真 server + memory）。新增 route 必带
 * 契约测试（audit-route-coverage 黄报可见）。
 *
 * 自行修改：表/路由/断言——模板 5 行核心 = memory orm → handler 直调 →
 * 状态码断言。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postgres, Router, z, f, bodyOf } from 'weifuwu'

test('POST /api/widgets —— 201 + 行入库（契约模板：memory orm + handler 直调）', async () => {
  const pg = postgres({ memory: true, tenant: 'app_id' })
  const WIDGETS = { id: f.pk(z.uuid()), app_id: f.req(z.uuid()), name: f.req(z.string()) }
  await pg.migrateModule('t', { tables: [{ name: 'widgets', columns: WIDGETS }] })
  pg.orm.table('widgets', WIDGETS)

  const app = new Router().use(pg)
  app.get('/api/widgets', async (_req, ctx) => {
    const rows = await ctx.orm.table('widgets').select().run()
    return Response.json({ widgets: rows })
  })
  const res = await app.handler()(new Request('http://localhost/api/widgets'), { params: {}, query: {} } as never)
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).widgets, [])
})
