/**
 * weifuwu/workflow — 声明式执行引擎（模块即客户端，worker 友好——同 ai() 模式）
 *
 * ```ts
 * import { workflow } from 'weifuwu'
 *
 * const wf = workflow({
 *   ai: a,        // 可选：ai 步骤适配器（ai() 模块实例）
 *   email: mail,  // 可选：email 步骤适配器（email() 模块实例）
 *   log: (line) => console.log(line),
 * })
 *
 * const def = {
 *   steps: [
 *     { id: 'probe', type: 'http', config: { url: 'https://api.example.com/items' } },
 *     { id: 'gate', type: 'if', config: { when: 'steps.probe.data.json.items exists' } },
 *     { id: 'notify', type: 'email', config: { to: 'ops@x.com', subject: '预警', body: '{{steps.probe.data.json.items}}' } },
 *   ],
 * }
 * wf.validate(def)            // → { ok, errors[] }
 * const r = await wf.execute(def)   // → RunResult（worker / 脚本 / 请求内均可）
 * await wf.execute(def, { mode: 'dry' })  // 副作用打桩
 * ```
 *
 * 范围（诚实裁剪）：框架层只做"给定定义 → 执行 → 逐步结果"——
 * 调度装配（scheduler.cron / queue worker）与存储（REST/多租户）
 * 由消费方组合（agent-platform 第二阶段）。
 */
import type { ExecuteOptions, RunResult, StepEnv, StepHandler, WorkflowDef } from './contracts.ts'
import type { Redis } from '../db/contracts.ts'
import { builtinSteps } from './steps.ts'
import { runWorkflow } from './runner.ts'
import { redisStore, type KVStore } from './store.ts'
import { validate, type StepSchema, type ValidationResult } from './validate.ts'

export type { ExecuteOptions, RunResult, RunStatus, StepDef, StepEnv, StepHandler, StepOutput, WorkflowCtx, WorkflowDef } from './contracts.ts'
export type { ValidationResult } from './validate.ts'
export { redisStore } from './store.ts'
export type { KVStore } from './store.ts'
export { compile, evaluate, evaluateBoolean, interpolate, parse } from './expression.ts'
export type { ExprNode, CompiledExpr } from './expression.ts'

export interface WorkflowOptions {
  /** ai 步骤适配器（ai() 模块实例——worker 场景直接 a.chat()） */
  ai?: StepEnv['ai']
  /** email 步骤适配器（email() 模块实例） */
  email?: StepEnv['email']
  fetch?: typeof fetch
  log?: (line: string) => void
  /** KV 存储后端（store 步骤）——传入 redis 客户端（自研 Redis 接口）自动适配；或直接传 KVStore */
  redis?: Redis
  store?: KVStore
}

export interface WorkflowEngine {
  /** 校验 WorkflowDef（回归门：LLM 生成 / 用户配置共用同一闸门） */
  validate: (def: unknown) => ValidationResult
  /** 执行（live / dry） */
  execute: (def: WorkflowDef, opts?: ExecuteOptions) => Promise<RunResult>
  /** 注册自定义步骤（框架内置 5 类之外扩展） */
  registerStep: (handler: StepHandler) => void
  /** 已注册步骤类型清单（schema 元数据——UI 渲染 / LLM 约束共用） */
  stepSchemas: () => { type: string; label?: string; fields?: StepSchema['fields']; required: string[] }[]
}

export function workflow(options?: WorkflowOptions): WorkflowEngine {
  const handlers = new Map<string, StepHandler>()
  for (const s of builtinSteps()) handlers.set(s.type, s)

  const env: StepEnv = {
    fetch: options?.fetch,
    ai: options?.ai,
    email: options?.email,
    log: options?.log,
    store: options?.store ?? (options?.redis ? redisStore(options.redis) : undefined),
  }
  const registry = {
    get: (type: string) => handlers.get(type),
    has: (type: string) => handlers.has(type),
    schema: (type: string): StepSchema | undefined => {
      const h = handlers.get(type)
      if (!h) return undefined
      return { required: h.required ?? [], fields: h.fields }
    },
  }

  return {
    validate: (def) => validate(def, registry),
    execute: (def, opts) => runWorkflow(def, opts ?? {}, env, registry),
    registerStep: (handler) => { handlers.set(handler.type, handler) },
    stepSchemas: () => [...handlers.values()].map((h) => ({
      type: h.type,
      label: h.label,
      fields: h.fields,
      required: h.required ?? [],
    })),
  }
}
