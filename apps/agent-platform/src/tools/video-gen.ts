/**
 * 视频生成工具（HappyHorse 文生视频——阿里云百炼异步任务）
 *
 * 异步两段式（文档红线——任务 1-5 分钟——禁止同步等待）：
 *   ① 创建任务：POST {DASHSCOPE_MAAS_API_URL}/api/v1/services/aigc/video-generation/video-synthesis
 *      （X-DashScope-Async: enable——缺失报错「不支持同步」）→ task_id（24h 有效——勿重复创建）
 *   ② 后台轮询：weifuwu 队列（video-task.poll——每 15s 一次——worker 自续链）→
 *      SUCCEEDED 下载 MP4 落盘部门工作区（/ws——交付物中心可见——与图片工具同模型）
 *
 * 状态行：video_tasks（工具 video_generation_status 查询面——无 DB 无查询）
 *
 * 边界（诚实裁剪）：
 *   - REDIS_URL 未配置（队列不可用）→ 提交前拒绝——任务一旦提交即计费——
 *     无人轮询 = 白花钱——宁可早失败（图片工具同步无此约束）
 *   - 轮询链：poll 瞬态失败由队列重试（attempts 5）——耗尽进 DLQ 链断——
 *     行停 pending——启动时 requeuePendingVideoTasks 重排兜底
 *   - 无部门上下文 → 拒绝（视频 URL 24h 过期——不落盘 = 白生成）
 */
import { randomUUID } from 'node:crypto'
import type { RowOf } from 'weifuwu'
import { SHAPES } from '../db/shapes.ts'
import type { AppCtx } from '../middleware/ctx.ts'
import { ops } from 'weifuwu'
import type { QueueClient, QueueWorker } from 'weifuwu'

export const VIDEO_POLL_QUEUE = 'video-task.poll'

// 参数归一在 provider 层（multimodal.ts——单源）——编排透传原始值
const DEFAULT_POLL_MS = 15_000

export interface VideoGenParams {
  prompt: string
  resolution?: string
  ratio?: string
  duration?: number
  watermark?: boolean
  filename?: string
  departmentId?: string
  /** 发起 agent（完成通知以它身份发部门消息） */
  agentId?: string
}

/** 轮询队列 payload（自续链——每轮新 job——attempts 清零） */
export interface VideoPollJob {
  rowId: string
  appId: string
  taskId: string
  prompt: string
  filename: string
  departmentId: string
  agentId: string
}

/** video_tasks 行类型——shape 单源派生（W2：手动接口与 shape 同步） */
export type VideoTaskRow = RowOf<typeof SHAPES.video_tasks>

// provider 面（2027-10 AI-REBUILD）：提交/查询走框架 ctx.ai
// （createVideoTask/videoStatus——multimodal.ts——单源 provider 插槽）；
// 本文件保留**编排面**：队列可用性检查 → DB 任务行 → 轮询 worker → 下载落盘 /ws。

/** 轮询间隔（测试可经 VIDEO_POLL_INTERVAL_MS 缩短——默认 15s 对齐文档建议） */
export function pollIntervalMs(): number {
  const n = Number(process.env.VIDEO_POLL_INTERVAL_MS)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_POLL_MS
}

/* ── 表（惰性自建——模块级缓存——调用面在服务内） ────────────── */

let tableEnsured = false
export async function ensureVideoTasksTable(_orm?: any): Promise<void> {
  // 建表已声明式化：video_tasks 属 AGENT_PLATFORM_SCHEMA（tables.ts）——由 server.ts
  // pg.migrateModule 启动迁移——此处仅幂等 no-op（历史调用面保留）
  tableEnsured = true
}

/* ── 步骤①：创建任务（队列可用性前置检查——防白花钱） ────────── */

export async function createVideoTask(ctx: AppCtx, opts: VideoGenParams): Promise<{ taskId: string; rowId: string }> {
  const ai = ctx.ai
  if (!ai) throw new Error('AI 中间件未注入（ctx.ai）——无法生成视频')
  const q = (ctx as any).queue as QueueClient | undefined
  if (!q) throw new Error('未启用后台任务队列（需要 REDIS_URL）——视频生成为异步任务（1-5 分钟）')
  const prompt = String(opts.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt 为必填——描述你想生成的视频画面')
  if (!opts.departmentId) throw new Error('无部门工作区上下文——无法保存生成视频——请通过部门 Agent 调用')
  // provider 面（框架 ctx.ai.createVideoTask——单源；参数归一在 provider 层）
  const { taskId } = await ai.createVideoTask({
    prompt,
    resolution: opts.resolution,
    ratio: opts.ratio,
    duration: opts.duration,
    watermark: opts.watermark,
  })

  const filename = pickFilename(opts.filename)
  await ensureVideoTasksTable(ctx.orm as any)
  const [row] = await ctx.orm.query.insert('video_tasks')
    .values({
      app_id: String(ctx.appId), department_id: opts.departmentId, task_id: taskId, prompt,
      status: 'pending', filename,
      params: { resolution: opts.resolution, ratio: opts.ratio, duration: opts.duration, watermark: opts.watermark },
    })
    .returning('*')
    .run()
  const job: VideoPollJob = {
    rowId: String((row as any).id), appId: ctx.appId, taskId,
    prompt, filename, departmentId: opts.departmentId, agentId: opts.agentId ?? '',
  }
  await q.add(VIDEO_POLL_QUEUE, job, { attempts: 5 })
  return { taskId, rowId: String((row as any).id) }
}

function pickFilename(name: string | undefined): string {
  const clean = (name ?? '').replace(/[^\w.\-\u4e00-\u9fa5]/g, '').slice(0, 80) ||
    `ai-video-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`
  return /\.mp4$/i.test(clean) ? clean : `${clean}.mp4`
}

/* ── 步骤②：后台轮询（weifuwu 队列 worker——自续链） ──────────── */



/** 单次轮询：非终态 → 睡 15s 后续链；SUCCEEDED → 下载落盘 /ws；终态 → 记行 */
export async function handleVideoPoll(job: VideoPollJob, ctx: AppCtx, q: QueueClient): Promise<void> {
  const ai = ctx.ai
  if (!ai) throw new Error('AI 中间件未注入（ctx.ai）——无法查询视频任务')
  const orm = ctx.orm
  const st = await ai.videoStatus(job.taskId)
  if (st.status === 'pending' || st.status === 'running') {
    await orm.query.update('video_tasks').set({ status: st.status, updated_at: ops.now() }).where({ id: { eq: job.rowId }}).run()
    await sleep(pollIntervalMs())
    await q.add(VIDEO_POLL_QUEUE, job, { attempts: 5 })
    return
  }
  if (st.status === 'done') {
    const bytes = await downloadVideo(st.url)
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const ws = await resolveDepartmentWorkspace(job.departmentId, null, true)
    if (!ws) {
      await orm.query.update('video_tasks').set({ status: 'failed', error: '部门工作区不可用——无法保存视频', updated_at: ops.now() }).where({ id: { eq: job.rowId }}).run()
      return
    }
    const dest = join(ws, job.filename)
    await writeFile(dest, bytes)
    await orm.query.update('video_tasks').set({ status: 'succeeded', path: dest, updated_at: ops.now() }).where({ id: { eq: job.rowId }}).run()
    console.log(`[video-gen] task ${job.taskId} 已生成并保存 ${dest}`)
    // W5 通知闭环：以发起 agent 身份发部门消息（失败不阻断——行已收口）
    try {
      await notifyVideoSucceeded(ctx, job)
    } catch (e) {
      console.error(`[video-gen] 完成通知失败（task ${job.taskId}）:`, (e as Error)?.message ?? e)
    }
    return
  }
  // failed——终态（不再续链——provider 已含错误原因）
  await orm.query.update('video_tasks').set({ status: 'failed', error: st.error ?? null, updated_at: ops.now() }).where({ id: { eq: job.rowId }}).run()
}

/** 下载视频字节：http(s) 真实 URL / data: base64 / memory://模拟占位（测试替身交付物） */
async function downloadVideo(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
  }
  if (src.startsWith('memory://')) {
    // Memory 模拟：确定性占位字节（替身交付物——真实视频不会走此分支）
    return Buffer.from(`memory-video:${src}`)
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`视频下载失败 HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** 完成通知：messages 落库（agent 身份）+ broadcast new_message（前端 Chat 消费面） */
async function notifyVideoSucceeded(ctx: AppCtx, job: VideoPollJob): Promise<void> {
  if (!job.agentId || !job.departmentId || !job.filename) return
  // 租户隔离（tenant-isolation 审计）：agents 查询带 app_id——跨应用 agentId 不可见
  const [agent] = await ctx.orm.query.from('agents').select('name').where({ id: { eq: String(job.agentId) }, app_id: { eq: String(job.appId) } }).limit(1).run()
  const agentName = String((agent as any)?.name ?? 'AI')
  const content = `🎬 视频生成完成：/ws/${job.filename}——已保存到部门共享目录（交付物中心可见）`
  const [m] = await ctx.orm.query.insert('messages')
    .values({ department_id: job.departmentId, sender_id: String(job.agentId), content, msg_type: 'text', ai_approved: true })
    .returning('id', 'created_at')
    .run()
  ;(ctx as any).msg?.broadcast?.(String(job.departmentId), {
    type: 'new_message',
    message: {
      id: String((m as any).id), departmentId: job.departmentId,
      sender_id: job.agentId, sender_name: agentName, sender_type: 'ai',
      content, msg_type: 'text', created_at: (m as any).created_at,
    },
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 队列 worker 工厂（server 启动：worker.start()——并发 1——visibility 60s > 睡 15s） */
export function createVideoPollWorker(q: QueueClient, getCtx: () => AppCtx): QueueWorker {
  return q.worker<VideoPollJob>(VIDEO_POLL_QUEUE, async (job) => {
    await handleVideoPoll(job.data, getCtx(), q)
  }, { concurrency: 1, visibilityTimeout: 60_000 })
}

/** 启动重排：处理完的链中断恢复（服务重启/DLQ/Redis 清空）——挂起行重新入队 */
export async function requeuePendingVideoTasks(orm: any, q: QueueClient): Promise<number> {
  await ensureVideoTasksTable(orm)
  const rows = (await orm.query.from('video_tasks').select().where({ status: { in: ['pending', 'running'] } }).run()) as any[]
  let n = 0
  for (const r of rows ?? []) {
    await q.add(VIDEO_POLL_QUEUE, {
      rowId: String(r.id), appId: String(r.app_id), taskId: String(r.task_id),
      prompt: String(r.prompt), filename: String(r.filename ?? ''),
      departmentId: String(r.department_id ?? ''), agentId: String(r.agent_id ?? ''),
    }, { attempts: 5 })
    n++
  }
  return n
}

/* ── 查询面（video_generation_status 工具） ──────────────────── */

export async function getVideoTask(ctx: AppCtx, taskId: string): Promise<VideoTaskRow | null> {
  await ensureVideoTasksTable(ctx.orm as any)
  const [row] = await ctx.orm.table('video_tasks', SHAPES.video_tasks).select().where({ task_id: { eq: taskId }, app_id: { eq: String(ctx.appId) } }).limit(1).run()
  return (row as unknown as VideoTaskRow | undefined) ?? null // W2: ensureVideoTasksTable 动态 schema（列面存在性由调用方保证）——登记 W3 typedQuery 面
}

export function describeVideoTask(row: VideoTaskRow): string {
  const id = row.task_id
  switch (row.status) {
    case 'pending': return `视频生成任务排队中（task_id=${id}）——预计 1-5 分钟——请稍后用 video_generation_status 查询`
    case 'running': return `视频生成中（task_id=${id}）——通常 1-5 分钟——请稍后进行查询`
    case 'succeeded': return `✅ 视频已生成并保存到部门共享目录：/ws/${row.filename}（交付物中心可见）`
    case 'failed': return `❌ 视频生成失败（task_id=${id}）：${row.error ?? '未知原因'}——可重新提交 generate_video`
    case 'canceled': return `视频任务已取消（task_id=${id}）——如需生成请重新提交`
    case 'unknown': return `视频任务不存在或已过期（task_id=${id}——查询有效期 24 小时）——如需生成请重新提交`
    // W2: status 类型面 = string（z.enum 坍缩登记 W3）——未知值诚实兜底
    default: return `视频任务状态未知（task_id=${id}，status=${row.status}）`
  }
}
