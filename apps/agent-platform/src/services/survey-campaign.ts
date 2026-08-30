/**
 * 问卷批量化调度器（Campaign——S1——2027-09）
 *
 * 产品语义：用户聊天触发（@问卷助手——S2 工具面）→ 调度器接管——
 * 水位派单（不是 @全员）——超时重试——完成记账——失败清单。
 *
 * 架构：调度循环 = campaign 创建请求的 ctx 闭包（launch 同款模式——
 * 简单可靠——campaign 生命周期短——分钟级到小时级）；server 重启时
 * running campaign 标记 interrupted（retry API 恢复——不过度工程）。
 *
 * 完成信号：角色部门工作目录 survey-result.json 出现（agent 落盘产物——
 * 与 seed prompt 契约一致——确定性判定——不依赖 LLM 行为变数）。
 */

import type { AppCtx } from '../middleware/ctx.ts'

export interface CampaignRow {
  id: string
  app_id: string
  total: number
  concurrency: number
  url: string
  retry: number
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'
  completed: number
  failed: number
  created_at: string
  updated_at: string
}

/** run 行（角色快照——agent_id/dept_id 冗余——查询免 JOIN） */
export interface RunRow {
  id: string
  campaign_id: string
  agent_id: string
  agent_name: string
  dept_id: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  attempts: number
  started_at: string | null
  finished_at: string | null
  error: string | null
}

/* ── 纯判据（单测面——调度语义的确定性来源） ─────────────────── */

/** 补派选择：active < concurrency 的差额——从 queued 取（FIFO） */
export function pickToDispatch(runs: RunRow[], concurrency: number): RunRow[] {
  const active = runs.filter((r) => r.status === 'running').length
  const slot = Math.max(0, concurrency - active)
  if (slot === 0) return []
  return runs.filter((r) => r.status === 'queued').slice(0, slot)
}

/** 超时判定：running 超过 timeoutMs → attempts 未耗尽重派 / 耗尽失败 */
export function tickTimeouts(runs: RunRow[], retry: number, timeoutMs: number, now = Date.now()): { requeue: RunRow[]; failed: RunRow[] } {
  const requeue: RunRow[] = []
  const failed: RunRow[] = []
  for (const r of runs) {
    if (r.status !== 'running' || !r.started_at) continue
    if (now - new Date(r.started_at).getTime() < timeoutMs) continue
    if (r.attempts < retry) requeue.push(r)
    else failed.push(r)
  }
  return { requeue, failed }
}

/* ── 调度器（服务端——createCampaign 启动闭环） ──────────────── */

const TICK_MS = 5_000
const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_RETRY = 2

/** 查询未完成角色数（completed+failed < total 的终止判定） */
function isFinished(c: Pick<CampaignRow, 'completed' | 'failed' | 'total'>): boolean {
  return c.completed + c.failed >= c.total
}

export interface CreateCampaignBody {
  total?: number
  concurrency?: number
  url?: string
  retry?: number
  rolePrefix?: string
  /** 问卷链接缺失时用默认（与 seed 一致） */
  surveyBase?: string
  /** 排除角色（历史已完成的角色名——增量式重跑） */
  excludeNames?: string[]
}

/** 创建 campaign：选角色（rolePrefix 取 N）→ 建行 → 启动调度循环 */
export async function createCampaign(ctx: AppCtx, body: CreateCampaignBody): Promise<{ campaign: CampaignRow; runs: RunRow[] }> {
  const sql = ctx.sql
  const appId = ctx.appId
  const total = Math.max(1, Number(body.total ?? 0) || 10)
  const concurrency = Math.max(1, Number(body.concurrency ?? 0) || 5)
  const retry = Math.max(0, Number(body.retry ?? DEFAULT_RETRY) || 0)
  const prefix = body.rolePrefix ?? '问卷-'

  // 角色池：rolePrefix 前缀的 ai agent（有角色部门——独立沙盒）
  const agents = await sql`
    SELECT id, name, department_id FROM agents
    WHERE app_id = ${appId} AND type = 'ai' AND is_active
      AND name LIKE ${prefix + '%'} AND department_id IS NOT NULL
    ORDER BY name
  `
  const pool = (agents ?? []).filter((a: any) => !(body.excludeNames ?? []).includes(String(a.name)))
  if (pool.length === 0) {
    throw new Error(`未找到问卷角色（rolePrefix=${prefix}）——先跑 seed-survey-agents.mjs`)
  }
  const chosen = pool.slice(0, total)

  const [campaign] = await sql`
    INSERT INTO survey_campaigns (app_id, total, concurrency, url, retry, status)
    VALUES (${appId}, ${chosen.length}, ${concurrency}, ${body.url ?? ''}, ${retry}, 'running')
    RETURNING *
  `
  const rows: RunRow[] = []
  for (const a of chosen as any[]) {
    const [run] = await sql`
      INSERT INTO survey_campaign_runs (campaign_id, agent_id, agent_name, dept_id, status)
      VALUES (${String((campaign as any).id)}, ${a.id}, ${a.name}, ${a.department_id}, 'queued')
      RETURNING *
    `
    rows.push(run as unknown as RunRow)
  }

  const row = campaign as unknown as CampaignRow
  // 启动调度循环（请求闭包——campaign 完成/取消即停）
  startCampaignLoop(ctx, row.id)
  return { campaign: row, runs: rows }
}

export async function getCampaign(ctx: AppCtx, id: string): Promise<{ campaign: CampaignRow; runs: RunRow[] } | null> {
  const [campaign] = await ctx.sql`SELECT * FROM survey_campaigns WHERE id = ${id} AND app_id = ${ctx.appId}`
  if (!campaign) return null
  const runs = (await ctx.sql`SELECT * FROM survey_campaign_runs WHERE campaign_id = ${id} ORDER BY agent_name`) as unknown as RunRow[]
  return { campaign: campaign as unknown as CampaignRow, runs: runs ?? [] }
}

/** 失败重跑：failed（重试耗尽）→ queued（attempts 清零——重新开始） */
export async function retryCampaign(ctx: AppCtx, id: string): Promise<void> {
  const [campaign] = await ctx.sql`SELECT * FROM survey_campaigns WHERE id = ${id} AND app_id = ${ctx.appId}`
  if (!campaign) throw new Error('campaign 不存在')
  if (campaign.status !== 'done' && campaign.status !== 'failed' && campaign.status !== 'interrupted') {
    throw new Error(`campaign 状态 ${campaign.status}——仅 done/failed/interrupted 可重跑`)
  }
  await ctx.sql`
    UPDATE survey_campaign_runs SET status = 'queued', attempts = 0, error = NULL,
      started_at = NULL, finished_at = NULL
    WHERE campaign_id = ${id} AND status = 'failed'
  `
  await ctx.sql`UPDATE survey_campaigns SET status = 'running', completed = 0, failed = 0, updated_at = NOW() WHERE id = ${id}`
  startCampaignLoop(ctx, id)
}

export async function cancelCampaign(ctx: AppCtx, id: string): Promise<void> {
  const [campaign] = await ctx.sql`SELECT * FROM survey_campaigns WHERE id = ${id} AND app_id = ${ctx.appId}`
  if (!campaign) throw new Error('campaign 不存在')
  if (campaign.status === 'done' || campaign.status === 'cancelled') throw new Error(`campaign 已${campaign.status}`)
  await ctx.sql`
    UPDATE survey_campaign_runs SET status = 'cancelled' WHERE campaign_id = ${id} AND status IN ('queued', 'running')
  `
  await ctx.sql`UPDATE survey_campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = ${id}`
}

/** 启动调度循环（幂等防重——campaign 完成/取消即 clearInterval） */
const runningLoops = new Set<string>()
export function startCampaignLoop(ctx: AppCtx, campaignId: string): void {
  if (runningLoops.has(campaignId)) return
  runningLoops.add(campaignId)
  console.log(`[campaign ${campaignId}] 调度循环启动（tick ${TICK_MS}ms）`)
  void (async () => {
    const timer = setInterval(async () => {
      try {
        const done = await tickOnce(ctx, campaignId)
        if (done) { clearInterval(timer); runningLoops.delete(campaignId) }
      } catch (e: any) {
        console.error(`[campaign ${campaignId}] tick 失败:`, e?.message ?? e)
      }
    }, TICK_MS)
    timer.unref?.()
  })()
}

/** 单次 tick：完成扫描 → 超时重试 → 水位补派 → 终止判定 */
const ticking = new Set<string>()
export async function tickOnce(ctx: AppCtx, campaignId: string): Promise<boolean> {
  if (ticking.has(campaignId)) return false // tick 叠加防护（上一 tick 未完成——跳过）
  ticking.add(campaignId)
  try {
    return await tickOnceInner(ctx, campaignId)
  } finally {
    ticking.delete(campaignId)
  }
}
async function tickOnceInner(ctx: AppCtx, campaignId: string): Promise<boolean> {
  const sql = ctx.sql
  const [campaign] = await sql`SELECT * FROM survey_campaigns WHERE id = ${campaignId}`
  if (!campaign || campaign.status !== 'running') return true // 已取消/完成——停循环

  const runs = ((await sql`SELECT * FROM survey_campaign_runs WHERE campaign_id = ${campaignId}`) ?? []) as unknown as RunRow[]
  const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
  const { access } = await import('node:fs/promises')

  // ── ① 完成扫描（active runs——工作目录 survey-result.json） ──
  let completed = Number(campaign.completed ?? 0)
  let failedCount = Number(campaign.failed ?? 0)
  for (const r of runs) {
    if (r.status !== 'running') continue
    const ws = await resolveDepartmentWorkspace(r.dept_id, null, true).catch(() => null)
    if (!ws) continue
    const ok = await access(`${ws}/survey-result.json`).then(() => true).catch(() => false)
    if (ok) {
      await sql`UPDATE survey_campaign_runs SET status = 'done', finished_at = NOW(), error = NULL WHERE id = ${r.id}`
      completed++
    }
  }

  // ── ② 超时重试 ──
  const timeoutMs = Number(process.env.SURVEY_CAMPAIGN_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const retryMax = Number(campaign.retry ?? DEFAULT_RETRY)
  const { requeue, failed } = tickTimeouts(runs, retryMax, timeoutMs)
  for (const r of requeue) {
    await sql`UPDATE survey_campaign_runs SET status = 'queued', attempts = attempts + 1, started_at = NULL WHERE id = ${r.id}`
  }
  for (const r of failed) {
    await sql`UPDATE survey_campaign_runs SET status = 'failed', finished_at = NOW(), error = '超时（${Math.round(timeoutMs / 1000)}s 未完成）' WHERE id = ${r.id}`
    failedCount++
  }

  // ── ③ 水位补派 ──
  const freshRuns = ((await sql`SELECT * FROM survey_campaign_runs WHERE campaign_id = ${campaignId}`) ?? []) as unknown as RunRow[]
  const toDispatch = pickToDispatch(freshRuns, Number(campaign.concurrency))
  if (toDispatch.length > 0) {
    const [sender] = await sql`SELECT id FROM agents WHERE app_id = ${ctx.appId} AND type = 'user' ORDER BY created_at LIMIT 1`
    const senderId = sender ? String(sender.id) : 'system'
    for (const r of toDispatch) {
      const url = campaign.url || (typeof process.env.PUBLIC_BASE_URL === 'string' ? process.env.PUBLIC_BASE_URL : 'http://localhost:3000') + '/demo-survey'
      // 清场纪律（2027-09——旧 survey-result.json 残留 → 新 campaign 启动即完成
      // ——增量重跑同角色必踩——派单前删旧产物——完成信号干净）
      try {
        const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
        const ws = await resolveDepartmentWorkspace(r.dept_id, null, true).catch(() => null)
        if (ws) { const { rm } = await import('node:fs/promises'); await rm(`${ws}/survey-result.json`, { force: true }).catch(() => {}) }
      } catch { /* 清场失败不阻断派单 */ }
      const content = `@${r.agent_name} 【问卷任务】请打开问卷 ${url}?s=${encodeURIComponent(r.agent_name)} 按你的人设完整填写并提交。完成后把作答结果写入工作目录 survey-result.json（覆盖旧文件），并执行 agent-browser close 关闭浏览器。`
      // fire-and-forget（LLM 流分钟级——tick 不阻塞——完成由文件扫描判定；
      // 标 running 立即——在途即占槽——超时判定基于 started_at）
      void (async () => {
        try {
          const { handleNewMessageStream } = await import('./chat.ts')
          await handleNewMessageStream(ctx, r.dept_id, senderId, content, `campaign-${campaignId}-${r.agent_id}`)
        } catch (e: any) {
          console.error(`[campaign ${campaignId}] 派单失败 ${r.agent_name}:`, e?.message ?? e)
          await sql`UPDATE survey_campaign_runs SET status = 'failed', finished_at = NOW(), error = ${String(e?.message ?? '派单失败').slice(0, 300)} WHERE id = ${r.id}`.catch(() => {})
        }
      })()
      await sql`UPDATE survey_campaign_runs SET status = 'running', started_at = NOW() WHERE id = ${r.id}`
    }
  }

  // ── ④ 终止判定 + 批收尾（S4——2027-09——campaign 完成 → 角色容器批量 stop——
  //   1000 角色不空转 10min——资源立即释放——回收可观测） ──
  await sql`UPDATE survey_campaigns SET completed = ${completed}, failed = ${failedCount}, updated_at = NOW() WHERE id = ${campaignId}`
  if (isFinished({ total: Number(campaign.total), completed, failed: failedCount })) {
    await sql`UPDATE survey_campaigns SET status = 'done', updated_at = NOW() WHERE id = ${campaignId}`
    console.log(`[campaign ${campaignId}] 完成：${completed} 成功 / ${failedCount} 失败（共 ${campaign.total}）`)
    // 批收尾：全部角色部门沙盒 stop（busy 豁免——不打断任何执行）
    void (async () => {
      try {
        const { manager } = await import('../sandbox/manager.ts')
        let stopped = 0
        for (const r of freshRuns) {
          const [sb] = await sql`SELECT id, app_id FROM sandboxes WHERE department_id = ${r.dept_id} AND status = 'running'`
          if (sb) {
            const res = await manager.stop(String(sb.id), String(sb.app_id)).catch(() => ({ ok: false } as const))
            if (res?.ok) stopped++
          }
        }
        console.log(`[campaign ${campaignId}] 批收尾：${stopped} 个角色沙盒已停止（资源释放）`)
      } catch { /* 收尾失败不影响完成状态 */ }
    })()
    return true
  }
  return false
}

/** server 启动恢复：running → interrupted（不留孤儿循环——retry API 恢复） */
export async function markInterrupted(ctx: AppCtx): Promise<number> {
  const rows = await ctx.sql`UPDATE survey_campaigns SET status = 'interrupted', updated_at = NOW() WHERE status = 'running' RETURNING id`
  return (rows ?? []).length
}
