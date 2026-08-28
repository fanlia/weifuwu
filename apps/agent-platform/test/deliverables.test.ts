/**
 * /api/deliverables 契约测试（G1——ROADMAP B1 验收债清偿）
 *
 * 端点语义（src/routes/deliverables.ts）：当前 app 全部部门工作区扫描聚合——
 * 根层文件 + 一层子目录（深度 1）——隐藏文件过滤——50MB 占位拒绝——
 * mtime 降序——limit 夹紧——失败部门跳过——app_id 参数化隔离。
 *
 * 形态：路由处理器捕获（假 app）+ 真实文件系统（临时工作区）+ 假 sql
 * （tagged template 值捕获——断言 app_id 入参 = 隔离意图锁定）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, truncate, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { registerDeliverableRoutes } from '../src/routes/deliverables.ts'

interface Handler { (req: Request, ctx: any): Promise<Response> }

/** 假 app——捕获注册的路由处理器 */
function captureApp(): { handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>()
  const app = {
    get: (path: string, h: Handler) => { handlers.set(`GET ${path}`, h) },
    post: (path: string, h: Handler) => { handlers.set(`POST ${path}`, h) },
  }
  registerDeliverableRoutes(app)
  return { handlers }
}

/** 假 sql（tagged template——捕获插值参数——返回预置部门行） */
function makeSql(depts: Array<Record<string, unknown>>) {
  const captured: unknown[][] = []
  const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    captured.push(values)
    return Promise.resolve(depts)
  }
  return { sql, captured }
}

async function call(handlers: Map<string, Handler>, query: string, ctx: any): Promise<Response> {
  const h = handlers.get('GET /api/deliverables')
  assert.ok(h, 'GET /api/deliverables 已注册')
  return h!(new Request(`http://localhost/api/deliverables${query}`), ctx)
}

/** 临时工作区 + 预置文件（返回部门行列表） */
async function seedWorkspace(deptId: string, files: Array<{ rel: string; content?: string; size?: number; mtime?: Date }>): Promise<void> {
  for (const f of files) {
    const full = join(process.env.AGENT_WORKSPACE_ROOT!, deptId, f.rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, f.content ?? 'x')
    if (f.size !== undefined) await truncate(full, f.size) // 稀疏文件——瞬时造大文件
    if (f.mtime) await utimes(full, f.mtime, f.mtime)
  }
}

let wsRoot = ''

before(async () => {
  wsRoot = await mkdtemp(join(tmpdir(), 'ap-deliv-'))
  process.env.AGENT_WORKSPACE_ROOT = wsRoot
})

after(async () => {
  delete process.env.AGENT_WORKSPACE_ROOT
  await rm(wsRoot, { recursive: true, force: true })
})

test('G1a: 聚合 + mtime 降序 + 部门元信息', async () => {
  await seedWorkspace('d1', [
    { rel: 'old.md', content: 'old', mtime: new Date('2026-01-01T00:00:00Z') },
    { rel: 'new.md', content: 'new', mtime: new Date('2026-06-01T00:00:00Z') },
  ])
  const { sql } = makeSql([{ id: 'd1', name: '技术部', workspace_path: null }])
  const { handlers } = captureApp()
  const res = await call(handlers, '', { sql, appId: 'app-1' })
  assert.equal(res.status, 200)
  const { files } = await res.json()
  assert.equal(files.length, 2)
  assert.equal(files[0].name, 'new.md', 'mtime 降序（新在前）')
  assert.equal(files[1].name, 'old.md')
  assert.equal(files[0].deptId, 'd1')
  assert.equal(files[0].deptName, '技术部')
  assert.equal(files[0].path, 'new.md', '根层文件 path = 文件名')
  assert.ok(files[0].size > 0)
  assert.ok(files[0].mtime, 'mtime ISO 输出')
})

test('G1b: 隐藏文件过滤（. 前缀不列）', async () => {
  await seedWorkspace('d2', [
    { rel: 'visible.md', content: 'v' },
    { rel: '.hidden', content: 'h' },
    { rel: 'sub/.also-hidden', content: 'h' },
  ])
  const { sql } = makeSql([{ id: 'd2', name: 'D2', workspace_path: null }])
  const { handlers } = captureApp()
  const { files } = await (await call(handlers, '', { sql, appId: 'app-1' })).json()
  const names = files.map((f: any) => f.name)
  assert.deepEqual(names, ['visible.md'], '隐藏文件（根层 + 子目录）全部过滤')
})

test('G1c: 深度 1——子目录文件收录（路径前缀）+ 更深层排除', async () => {
  await seedWorkspace('d3', [
    { rel: 'outputs/report.md', content: 'r' },
    { rel: 'outputs/nested/deep.md', content: 'd' }, // 深度 2——排除
  ])
  const { sql } = makeSql([{ id: 'd3', name: 'D3', workspace_path: null }])
  const { handlers } = captureApp()
  const { files } = await (await call(handlers, '', { sql, appId: 'app-1' })).json()
  assert.equal(files.length, 1, '仅深度 1 子目录文件')
  assert.equal(files[0].path, 'outputs/report.md', '子目录文件 path = 子目录/文件名')
  assert.equal(files[0].name, 'report.md')
})

test('G1d: 50MB 占位拒绝（大文件不进统计面）', async () => {
  await seedWorkspace('d4', [
    { rel: 'big.bin', size: 50 * 1024 * 1024 + 1 },
    { rel: 'ok.md', content: 'ok' },
  ])
  const { sql } = makeSql([{ id: 'd4', name: 'D4', workspace_path: null }])
  const { handlers } = captureApp()
  const { files } = await (await call(handlers, '', { sql, appId: 'app-1' })).json()
  assert.deepEqual(files.map((f: any) => f.name), ['ok.md'], '>50MB 文件跳过')
})

test('G1e: limit 夹紧（默认 200——显式值生效）', async () => {
  await seedWorkspace('d5', [
    { rel: 'a.md', mtime: new Date('2026-03-01') },
    { rel: 'b.md', mtime: new Date('2026-02-01') },
    { rel: 'c.md', mtime: new Date('2026-01-01') },
  ])
  const { sql } = makeSql([{ id: 'd5', name: 'D5', workspace_path: null }])
  const { handlers } = captureApp()
  const { files } = await (await call(handlers, '?limit=2', { sql, appId: 'app-1' })).json()
  assert.deepEqual(files.map((f: any) => f.name), ['a.md', 'b.md'], 'limit=2 截断（mtime 降序头部）')
})

test('G1f: 多部门聚合 + 失败部门跳过（不炸整体）', async () => {
  await seedWorkspace('d6', [{ rel: 'from-d6.md' }])
  // d7 无目录——resolveDepartmentWorkspace 自动创建空目录 → 0 文件（非失败）；
  // d8 workspace_path 指向文件（readdir 失败）→ 跳过
  const badPath = join(wsRoot, 'not-a-dir')
  await writeFile(badPath, 'x')
  const { sql } = makeSql([
    { id: 'd6', name: 'D6', workspace_path: null },
    { id: 'd7', name: 'D7', workspace_path: null },
    { id: 'd8', name: 'D8', workspace_path: badPath },
  ])
  const { handlers } = captureApp()
  const res = await call(handlers, '', { sql, appId: 'app-1' })
  assert.equal(res.status, 200, '失败部门不炸整体')
  const { files } = await res.json()
  assert.deepEqual(files.map((f: any) => f.deptId), ['d6'], '仅存活部门产出')
})

test('G1g: 自定义 workspace_path 优先（部门级配置）', async () => {
  const custom = await mkdtemp(join(tmpdir(), 'ap-deliv-custom-'))
  await writeFile(join(custom, 'custom.md'), 'c')
  const { sql } = makeSql([{ id: 'd9', name: 'D9', workspace_path: custom }])
  const { handlers } = captureApp()
  const { files } = await (await call(handlers, '', { sql, appId: 'app-1' })).json()
  assert.deepEqual(files.map((f: any) => f.name), ['custom.md'])
  await rm(custom, { recursive: true, force: true })
})

test('G1h: 无部门 → 空列表；无 appId → 401', async () => {
  const { sql } = makeSql([])
  const { handlers } = captureApp()
  const empty = await call(handlers, '', { sql, appId: 'app-1' })
  assert.deepEqual(await empty.json(), { files: [] })

  const unauth = await call(handlers, '', { sql: makeSql([]).sql, appId: null })
  assert.equal(unauth.status, 401, '未认证拦截')
})

test('G1i: 租户隔离——app_id 以 ctx.appId 参数化（SQL 值捕获）', async () => {
  const { sql, captured } = makeSql([])
  const { handlers } = captureApp()
  await call(handlers, '', { sql, appId: 'app-isolated' })
  assert.ok(captured.length >= 1, '部门查询已执行')
  assert.ok(captured[0].includes('app-isolated'), 'app_id = ctx.appId 入参（隔离意图——防跨租户泄漏）')
})
