/**
 * weifuwu/workflow/runner — 执行器（递归子链 + 分支 + 循环 + 终止 + dry-run）
 *
 * 语义红线（契约测试锁定——与 JS 心智对齐）：
 *   - 步骤级 when 不通过 → 跳过该步（skippedSteps），后续继续
 *   - if 分支：when true → then；false → else（无 else 则跳过子链）——**后续继续**
 *   - 去重无原语：store 步骤显式 KV（用户代码查询/记账——与原语无关）
 *   - while/for：循环执行 step 子链（maxIters 硬上限默认 1000，超限报错）
 *   - return（无值）→ 终止整流程，status='success'（JS 顶层 return 同义）
 *   - 步骤 run 抛错 → stepResults[id]={ok:false,error} → 终止 status='error'
 *   - dry 模式：effects 步骤打桩 {ok:true, dry:true}；非 effects 步骤照常执行
 *   - ctx.steps.<id> 为 StepOutput；ctx.vars.<name> 为 assign 变量；ctx.loop 为循环当前项
 */
import type { TryConfig,
  ExecuteOptions, RunResult, StepDef, StepEnv, StepHandler, StepOutput,
  WorkflowCtx, WorkflowDef, IfConfig, WhileConfig, ForConfig, AssignConfig, ReturnConfig, CallConfig,
} from './contracts.ts'
import { compile, toBoolean } from './expression.ts'
import { STD_FNS } from './std.ts'

export interface RunnerRegistry {
  get(type: string): StepHandler | undefined
}

/** 子链执行信号：穿透所有嵌套层（return 带值——函数返回；顶层终止忽略值） */
type Flow = { k: 'continue' } | { k: 'return'; value?: unknown }

/** 运行期共享状态（递归间传递——同引用不脱节） */
interface Rt {
  result: RunResult
  steps: WorkflowCtx['steps']
  dry: boolean
  signal?: AbortSignal
  /** 函数查找（call 步骤） */
  def: WorkflowDef
  /** 函数递归深度（守卫 64） */
  fnDepth: number
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
  // ctx.steps 与 result.stepResults 同引用：步骤输出既是回放记录也是模板输入
  const steps: WorkflowCtx['steps'] = {}
  const result: RunResult = { status: 'success', executed: [], skippedSteps: [], stepResults: steps, dry, startedAt, finishedAt: 0 }
  const rt: Rt = { result, steps, dry, signal: opts.signal, def, fnDepth: 0 }
  const flow = await execSteps(def.steps, { steps, vars: {}, input: opts.input }, env, registry, rt)
  void flow // 顶层 return/continue 均 success（error 已由 aborted/fail 设置）
  result.finishedAt = Date.now()
  return result
}

/** 递归执行步骤序列（顶层 + 子链共用）——返回 'return' 表示终止信号（穿透） */
async function execSteps(
  steps: StepDef[],
  ctx: WorkflowCtx,
  env: StepEnv,
  registry: RunnerRegistry,
  rt: Rt,
): Promise<Flow> {
  const { result, steps: out } = rt
  for (const step of steps) {
    if (rt.signal?.aborted) {
      result.status = 'error'
      result.error = `aborted before step '${step.id}'`
      return { k: 'return' }
    }
    // 步骤级 when：不通过 → 跳过，继续后续
    if (step.when !== undefined) {
      let pass: boolean
      try { pass = toBoolean(evaluateExpr(step.when, ctx, `when of '${step.id}'`)) }
      catch (e) {
        out[step.id] = { ok: false, error: `when 表达式错误：${(e as Error).message}` }
        result.status = 'error'
        result.error = `step '${step.id}': ${(e as Error).message}`
        return { k: 'return' }
      }
      if (!pass) { result.skippedSteps.push(step.id); continue }
    }

    switch (step.type) {
      case 'assign': {
        const cfg = step.config as unknown as AssignConfig
        try {
          ctx.vars[cfg.target] = evaluateExpr(cfg.value, ctx, `赋值 ${cfg.target}`)
          out[step.id] = { ok: true, data: ctx.vars[cfg.target] }
          result.executed.push(step.id)
        } catch (e) {
          return fail(rt, step, e)
        }
        continue
      }
      case 'if': {
        const cfg = step.config as unknown as IfConfig
        const flow = await execIf(step, cfg, ctx, env, registry, rt)
        if (flow.k !== 'continue') return flow
        continue
      }
      case 'try': {
        const cfg = step.config as unknown as TryConfig
        const flow = await execTry(step, cfg, ctx, env, registry, rt)
        if (flow.k !== 'continue') return flow
        continue
      }
      case 'while': {
        const cfg = step.config as unknown as WhileConfig
        const flow = await execWhile(step, cfg, ctx, env, registry, rt)
        if (flow.k !== 'continue') return flow
        continue
      }
      case 'for': {
        const cfg = step.config as unknown as ForConfig
        const flow = await execFor(step, cfg, ctx, env, registry, rt)
        if (flow.k !== 'continue') return flow
        continue
      }
      case 'return': {
        // JS return 语义：函数内 → 返回（值 → call 步骤 data）；顶层 → 终止流程（success）
        const cfg = step.config as unknown as ReturnConfig
        const value = cfg.value !== undefined ? evaluateExpr(cfg.value, ctx, `return`) : undefined
        out[step.id] = { ok: true, data: value }
        result.executed.push(step.id)
        return { k: 'return', value }
      }
      case 'call': {
        const cfg = step.config as unknown as CallConfig
        const fn = rt.def.functions?.find((f) => f.name === cfg.name)
        if (!fn) {
          out[step.id] = { ok: false, error: `未知函数：'${cfg.name}'` }
          result.status = 'error'
          result.error = `step '${step.id}': 未知函数 '${cfg.name}'`
          return { k: 'return' }
        }
        if (rt.fnDepth >= 64) {
          out[step.id] = { ok: false, error: `函数递归深度超过 64（${cfg.name}）` }
          result.status = 'error'
          result.error = `step '${step.id}': 函数递归深度超过 64`
          return { k: 'return' }
        }
        // 参数求值（调用方 ctx）→ 局部 vars；函数体纯逻辑（不写调用方 steps）
        const localVars: Record<string, unknown> = {}
        try {
          for (let i = 0; i < fn.params.length; i++) {
            const argSrc = cfg.args?.[i] ?? 'undefined'
            localVars[fn.params[i]] = evaluateExpr(argSrc, ctx, `函数 '${cfg.name}' 参数 ${fn.params[i]}`)
          }
        } catch (e) {
          out[step.id] = { ok: false, error: (e as Error).message }
          result.status = 'error'
          result.error = `step '${step.id}': ${(e as Error).message}`
          return { k: 'return' }
        }
        const fnCtx: WorkflowCtx = { ...ctx, vars: localVars }
        rt.fnDepth++
        const fnFlow = await execSteps(fn.step.steps, fnCtx, env, registry, rt)
        rt.fnDepth--
        if (fnFlow.k === 'continue') {
          // 无 return → undefined
          out[step.id] = { ok: true, data: undefined }
        } else {
          out[step.id] = { ok: true, data: fnFlow.value }
        }
        result.executed.push(step.id)
        continue
      }
    }

    const handler = registry.get(step.type)
    if (!handler) {
      out[step.id] = { ok: false, error: `未注册步骤类型：'${step.type}'` }
      result.status = 'error'
      result.error = `step '${step.id}': 未注册类型 '${step.type}'`
      return { k: 'return' }
    }
    const config = (step.config ?? {}) as Record<string, unknown>
    try {
      let data: unknown
      if (rt.dry && handler.effects) {
        data = undefined
        out[step.id] = { ok: true, dry: true }
      } else {
        data = await handler.run(config, ctx, env)
        out[step.id] = { ok: true, data }
      }
      result.executed.push(step.id)
    } catch (e) {
      return fail(rt, step, e)
    }
  }
  return { k: 'continue' }
}

async function execIf(
  step: StepDef, cfg: IfConfig, ctx: WorkflowCtx, env: StepEnv, registry: RunnerRegistry, rt: Rt,
): Promise<Flow> {
  const { result, steps: out } = rt
  let satisfied: boolean
  try { satisfied = toBoolean(evaluateExpr(cfg.when, ctx, `if '${step.id}' 条件`)) }
  catch (e) {
    out[step.id] = { ok: false, error: `if 表达式错误：${(e as Error).message}` }
    result.status = 'error'
    result.error = `step '${step.id}': ${(e as Error).message}`
    return { k: 'return' }
  }
  out[step.id] = { ok: true, data: { satisfied } }
  result.executed.push(step.id)
  // 分支语义：true → then；false → else——子链执行后继续后续
  const chain = satisfied ? cfg.then : (cfg.else ?? undefined)
  return chain ? execSteps(chain.steps, ctx, env, registry, rt) : { k: 'continue' }
}

async function execTry(
  step: StepDef, cfg: TryConfig, ctx: WorkflowCtx, env: StepEnv, registry: RunnerRegistry, rt: Rt,
): Promise<Flow> {
  const { result, steps: out } = rt
  // try 子链执行——失败（fail 置 status=error + Flow return）→ catch 接管控住（流转继续）
  const preError = result.error
  const f = await execSteps(cfg.step.steps, ctx, env, registry, rt)
  if (f.k === 'return' && result.status === 'error' && result.error !== preError) {
    const err = result.error ?? '未知错误'
    out[step.id] = { ok: false, error: err } // steps.<tryId>.error 可读（步骤记录惯例：error 顶层）
    result.status = 'success' // catch 接管——恢复成功态
    result.error = undefined
    result.executed.push(step.id)
    if (cfg.catch?.steps.length) return execSteps(cfg.catch.steps, ctx, env, registry, rt)
    return { k: 'continue' }
  }
  // 成功路径（或函数 return 穿透——不误判）
  out[step.id] = { ok: true, data: {} }
  result.executed.push(step.id)
  return f
}

async function execWhile(
  step: StepDef, cfg: WhileConfig, ctx: WorkflowCtx, env: StepEnv, registry: RunnerRegistry, rt: Rt,
): Promise<Flow> {
  const { result, steps: out } = rt
  const maxIters = cfg.maxIters ?? 1000
  for (let i = 0; ; i++) {
    if (rt.signal?.aborted) {
      result.status = 'error'
      result.error = `aborted in while '${step.id}'`
      return { k: 'return' }
    }
    let cond: boolean
    try { cond = toBoolean(evaluateExpr(cfg.when, ctx, `while '${step.id}' 条件`)) }
    catch (e) {
      out[step.id] = { ok: false, error: `while 表达式错误：${(e as Error).message}` }
      result.status = 'error'
      result.error = `step '${step.id}': ${(e as Error).message}`
      return { k: 'return' }
    }
    if (!cond) {
      out[step.id] = { ok: true, data: { iterations: i } }
      result.executed.push(step.id)
      return { k: 'continue' }
    }
    if (i >= maxIters) {
      out[step.id] = { ok: false, error: `while 超过 maxIters=${maxIters}（防死循环）` }
      result.status = 'error'
      result.error = `step '${step.id}': while 超过 maxIters=${maxIters}`
      return { k: 'return' }
    }
    const flow = await execSteps(cfg.step.steps, ctx, env, registry, rt)
    if (flow.k !== 'continue') return flow
  }
}

async function execFor(
  step: StepDef, cfg: ForConfig, ctx: WorkflowCtx, env: StepEnv, registry: RunnerRegistry, rt: Rt,
): Promise<Flow> {
  const { result, steps: out } = rt
  let items: unknown
  try { items = evaluateExpr(cfg.items, ctx, `for '${step.id}' items`) }
  catch (e) {
    out[step.id] = { ok: false, error: `for 表达式错误：${(e as Error).message}` }
    result.status = 'error'
    result.error = `step '${step.id}': ${(e as Error).message}`
    return { k: 'return' }
  }
  if (!Array.isArray(items)) {
    out[step.id] = { ok: false, error: `for items 必须是数组（得到 ${String(items)}）` }
    result.status = 'error'
    result.error = `step '${step.id}': for items 非数组`
    return { k: 'return' }
  }
  const maxIters = cfg.maxIters ?? 1000
  if (items.length > maxIters) {
    out[step.id] = { ok: false, error: `for 超过 maxIters=${maxIters}（items ${items.length} 项）` }
    result.status = 'error'
    result.error = `step '${step.id}': for 超过 maxIters=${maxIters}`
    return { k: 'return' }
  }
  // 循环上下文（嵌套：保存外层，退出恢复）
  const prevLoop = ctx.loop
  for (let i = 0; i < items.length; i++) {
    if (rt.signal?.aborted) {
      result.status = 'error'
      result.error = `aborted in for '${step.id}'`
      return { k: 'return' }
    }
    ctx.loop = { item: items[i], index: i }
    const flow = await execSteps(cfg.step.steps, ctx, env, registry, rt)
    if (flow.k !== 'continue') { ctx.loop = prevLoop; return flow }
  }
  ctx.loop = prevLoop
  out[step.id] = { ok: true, data: { iterations: items.length } }
  result.executed.push(step.id)
  return { k: 'continue' }
}

/** 公共错误收口（同引用写步骤输出 + 终止） */
function fail(rt: Rt, step: StepDef, e: unknown): Flow {
  rt.steps[step.id] = { ok: false, error: (e as Error).message }
  rt.result.status = 'error'
  rt.result.error = `step '${step.id}' (${step.type}): ${(e as Error).message}`
  return { k: 'return' }
}

/** 表达式求值（std 纯函数环境注入——sum/avg/count…） */
function evaluateExpr(src: string, ctx: WorkflowCtx, where: string): unknown {
  try {
    return compile(src, STD_FNS)(ctx)
  } catch (e) {
    throw new Error(`表达式错误（${where}）：${(e as Error).message}`)
  }
}

export type { StepDef, StepOutput }
