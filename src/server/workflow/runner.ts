/**
 * weifuwu/workflow/runner — 执行器（ctx 数据流 + 短路 + dry-run）
 *
 * 流程（语义红线，契约测试锁定）：
 *   - 步骤级 when 不通过 → 跳过该步（skippedSteps），**后续继续**
 *   - if 步骤（config.when）不通过 → 截断：status='skipped' + skippedReason（非错误）
 *   - 步骤 run 抛错 → stepResults[id]={ok:false,error} → 终止 status='error'
 *   - dry 模式：effects 步骤打桩 {ok:true, dry:true}；非 effects 步骤照常执行
 *   - ctx.steps.<id> 为 StepOutput，模板引用 {{steps.<id>.data.xxx}}
 */
import type { ExecuteOptions, RunResult, StepDef, StepEnv, StepHandler, StepOutput, WorkflowCtx, WorkflowDef } from './contracts.ts'
import { compile, toBoolean } from './expression.ts'
import { evaluateEdge } from './edge.ts'

export interface RunnerRegistry {
  get(type: string): StepHandler | undefined
}

export async function runWorkflow(
  def: WorkflowDef,
  opts: ExecuteOptions,
  env: StepEnv,
  registry: RunnerRegistry,
): Promise<RunResult> {
  const mode = opts.mode ?? 'live'
  const dry = mode === 'dry'
  const startedAt = Date.now()
  // ctx.steps 与 result.stepResults 同引用：步骤输出既是回放记录也是模板输入——
  // 一个对象不会脱节（W2 实证：曾写两处导致模板读空）
  const steps: WorkflowCtx['steps'] = {}
  const ctx: WorkflowCtx = { steps, input: opts.input }
  const result: RunResult = { status: 'success', executed: [], skippedSteps: [], stepResults: steps, dry, startedAt, finishedAt: 0 }
  const skippedSteps = result.skippedSteps // 同引用——重构后曾脱节（W2 实证）
  let signal = opts.signal

  for (const step of def.steps) {
    if (signal?.aborted) {
      result.status = 'error'
      result.error = `aborted before step '${step.id}'`
      break
    }
    // 步骤级 when：不通过 → 跳过，继续后续
    if (step.when !== undefined) {
      let pass: boolean
      try { pass = toBoolean(compile(step.when)(ctx)) }
      catch (e) {
        result.stepResults[step.id] = { ok: false, error: `when 表达式错误：${(e as Error).message}` }
        result.status = 'error'
        result.error = `step '${step.id}': ${(e as Error).message}`
        break
      }
      if (!pass) { skippedSteps.push(step.id); continue }
    }

    // if 步骤：截断语义（不通过 → 终止，非错误）；config.edge → 上升沿去重（「发一次」）
    if (step.type === 'if') {
      const whenExpr = String((step.config as Record<string, unknown>)?.when ?? '')
      let fired: boolean
      try { fired = toBoolean(compile(whenExpr)(ctx)) }
      catch (e) {
        result.stepResults[step.id] = { ok: false, error: `if 表达式错误：${(e as Error).message}` }
        result.status = 'error'
        result.error = `step '${step.id}': ${(e as Error).message}`
        break
      }
      const edgeCfg = (step.config as Record<string, unknown>)?.edge
      if (edgeCfg) {
        // edge 去重：上升沿 fire；真持续静默；变假解除武装
        const store = env.edge
        if (!store) {
          result.stepResults[step.id] = { ok: false, error: 'if edge 需要 edge 存储（workflow({ redis } / edgeStore)）' }
          result.status = 'error'
          result.error = `step '${step.id}': 未注入 edge 存储`
          break
        }
        const key = String((step.config as Record<string, unknown>)?.key ?? `wf:edge:${def.id ?? def.name ?? 'anon'}:${step.id}`)
        const { fired: fire, next } = evaluateEdge(await store.get(key), fired)
        await store.set(key, next)
        result.stepResults[step.id] = { ok: true, data: { satisfied: fired, fired: fire } }
        result.executed.push(step.id)
        if (!fire) {
          result.status = 'skipped'
          result.skippedReason = `edge '${step.id}' 已触发（条件持续为真，等待变假重新武装）`
          break
        }
        continue
      }
      result.stepResults[step.id] = { ok: true, data: { satisfied: fired } }
      result.executed.push(step.id)
      if (!fired) {
        result.status = 'skipped'
        result.skippedReason = `if '${step.id}' 不满足：${whenExpr}`
        break
      }
      continue
    }

    const handler = registry.get(step.type)
    if (!handler) {
      result.stepResults[step.id] = { ok: false, error: `未注册步骤类型：'${step.type}'` }
      result.status = 'error'
      result.error = `step '${step.id}': 未注册类型 '${step.type}'`
      break
    }
    const config = (step.config ?? {}) as Record<string, unknown>
    try {
      let data: unknown
      if (dry && handler.effects) {
        data = undefined
        result.stepResults[step.id] = { ok: true, dry: true }
      } else {
        data = await handler.run(config, ctx, env)
        result.stepResults[step.id] = { ok: true, data }
      }
      result.executed.push(step.id)
    } catch (e) {
      result.stepResults[step.id] = { ok: false, error: (e as Error).message }
      result.status = 'error'
      result.error = `step '${step.id}' (${step.type}): ${(e as Error).message}`
      break
    }
  }

  result.finishedAt = Date.now()
  return result
}

export type { StepDef, StepOutput }
