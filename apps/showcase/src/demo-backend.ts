/**
 * showcase 后端活体端点——14 项后端能力中第一批 8 项的真实演示
 *
 * 自举纪律：全部用 weifuwu 自身能力实现（MemorySql/MemoryRedis/rateLimit/queue/
 * makeExecutableSchema/Router 路由）——"接口与实现分离"的活体教材：
 * 演示用内存实现（零 docker），文档诚实标注"真实部署换 postgres()/redis() 一行代码"。
 */
import { createMemoryOrm, MemoryRedis, queue, rateLimit } from '../../../src/server/index.ts'
import type { Router, Context } from '../../../src/server/index.ts'

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

export function installDemoBackend(app: Router, ctx: Context): void {
  // ── 内存引擎（演示——契约层：真实部署换 postgres()/redis()） ──
  const { orm: sqlOrm, mem } = createMemoryOrm()
  const redis = new MemoryRedis()
  const q = queue({ redis })
  ctx.redis = redis as any
  ctx.queue = q.queue

  // 1. router — 路由/参数/方法自证（showcase 自身就是活体）
  app.get('/api/demo/router', (req: Request, c: any): Response =>
    json({ path: req.url?.split('?')[0], method: req.method, params: c.params, note: 'Trie 路由 + :id 参数注入' }))

  // 2. sql — MemorySql 查询（AST → 内存直执行——协议层 = AST；生产换 postgres() orm）
  app.get('/api/demo/sql', async (req: Request): Promise<Response> => {
    mem.executeQuery({ kind: 'ddl', op: 'createTable', table: 'demo_items', ifNotExists: true, columns: [
      { name: 'id', type: 'SERIAL', pk: true, unique: false, defaultNow: false, defaultUuid: false },
      { name: 'name', type: 'TEXT', pk: false, unique: false, defaultNow: false, defaultUuid: false },
      { name: 'done', type: 'BOOLEAN', pk: false, unique: false, defaultNow: false, defaultUuid: false },
    ] } as never)
    const rows = await sqlOrm.query.from('demo_items').orderBy('id').limit(5).run()
    return json({ engine: 'MemorySql（演示）——生产换 postgres()', rows })
  })
  app.post('/api/demo/sql', async (req: Request): Promise<Response> => {
    const { name } = await req.json()
    const rows = await sqlOrm.query.insert('demo_items').rows([{ name: String(name ?? '任务'), done: false }]).returning('id').run()
    return json({ inserted: rows[0]?.id }, 201)
  })

  // 3. redis — MemoryRedis 计数（缓存/计数演示）
  app.get('/api/demo/redis', async (req: Request): Promise<Response> => {
    const n = await redis.incr('demo:counter')
    const cached = await redis.get('demo:greeting')
    if (!cached) {
      await redis.set('demo:greeting', '来自 ctx.redis 的缓存问候', 3600)
    }
    return json({ engine: 'MemoryRedis（演示）——生产换 redis()', counter: Number(n), greeting: await redis.get('demo:greeting') })
  })

  // 4. limit — rateLimit（轻阈值 5 次/分钟——演示 429）
  const limitMw = rateLimit({ redis, windowMs: 60_000, max: 5, message: '演示限流：1 分钟最多 5 次（生产阈值自行配置）' })
  app.get('/api/demo/limit', limitMw, (req: Request): Response =>
    json({ ok: true, note: '限流通过——第 6 次请求将返回 429' }))

  // 5. email — Mailer 契约（内存捕获回显）
  const sentEmails: { to: string; subject: string; text: string }[] = []
  ctx.email = {
    send: async (msg: any) => {
      sentEmails.push({ to: msg.to, subject: msg.subject ?? '', text: msg.text ?? '' })
      return { accepted: true }
    },
  }
  app.get('/api/demo/email', async (req: Request): Promise<Response> => {
    const msg = { to: 'user@example.com', subject: '演示邮件', text: 'ctx.email 契约——Mailer 接口，适配器可换（SMTP/Resend/自定义）' }
    await ctx.email!.send(msg)
    return json({ engine: 'Mailer 契约（内存捕获）', sent: sentEmails[sentEmails.length - 1], total: sentEmails.length })
  })

  // 6. queue — 任务队列（Redis streams：XADD 入队）
  app.post('/api/demo/queue', async (req: Request): Promise<Response> => {
    const { task } = await req.json()
    const { id } = await q.queue.add('demo-jobs', { task: String(task ?? '演示任务'), at: new Date().toISOString() })
    return json({ enqueued: id, note: 'queue({ redis })——XADD 入队，worker 阻塞读（模式 A 显式注入）' }, 201)
  })
  app.get('/api/demo/queue', async (req: Request): Promise<Response> => {
    const len = await q.queue.length('demo-jobs')
    return json({ queue: 'demo-jobs', pending: len })
  })

  // 7. cron — 定时任务（演示：每 30s 计数——生产用 ctx.schedule/cron 表达式）
  let cronTick = 0
  setInterval(() => { cronTick++ }, 30_000)
  app.get('/api/demo/cron', (req: Request): Response =>
    json({ ticks: cronTick, note: '演示用 setInterval；生产：ctx.schedule(\'*/30 * * * * *\', fn) 或 ctx.cron 注册' }))

  // 8. graphql — 框架原生端点（app.graphql——SDL + resolvers 绑定）
  app.graphql('/api/demo/graphql', async () => ({
    schema: `
      type Query { hello: String, add(a: Int!, b: Int!): Int! }
    `,
    resolvers: {
      Query: {
        hello: () => 'Hello from weifuwu GraphQL',
        add: (_: any, { a, b }: { a: number; b: number }) => a + b,
      },
    },
  }))

  // 9. WebSocket echo（实时能力——handler 对象形式：open/message/close）
  app.ws('/ws/echo', {
    message: (socket, _ctx, data) => {
      socket.send(`echo: ${data.toString()}`)
    },
  })
}
