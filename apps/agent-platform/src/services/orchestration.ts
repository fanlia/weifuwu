/**
 * 编排任务树服务（ORCHESTRATION-PLAN Wave 3——O11）
 *
 * agent_runs 表：编排任务（orchestration kind）+ 子任务（worker kind）——
 * parent_run_id 链——审计面（管理员看「一次派发生成了什么」）。
 * 状态机：planned → running → partial（部分失败）→ done / failed。
 * 失败不静默：worker_results 记录每 worker 的 { agent, status, result?, error? }。
 */
import type { AppCtx } from '../middleware/ctx.ts'

export type RunStatus = 'planned' | 'running' | 'partial' | 'done' | 'failed'

export interface WorkerRecord {
  agent: string
  status: 'ok' | 'error' | 'skipped'
  result?: string
  error?: string
}

/** 创建编排任务（返回 run id——调用方在 worker 并发前调用） */
export async function createOrchestrationRun(
  ctx: Pick<AppCtx, 'sql'>,
  opts: {
    appId: string
    departmentId: string
    orchestratorId: string
    plan: Array<{ agent: string; message: string }>
    requestId?: string
  },
): Promise<string> {
  const [row] = await ctx.sql`
    INSERT INTO agent_runs (app_id, department_id, orchestrator_id, kind, plan_json, status, request_id)
    VALUES (${opts.appId}, ${opts.departmentId || null}, ${opts.orchestratorId}, 'orchestration',
      ${JSON.stringify(opts.plan)}::jsonb, 'running', ${opts.requestId ?? null})
    RETURNING id
  `
  return String(row.id)
}

/** 创建 worker 子任务（parent_run_id 链——worker 执行前） */
export async function createWorkerRun(
  ctx: Pick<AppCtx, 'sql'>,
  opts: { appId: string; departmentId: string; agentId: string; parentRunId: string; message: string },
): Promise<string> {
  const [row] = await ctx.sql`
    INSERT INTO agent_runs (app_id, department_id, orchestrator_id, parent_run_id, kind, plan_json, status)
    VALUES (${opts.appId}, ${opts.departmentId || null}, ${opts.agentId}, ${opts.parentRunId}, 'worker',
      ${JSON.stringify({ message: opts.message })}::jsonb, 'running')
    RETURNING id
  `
  return String(row.id)
}

/** 编排任务收尾（done/partial/failed——worker_results 全量） */
export async function finishOrchestrationRun(
  ctx: Pick<AppCtx, 'sql'>,
  opts: { runId: string; status: RunStatus; workers: WorkerRecord[] },
): Promise<void> {
  await ctx.sql`
    UPDATE agent_runs SET status = ${opts.status},
      worker_results = ${JSON.stringify(opts.workers)}::jsonb,
      updated_at = NOW()
    WHERE id = ${opts.runId}
  `
}

/** worker 收尾（ok/error——子任务状态回写） */
export async function finishWorkerRun(
  ctx: Pick<AppCtx, 'sql'>,
  opts: { runId: string; status: 'done' | 'failed'; result?: string; error?: string },
): Promise<void> {
  await ctx.sql`
    UPDATE agent_runs SET status = ${opts.status},
      worker_results = ${JSON.stringify({ result: opts.result ?? null, error: opts.error ?? null })}::jsonb,
      updated_at = NOW()
    WHERE id = ${opts.runId}
  `
}
