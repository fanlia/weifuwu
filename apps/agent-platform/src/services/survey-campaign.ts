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
/** 并发硬上限（2027-09 定参——S7b 判负：20 判负不做——LLM 上游 20 未实测——
 *  试点 100 @10 已实测 100/100 · 0 失败 · 5.3 分钟——10 是实证窗口；
 *  池容量视角：10 × 512MB = 5120MB ≤ 10240MB 预算（50% 余量——可双 campaign 并行）） */
export const MAX_CAMPAIGN_CONCURRENCY = 10

/** 查询未完成角色数（completed+failed < total 的终止判定）
 *  严格语义（2027-09 实证 f90a55f9：campaign done 时仍剩 10 个 running run——
 *  提交晚于末次扫描——循环即停——run 永远卡 running——sandbox 永不批收尾）：
 *  完成 = 记账达标 且 无在途 run（在途 run 由后续 tick 的完成扫描/超时判定收敛） */
export function isCampaignFinished(c: Pick<CampaignRow, 'completed' | 'failed' | 'total'>, runningCount = 0): boolean {
  return runningCount === 0 && c.completed + c.failed >= c.total
}

/** 并发护栏（2027-09 定参——S7b 判负：20 判负不做——LLM 上游 20 未实测——
 *  试点 100 @10 已实测 100/100 · 0 失败 · 5.3 分钟——10 是实证窗口）
 *  单一实现源：API/工具/内部任何入口超限一律夹紧——防误配 */
export function clampConcurrency(value: number, fallback = 5): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    // 无效输入（0/负/NaN/未传）归位默认——默认本身也夹紧（fallback 只允许在窗口内）
    return Math.min(MAX_CAMPAIGN_CONCURRENCY, Math.max(1, Math.floor(fallback)))
  }
  return Math.min(MAX_CAMPAIGN_CONCURRENCY, n)
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
  const concurrency = clampConcurrency(Number(body.concurrency ?? 0))
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
  // completed 重统计（2027-09 实证——S7b 恢复时 done 计数丢失：retry 零置后
  // 30 个 done run 不计入 → isFinished 永不触发 → campaign 永不完成）
  await ctx.sql`UPDATE survey_campaigns SET status = 'running',
    completed = (SELECT COUNT(*)::int FROM survey_campaign_runs WHERE campaign_id = ${id} AND status = 'done'),
    failed = 0, updated_at = NOW() WHERE id = ${id}`
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

/** 完成/失败/重派即回收角色沙盒（延迟——LLM 尾部 write/回复仍在流）
 *  2027-09 实证——配额口径：sandbox_quota 计 requested+running——已完成角色
 *  的容器等 idle 回收要 10min——期间占满 quota=20 → 新角色创建被拒「配额已满」
 *  → run 工具失败级联（问卷场景并发闸=配额闸——slot 释放不足 = 调度死锁）
 *  延迟语义：done 60s（LLM 还差 write+收尾回复）；failed/requeue 30s（已超时——业务面已终结） */
function releaseDeptSandbox(sql: any, deptId: string, delayMs: number): void {
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const { manager } = await import('../sandbox/manager.ts')
        const [sb] = await sql`SELECT id, app_id FROM sandboxes WHERE department_id = ${deptId} AND status = 'running'`
        if (sb) await manager.stop(String(sb.id), String(sb.app_id)).catch(() => {})
      } catch { /* 回收失败不阻断——idle 回收兜底 */ }
    })()
  }, delayMs)
  timer.unref?.()
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
        console.log(`[campaign ${campaignId}] tick @${new Date().toISOString().slice(11, 19)}`)
        const done = await tickOnce(ctx, campaignId)
        if (done) {
          console.log(`[campaign ${campaignId}] tick 循环停止（return true）`)  // 诊断：谁停的循环
          clearInterval(timer); runningLoops.delete(campaignId)
        }
      } catch (e: any) {
        console.error(`[campaign ${campaignId}] tick 失败:`, e?.message ?? e)
        console.error(`[campaign ${campaignId}] tick stack:`, String(e?.stack ?? '').slice(0, 600))
      }
    }, TICK_MS)
    timer.unref?.()
  })()
}

/** 单次 tick：完成扫描 → 超时重试 → 水位补派 → 终止判定 */
const ticking = new Set<string>()
export async function tickOnce(ctx: AppCtx, campaignId: string): Promise<boolean> {
  if (ticking.has(campaignId)) {
    console.log(`[campaign ${campaignId}] tick 被叠加门跳过（上一 tick 未完成——ticking 挂）`)  // B 诊断
    return false // tick 叠加防护（上一 tick 未完成——跳过）
  }
  ticking.add(campaignId)
  try {
    return await tickOnceInner(ctx, campaignId)
  } finally {
    ticking.delete(campaignId)
  }
}
async function tickOnceInner(ctx: AppCtx, campaignId: string): Promise<boolean> {
  const sql = ctx.sql
  let campaign: any = null
  try {
    ;[campaign] = await sql`SELECT * FROM survey_campaigns WHERE id = ${campaignId}`
  } catch (e: any) {
    console.error(`[campaign ${campaignId}] phase① campaign 查询失败（campaignId=${JSON.stringify(campaignId)} type=${typeof campaignId}）:`, e?.message ?? e)
    throw e
  }
  if (!campaign || campaign.status !== 'running') {
    console.log(`[campaign ${campaignId}] tick 停止判定：campaign=${campaign ? campaign.status : '查询空!'}`)  // A 诊断：查询空=ctx.sql 失效
    return true // 已取消/完成——停循环
  }

  let runsRaw: any[] = []
  try {
    runsRaw = (await sql`SELECT * FROM survey_campaign_runs WHERE campaign_id = ${campaignId}`) ?? []
  } catch (e: any) {
    console.error(`[campaign ${campaignId}] phase① runs 查询失败:`, e?.message ?? e)
    throw e
  }
  const runs = runsRaw as unknown as RunRow[]
  const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
  const { access } = await import('node:fs/promises')

  // ── ① 完成扫描（active runs——工作目录 survey-result.json） ──
  let completed = Number(campaign.completed ?? 0)
  let failedCount = Number(campaign.failed ?? 0)
  for (const r of runs) {
    if (r.status !== 'running') continue
    const ws = await resolveDepartmentWorkspace(r.dept_id, null, true).catch(() => null)
    if (!ws) continue
    // 完成信号以真实提交为准（2027-09 实证：LLM 口头「已提交」+ 写 survey-result.json
    // 假完成——agent-browser 容器内全链实测：页面零交互——统计页永远没数——
    // 完成 = survey_submissions 有该角色提交（campaign_id + source 反查已生效）
    let sub: any = null
    try {
      sub = (await sql`SELECT 1 FROM survey_submissions WHERE campaign_id = ${campaignId} AND source = ${r.agent_name} LIMIT 1`)[0]
    } catch (e: any) {
      console.error(`[campaign ${campaignId}] 完成扫描 SQL 失败（agent=${r.agent_name}）:`, e?.message ?? e)
      throw e
    }
    if (sub) {
      await sql`UPDATE survey_campaign_runs SET status = 'done', finished_at = NOW(), error = NULL WHERE id = ${r.id}`
      completed++
      releaseDeptSandbox(sql, r.dept_id, 60_000) // 完成即回收（延迟 60s——LLM 尾部 write/回复仍在流）
    }
  }

  // ── ② 超时重试 ──
  const timeoutMs = Number(process.env.SURVEY_CAMPAIGN_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const retryMax = Number(campaign.retry ?? DEFAULT_RETRY)
  const { requeue, failed } = tickTimeouts(runs, retryMax, timeoutMs)
  for (const r of requeue) {
    try { await sql`UPDATE survey_campaign_runs SET status = 'queued', attempts = attempts + 1, started_at = NULL WHERE id = ${r.id}` }
    catch (e: any) { console.error(`[campaign ${campaignId}] phase② requeue 失败（run=${r.id}）:`, e?.message ?? e); throw e }
    releaseDeptSandbox(sql, r.dept_id, 30_000)
  }
  for (const r of failed) {
    try {
      // 参数外置（2027-09 实证：'超时（${n}s 未完成）' 字符串内嵌 ${} 被
      // postgres.js 当作绑定参数——位于单引号内 → 服务器无法推断 $1 类型 →
      // could not determine data type of parameter $1——tick 每轮失败）
      const errMsg = `超时（${Math.round(timeoutMs / 1000)}s 未完成）`
      await sql`UPDATE survey_campaign_runs SET status = 'failed', finished_at = NOW(), error = ${errMsg} WHERE id = ${r.id}`
    }
    catch (e: any) { console.error(`[campaign ${campaignId}] phase② failed 标记失败（run=${r.id}）:`, e?.message ?? e); throw e }
    failedCount++
    releaseDeptSandbox(sql, r.dept_id, 30_000)
  }

  // ── ②.5 任务级生命周期豁免（P1-1——2027-09 实证：LLM 思考间隙
  //    （分钟级——无工具调用）→ last_used_at 不更新 → reconcile idle 10min
  //    → 容器 stop → 角色工具调用失败级联（在线 7 容器全 Exited 铁证）——
  //    tick 每轮刷新 running 角色沙盒 last_used_at（一条 SELECT 子查询——
  //    campaign 期间角色容器恒活跃——治愈 idle 回收）──
  await sql`UPDATE sandboxes SET last_used_at = NOW()
    WHERE status = 'running' AND department_id IN (
      SELECT department_id FROM survey_campaign_runs WHERE campaign_id = ${campaignId} AND status = 'running'
    )`.catch(() => {})

  // ── ③ 水位补派 ──
  const freshRuns = ((await sql`SELECT * FROM survey_campaign_runs WHERE campaign_id = ${campaignId}`) ?? []) as unknown as RunRow[]
  const toDispatch = pickToDispatch(freshRuns, Number(campaign.concurrency))
  if (toDispatch.length > 0) {
    let sender: any = null
    try {
      ;[sender] = await sql`SELECT id FROM agents WHERE app_id = ${ctx.appId} AND type = 'user' ORDER BY created_at LIMIT 1`
    } catch (e: any) {
      console.error(`[campaign ${campaignId}] 派单 sender 查询失败:`, e?.message ?? e)
      throw e
    }
    const senderId = sender ? String(sender.id) : 'system'
    for (const r of toDispatch) {
      // 容器可达 URL（2027-09：agent-browser 在沙盒容器内运行——localhost=容器自身
      // ——默认用 host.docker.internal（docker.ts --add-host 已配）——PUBLIC_BASE_URL
      // 是宿主 IP 也可能可达（桥接网络）但 host.docker.internal 更稳（IP 漂移无感）
      const base = typeof process.env.SURVEY_CONTAINER_URL === 'string' && process.env.SURVEY_CONTAINER_URL
        || `http://host.docker.internal:${process.env.PORT ?? 3000}`
      const url = campaign.url || base + '/demo-survey'
      // 清场纪律（2027-09——旧 survey-result.json 残留 → 新 campaign 启动即完成
      // ——增量重跑同角色必踩——派单前删旧产物——完成信号干净）
      try {
        const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
        const ws = await resolveDepartmentWorkspace(r.dept_id, null, true).catch(() => null)
        if (ws) { const { rm } = await import('node:fs/promises'); await rm(`${ws}/survey-result.json`, { force: true }).catch(() => {}) }
      } catch { /* 清场失败不阻断派单 */ }
      const content = `@${r.agent_name} 【问卷任务】请用 agent-browser CLI 打开问卷并真实填写提交（每一步必须实际执行——禁止仅描述）：
1. agent-browser open "${url}?s=${encodeURIComponent(r.agent_name)}&c=${campaignId}"（页面与 WS 正常时显示「已连接」）
2. agent-browser snapshot（读取题目与控件 ref——5 题：年龄/行业/关注能力/评分/反馈）
3. 逐项真实点击/输入：agent-browser click "@eXX"（年龄/关注/评分）+ type（反馈文本框）
4. agent-browser click 提交按钮——页面显示「已提交——不可修改」锁定态
5. agent-browser read/snapshot 验证锁定态与提交编号
6. 把作答结果写入工作目录 survey-result.json（覆盖旧文件），执行 agent-browser close
注意：只有页面出现「已提交」锁定态才算完成——提交成功前不得报告完成。`
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
      try { await sql`UPDATE survey_campaign_runs SET status = 'running', started_at = NOW() WHERE id = ${r.id}` }
      catch (e: any) { console.error(`[campaign ${campaignId}] phase③ 标 running 失败（run=${r.id}）:`, e?.message ?? e); throw e }
    }
  }

  // ── ④ 终止判定 + 批收尾（S4——2027-09——campaign 完成 → 角色容器批量 stop——
  //   1000 角色不空转 10min——资源立即释放——回收可观测） ──
  try { await sql`UPDATE survey_campaigns SET completed = ${Math.min(completed, Number(campaign.total))}, failed = ${Math.min(failedCount, Number(campaign.total))}, updated_at = NOW() WHERE id = ${campaignId}` }
  catch (e: any) { console.error(`[campaign ${campaignId}] phase④ 记账失败（completed=${completed} failed=${failedCount}）:`, e?.message ?? e); throw e }
  if (isCampaignFinished({ total: Number(campaign.total), completed, failed: failedCount }, freshRuns.filter((r) => r.status === 'running').length)) {
    try { await sql`UPDATE survey_campaigns SET status = 'done', updated_at = NOW() WHERE id = ${campaignId}` }
    catch (e: any) { console.error(`[campaign ${campaignId}] phase④ done 标记失败:`, e?.message ?? e); throw e }
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
