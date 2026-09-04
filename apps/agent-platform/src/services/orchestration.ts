/**
 * 编排任务树服务（ORCHESTRATION-PLAN Wave 3——O11）
 *
 * agent_runs 表：编排任务（orchestration kind）+ 子任务（worker kind）——
 * parent_run_id 链——审计面（管理员看「一次派发生成了什么」）。
 * 状态机：planned → running → partial（部分失败）→ done / failed。
 * 失败不静默：worker_results 记录每 worker 的 { agent, status, result?, error? }。
 */
import { ops } from 'weifuwu'
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
  ctx: Pick<AppCtx, 'orm'>,
  opts: {
    appId: string
    departmentId: string
    orchestratorId: string
    plan: Array<{ agent: string; message: string }>
    requestId?: string
  },
): Promise<string> {
  const [row] = await ctx.orm.query.insert('agent_runs')
    .values({ app_id: opts.appId, department_id: opts.departmentId || null, orchestrator_id: opts.orchestratorId, kind: 'orchestration',
      plan_json: opts.plan, status: 'running', request_id: opts.requestId ?? null })
    .returning('id')
    .run()
  return String((row as any).id)
}

/** 创建 worker 子任务（parent_run_id 链——worker 执行前） */
export async function createWorkerRun(
  ctx: Pick<AppCtx, 'orm'>,
  opts: { appId: string; departmentId: string; agentId: string; parentRunId: string; message: string },
): Promise<string> {
  const [row] = await ctx.orm.query.insert('agent_runs')
    .values({ app_id: opts.appId, department_id: opts.departmentId || null, orchestrator_id: opts.agentId, parent_run_id: opts.parentRunId, kind: 'worker',
      plan_json: { message: opts.message }, status: 'running' })
    .returning('id')
    .run()
  return String((row as any).id)
}

/** 编排任务收尾（done/partial/failed——worker_results 全量） */
export async function finishOrchestrationRun(
  ctx: Pick<AppCtx, 'orm'>,
  opts: { runId: string; status: RunStatus; workers: WorkerRecord[] },
): Promise<void> {
  await ctx.orm.query.update('agent_runs')
    .set({ status: opts.status, worker_results: opts.workers, updated_at: ops.now() })
    .where({ id: { eq: opts.runId }})
    .run()
}

/** worker 收尾（ok/error——子任务状态回写） */
export async function finishWorkerRun(
  ctx: Pick<AppCtx, 'orm'>,
  opts: { runId: string; status: 'done' | 'failed'; result?: string; error?: string },
): Promise<void> {
  await ctx.orm.query.update('agent_runs')
    .set({ status: opts.status, worker_results: { result: opts.result ?? null, error: opts.error ?? null }, updated_at: ops.now() })
    .where({ id: { eq: opts.runId }})
    .run()
}
