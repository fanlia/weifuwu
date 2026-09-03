/**
 * 视频生成工具契约测试（generate_video / video_generation_status——异步两段式）
 *
 * 锁定：
 *  - 注册面：BUILTIN_TOOL_DEFS 含两个工具 + registry handler 可调
 *  - 创建契约：POST {MAAS_URL}/api/v1/services/aigc/video-generation/video-synthesis
 *    + X-DashScope-Async: enable + Bearer key + model happyhorse-1.1-t2v +
 *    input.prompt + parameters（resolution/ratio/duration 默认与夹紧）
 *    → task_id → video_tasks 行（pending）→ 队列入队（video-task.poll）
 *  - 后台轮询契约：GET {MAAS_URL}/api/v1/tasks/{task_id}（Bearer）——
 *    RUNNING → 睡 interval → 续链（re-add）；SUCCEEDED → 下载视频落盘
 *    /ws/{dept}/{filename} + 行 succeeded；FAILED → 行 failed + error
 *  - 查询面：getVideoTask 按 task_id + app_id；describeVideoTask 文案
 *  - 错误路径：无队列（REDIS_URL 未配置——提交前拒绝防白花钱）/HTTP 400/
 *    响应无 task_id/无部门上下文
 */
import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { postgres } from 'weifuwu'
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'
import {
  createVideoTask, handleVideoPoll, getVideoTask, describeVideoTask,
} from '../src/tools/video-gen.ts'

const WS_ROOT = await mkdtemp(join(tmpdir(), 'vid-ws-'))
process.env.DASHSCOPE_MAAS_API_URL = 'llm-test.maas.aliyuncs.com'
process.env.DASHSCOPE_API_KEY = 'sk-test'
process.env.AGENT_WORKSPACE_ROOT = WS_ROOT
process.env.VIDEO_POLL_INTERVAL_MS = '1' // 测试提速（生产默认 15s）

const APP_ID = '00000000-0000-0000-0000-000000000001'
const APP_OTHER = '00000000-0000-0000-0000-000000000099'
const DEPT = '00000000-0000-0000-0000-000000000050'
const AGENT_ID = '00000000-0000-0000-0000-000000000051'
const MP4_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3])
const VIDEO_URL = 'https://oss.example.com/video.mp4?Expires=999&Signature=x'

let pg: any

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_video_test', { max: 3, closeTimeout: 1 })
  await pg.sql.unsafe('DROP TABLE IF EXISTS video_tasks CASCADE')
  // W5 通知链路最小表（FK 链：messages ↔ departments/agents——同 chat 语义）
  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS departments (id UUID PRIMARY KEY, app_id UUID NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (id UUID PRIMARY KEY, app_id UUID NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id UUID NOT NULL REFERENCES departments(id),
      sender_id UUID NOT NULL REFERENCES agents(id),
      content TEXT NOT NULL,
      msg_type TEXT NOT NULL DEFAULT 'text',
      ai_approved BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pg.sql`INSERT INTO departments (id, app_id, name) VALUES (${DEPT}, ${APP_ID}, '测试部') ON CONFLICT (id) DO NOTHING`
  await pg.sql`INSERT INTO agents (id, app_id, type, name) VALUES (${AGENT_ID}, ${APP_ID}, 'ai', '视频助手') ON CONFLICT (id) DO NOTHING`
})
after(async () => {
  if (pg) await pg.close()
  await rm(WS_ROOT, { recursive: true, force: true })
})

/** provider 面替身（编排测试不触 dashscope 协议——契约见 src/ai/multimodal.test.ts） */
function fakeAi(overrides: Record<string, unknown> = {}) {
  return {
    createVideoTask: async () => ({ taskId: TASK_MAIN }),
    videoStatus: async (taskId: string) => ({ status: 'running' }),
    ...overrides,
  }
}

function ctx(extra: Record<string, unknown> = {}) {
  return { sql: pg.sql, appId: APP_ID, ai: fakeAi(), ...extra } as any
}

/** 伪队列：捕获入队 payload（不消费） */
function fakeQueue(): { q: any; jobs: any[] } {
  const jobs: any[] = []
  return { q: { add: async (_name: string, data: unknown) => { jobs.push(data) } }, jobs }
}



/** 轮询面替身：ai.videoStatus 返回契约状态（fetch 仅处理下载 URL） */
function mockPoll(status: 'running' | 'pending' | 'done' | 'failed', opts: { taskId?: string; videoUrl?: string; error?: string } = {}) {
  if (status === 'done') {
    mock.method(globalThis, 'fetch', async (url: unknown) => {
      const u = String(url)
      if (u.includes('oss.example.com')) return new Response(new Uint8Array(MP4_BYTES))
      throw new Error(`非预期请求: ${u}`)
    })
  }
  return fakeAi({
    videoStatus: async () => status === 'done'
      ? { status: 'done', url: opts.videoUrl ?? VIDEO_URL }
      : status === 'failed'
        ? { status: 'failed', error: opts.error ?? '生成失败' }
        : { status },
  })
}

const TASK_MAIN = '0385dc79-5ff8-4d82-bcb6-0000000000aa'
const TASK_RUNNING = '0385dc79-5ff8-4d82-bcb6-0000000000bb'
const TASK_DONE = '0385dc79-5ff8-4d82-bcb6-0000000000cc'
const TASK_FAIL = '0385dc79-5ff8-4d82-bcb6-0000000000dd'

async function insertRow(taskId: string, filename = 'x.mp4'): Promise<string> {
  const [row] = await pg.sql`INSERT INTO video_tasks (app_id, department_id, task_id, prompt, status, filename)
    VALUES (${APP_ID}, ${DEPT}, ${taskId}, 'p', 'pending', ${filename}) RETURNING id`
  return String(row.id)
}

test('def 注册面：BUILTIN_TOOL_DEFS 含 generate_video + video_generation_status', () => {
  const gen = BUILTIN_TOOL_DEFS.find((d) => d.function.name === 'generate_video')
  const st = BUILTIN_TOOL_DEFS.find((d) => d.function.name === 'video_generation_status')
  assert.ok(gen, 'generate_video def 存在')
  assert.ok(st, 'video_generation_status def 存在')
  assert.ok(gen.function.parameters.required.includes('prompt'))
  assert.ok(st.function.parameters.required.includes('task_id'))
})

test('创建编排：ctx.ai.createVideoTask 被调（参数归一）+ 行落库 + 队列入队', async () => {
  const calls: Array<Record<string, unknown>> = []
  const { q, jobs } = fakeQueue()
  const aiStub = fakeAi({ createVideoTask: async (req: any) => { calls.push(req); return { taskId: TASK_MAIN } } })
  try {
    const out = await createVideoTask(ctx({ queue: q, ai: aiStub }), { prompt: '一只纸箱做的小狗在奔跑', departmentId: DEPT, filename: 'dog.mp4' })
    assert.equal(out.taskId, TASK_MAIN)
    assert.deepEqual(calls[0], { prompt: '一只纸箱做的小狗在奔跑', resolution: undefined, ratio: undefined, duration: undefined, watermark: undefined }, '编排透传原始——归一在 provider 层')
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].taskId, TASK_MAIN)
    assert.equal(jobs[0].filename, 'dog.mp4')
    const row = await getVideoTask(ctx(), TASK_MAIN)
    assert.ok(row, '行已落库')
    assert.equal(row!.status, 'pending')
  } finally {
    mock.restoreAll()
  }
})

test('参数透传 + 自动命名：原始值交 provider（归一契约见 multimodal.test）', async () => {
  const calls: Array<Record<string, unknown>> = []
  const { q, jobs } = fakeQueue()
  const aiStub = fakeAi({ createVideoTask: async (req: any) => { calls.push(req); return { taskId: TASK_MAIN + '1' } } })
  try {
    await createVideoTask(ctx({ queue: q, ai: aiStub }), { prompt: '海浪', resolution: '4K', ratio: '4:3', duration: 99, departmentId: DEPT })
    assert.equal(calls[0].resolution, '4K', '透传原始——归一在 provider')
    assert.equal(calls[0].ratio, '4:3')
    assert.equal(calls[0].duration, 99)
    assert.match(jobs[0].filename, /^ai-video-\d+-[0-9a-f]{8}\.mp4$/)
  } finally {
    mock.restoreAll()
  }
})

test('后台轮询编排：running → 续链（interval 后 re-add）——行状态同步', async () => {
  const { q, jobs } = fakeQueue()
  const rowId = await insertRow(TASK_RUNNING)
  try {
    await handleVideoPoll({ rowId, appId: APP_ID, taskId: TASK_RUNNING, prompt: 'p', filename: 'x.mp4', departmentId: DEPT, agentId: '' }, ctx({ ai: mockPoll('running') }), q)
    assert.equal(jobs.length, 1, 'running → 续链一次')
    const row = await getVideoTask(ctx(), TASK_RUNNING)
    assert.equal(row!.status, 'running')
  } finally {
    mock.restoreAll()
  }
})

test('后台轮询：done → 下载视频落盘 /ws/{dept}/{filename} + 行 succeeded + path', async () => {
  const aiStub = mockPoll('done', { taskId: TASK_DONE, videoUrl: VIDEO_URL })
  const { q, jobs } = fakeQueue()
  const rowId = await insertRow(TASK_DONE, 'dog.mp4')
  try {
    await handleVideoPoll({ rowId, appId: APP_ID, taskId: TASK_DONE, prompt: 'p', filename: 'dog.mp4', departmentId: DEPT, agentId: '' }, ctx({ ai: aiStub }), q)
    assert.equal(jobs.length, 0, '终态不续链')
    const saved = await readFile(join(WS_ROOT, DEPT, 'dog.mp4'))
    assert.deepEqual(saved, MP4_BYTES, '视频字节落盘部门工作区')
    const r = await getVideoTask(ctx(), TASK_DONE)
    assert.equal(r!.status, 'succeeded')
    assert.equal(r!.path, join(WS_ROOT, DEPT, 'dog.mp4'))
    assert.match(describeVideoTask(r!), /\/ws\/dog\.mp4/)
  } finally {
    mock.restoreAll()
  }
})

test('Memory 模拟交付：videoStatus done 返回 memory:// url → 占位字节落盘（替身契约）', async () => {
  // MemoryAi 模拟形态：url = memory://video/{prompt前8}——fetch 不可用——占位分支
  const aiStub = mockPoll('done', { taskId: TASK_DONE, videoUrl: 'memory://video/一只猫' })
  const { q, jobs } = fakeQueue()
  const rowId = await insertRow(TASK_DONE, 'mem.mp4')
  try {
    await handleVideoPoll({ rowId, appId: APP_ID, taskId: TASK_DONE, prompt: 'p', filename: 'mem.mp4', departmentId: DEPT, agentId: '' }, ctx({ ai: aiStub }), q)
    const saved = await readFile(join(WS_ROOT, DEPT, 'mem.mp4'))
    assert.equal(saved.toString(), 'memory-video:memory://video/一只猫', 'memory:// 占位字节落盘')
    const r = await getVideoTask(ctx(), TASK_DONE)
    assert.equal(r!.status, 'succeeded')
  } finally {
    mock.restoreAll()
  }
})

test('后台轮询：failed → 行 failed + error（不续链）', async () => {
  const aiStub = mockPoll('failed', { taskId: TASK_FAIL, error: 'InvalidParameter: The parameter is invalid.' })
  const { q, jobs } = fakeQueue()
  const rowId = await insertRow(TASK_FAIL)
  try {
    await handleVideoPoll({ rowId, appId: APP_ID, taskId: TASK_FAIL, prompt: 'p', filename: 'x.mp4', departmentId: DEPT, agentId: '' }, ctx({ ai: aiStub }), q)
    assert.equal(jobs.length, 0, 'failed 终态不续链')
    const r = await getVideoTask(ctx(), TASK_FAIL)
    assert.equal(r!.status, 'failed')
    assert.match(r!.error ?? '', /InvalidParameter/)
  } finally {
    mock.restoreAll()
  }
})

test('W5 完成通知：done + agentId → messages 落库（agent 身份）+ broadcast new_message', async () => {
  const aiStub = mockPoll('done', { taskId: TASK_DONE + 'n', videoUrl: VIDEO_URL })
  const { q, jobs } = fakeQueue()
  const rowId = await insertRow(TASK_DONE + 'n', 'notify.mp4')
  const broadcasts: any[] = []
  const msg = { broadcast: (ch: string, ev: any) => broadcasts.push({ ch, ev }) }
  try {
    await handleVideoPoll({ rowId, appId: APP_ID, taskId: TASK_DONE + 'n', prompt: 'p', filename: 'notify.mp4', departmentId: DEPT, agentId: AGENT_ID }, ctx({ msg, ai: aiStub }), q)
    const [m] = await pg.sql`SELECT * FROM messages WHERE department_id = ${DEPT} ORDER BY created_at DESC LIMIT 1`
    assert.ok(m, '通知消息已落库')
    assert.equal(String(m.sender_id), AGENT_ID)
    assert.match(String(m.content), /\/ws\/notify\.mp4/)
    assert.equal(broadcasts.length, 1, '广播一次 new_message')
    assert.equal(broadcasts[0].ch, DEPT)
    assert.equal(broadcasts[0].ev.type, 'new_message')
    assert.equal(broadcasts[0].ev.message.sender_type, 'ai')
    assert.equal(broadcasts[0].ev.message.sender_name, '视频助手')
  } finally {
    mock.restoreAll()
  }
})

test('查询面：task_id + app_id 归属过滤（他租户查不到）', async () => {
  const row = await getVideoTask(ctx(), TASK_MAIN)
  assert.ok(row, '本租户可见')
  const other = await getVideoTask(ctx({ appId: APP_OTHER }), TASK_MAIN)
  assert.equal(other, null, '跨租户不可见')
})

test('错误路径：无队列/无部门/HTTP 400/响应无 task_id', async () => {
  // 队列缺失（REDIS_URL 未配置）→ 提交前拒绝（防白花钱）
  await assert.rejects(() => createVideoTask(ctx(), { prompt: 'x', departmentId: DEPT }), /REDIS_URL/)
  // 无部门上下文
  const { q } = fakeQueue()
  await assert.rejects(() => createVideoTask(ctx({ queue: q }), { prompt: 'x' }), /部门工作区/)
  // provider 抛错（HTTP 400/无 task_id——契约见 multimodal.test——编排透传）
  const aiErr = fakeAi({ createVideoTask: async () => { throw new Error('视频任务创建失败 HTTP 400: bad') } })
  await assert.rejects(() => createVideoTask(ctx({ queue: q, ai: aiErr }), { prompt: 'x', departmentId: DEPT }), /HTTP 400/)
})

test('handler 注册面：registry 可调——返回含 task_id + video_generation_status 指引', async () => {
  const aiStub = fakeAi({ createVideoTask: async () => ({ taskId: TASK_MAIN + 'h' }) })
  registerBuiltinTools(() => ctx({ queue: fakeQueue().q, ai: aiStub }))
  const handler = getToolHandler('generate_video') as unknown as (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => Promise<string>
  assert.ok(handler, 'generate_video handler 已注册')
  try {
    const r = await handler({ prompt: '测试', filename: 'h.mp4' }, { departmentId: DEPT })
    assert.match(r, /task_id=.*h/)
    assert.match(r, /video_generation_status/)
    const statusHandler = getToolHandler('video_generation_status') as unknown as (args: Record<string, unknown>) => Promise<string>
    const s = await statusHandler({ task_id: TASK_MAIN })
    assert.match(s, /排队中|生成中|已生成|失败|取消|过期/)
  } finally { mock.restoreAll() }
})
