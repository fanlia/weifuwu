/**
 * W5 试点契约：平台 agents 的 GraphQL 面（/api/gql——gqlFromShape 第二消费者）
 *
 * 平台 0 消费 → 试点判据：agents 表 gql 面（SDL/resolvers 自动生成）——
 * 验证：路由挂载（app.graphql）· 租户 scope（contextValue appId → 自动隔离）·
 * webhook_secret fieldPolicy.hidden 豁免 · insert 自动 id + app_id 注入。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
import type { AppCtx } from '../src/middleware/ctx.ts'

let pg: ReturnType<typeof postgres>
let handle: (req: Request, ctx: Partial<AppCtx>) => Promise<Response>

const A1 = 'a1000000-0000-4000-8000-000000000001'
const A2 = 'a2000000-0000-4000-8000-000000000002'

function gql(query: string, appId: string): Promise<Response> {
  return handle(new Request('http://localhost/api/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }), { params: {}, query: {}, appId, user: { id: 'u1' } } as never)
}

before(async () => {
  pg = postgres({ memory: true, tenant: { field: 'app_id', value: (c) => (c as { appId?: string })?.appId } })
  await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
  const { SHAPES } = await import('../src/db/shapes.ts')
  pg.orm.table('agents', SHAPES.agents as never)

  const { Router } = await import('weifuwu')
  const app = new Router()
  app.use(pg)
  // 试点：/api/gql 挂 agents 的 gql 面（hidden: webhook_secret——敏感列豁免）
  const agentGql = pg.orm.gql(pg.orm.table('agents'), { hidden: ['webhook_secret'] })
  app.graphql('/api/gql', async (req, ctx) => ({
    schema: agentGql.typeDefs,
    resolvers: agentGql.resolvers,
    context: () => ({ orm: (ctx as AppCtx).orm, appId: (ctx as AppCtx).appId }),
  }))
  handle = app.handler()

  // 播种（agent-one/agent-two 两租户）
  const base = pg.orm.table('agents') as never as { insert: (v: Record<string, unknown>[]) => { run: () => Promise<unknown> } }
  await base.insert([
    { app_id: A1, type: 'ai', name: 'agent-one', webhook_secret: 'SECRET-1' },
    { app_id: A2, type: 'ai', name: 'agent-two', webhook_secret: 'SECRET-2' },
  ]).run()
})

after(async () => { await pg.close().catch(() => {}) })

describe('W5 平台 gql 试点（agents——第二消费者）', () => {
  it('agentsList：租户 scope（app-1 只见 agent-one——app_id 自动注入）', async () => {
    const res = await gql('{ agentsList { name type } }', A1)
    assert.equal(res.status, 200)
    const body = await res.json() as { data?: { agentsList: { name: string }[] }; errors?: { message: string }[] }
    assert.deepEqual(body.data?.agentsList.map((x) => x.name), ['agent-one'])
  })

  it('webhook_secret hidden 豁免：SDL 不生成字段（敏感列不可查询）', async () => {
    const { data, errors } = (await gql('{ agentsList { name webhook_secret } }', A1).then((r) => r.json())) as { data?: unknown; errors?: { message: string }[] }
    assert.ok(errors?.length || data === null, '未知字段 → GraphQL 层错误（字段不存在）')
    const res = await gql('{ agentsList { name } }', A1)
    const body = await res.json() as { data?: { agentsList: Record<string, unknown>[] } }
    assert.ok(!('webhook_secret' in body.data!.agentsList[0]), '返回不含 secret')
  })

  it('agentsInsert：自动 id + app_id 注入（enum 字面量输入——scope 行归属 app-1）', async () => {
    const res = await gql('mutation { agentsInsert(data: { type: ai, name: "agent-new" }) { id name } }', A1)
    assert.equal(res.status, 200)
    const body = await res.json() as { data?: { agentsInsert: { id: string; name: string } }; errors?: { message: string }[] }
    assert.ok(body.data?.agentsInsert.id, 'f.pk 自动生成 id')
    assert.equal(body.data?.agentsInsert.name, 'agent-new')
    const other = await gql('{ agentsList { name } }', A2)
    const ob = await other.json() as { data?: { agentsList: { name: string }[] } }
    assert.deepEqual(ob.data?.agentsList.map((x) => x.name), ['agent-two'], 'app-2 不可见 app-1 新插入')
  })

  it('字段校验：非法枚举值（SDL 静态面——输入校验错误）', async () => {
    const res = await gql('mutation { agentsInsert(data: { type: robot, name: "bad" }) { id } }', A1)
    const body = await res.json() as { errors?: { message: string }[]; data?: unknown }
    assert.ok(body.errors?.length, '枚举校验错误')
  })
})
