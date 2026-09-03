/**
 * weifuwu/workflow — 契约类型（引擎公共接口单一来源）
 *
 * WorkflowDef（触发 + 线性步骤链）→ ctx 数据流（steps.<id> 命名空间）
 * → RunResult（逐步骤结果 + 短路/跳过语义）。
 *
 * 语义红线（docs/server.md 同步）：
 *   - 短路：if 不通过 → 后续不执行，status='skipped'（非错误）
 *   - dry-run：副作用步骤打桩 { dry: true }；http 真跑（用户要看数据）
 *   - 每步输出统一 { ok, data?, error? }
 */
import type { EdgeStore } from './edge.ts'

/** 步骤定义：{ id, type, config?, when? } —— when 为布尔表达式（expression 模块） */
export interface StepDef {
  /** 步骤唯一 id（ctx 命名空间 key） */
  id: string
  /** 注册表类型：http | template | if | ai | email | log | ... */
  type: string
  /** 类型专属配置（注册表 schema 校验） */
  config?: Record<string, unknown>
  /** 前置条件表达式：不通过 → 跳过本步（**后续继续**——截断由 if 步骤承担） */
  when?: string
}

/** 工作流定义：触发 + 线性步骤链（触发语义由消费方装配——scheduler cron / 手动 / webhook） */
export interface WorkflowDef {
  /** 由消费方赋予（DB id）——引擎自身不要求 */
  id?: string
  name?: string
  steps: StepDef[]
}

/** 步骤输出（落 ctx.steps.<id>） */
export interface StepOutput {
  ok: boolean
  data?: unknown
  error?: string
  /** dry-run 打桩标记：真执行时该步未产生副作用 */
  dry?: boolean
}

/** 运行上下文：步骤间唯一传递通道 */
export interface WorkflowCtx {
  steps: Record<string, StepOutput>
  /** 手动触发时注入的初始数据 */
  input?: unknown
}

export type RunStatus = 'success' | 'skipped' | 'error'

export interface RunResult {
  status: RunStatus
  /** 执行了哪些步骤（顺序）——skipped 步骤不在其中，记录末次截断原因在 error/skippedReason */
  executed: string[]
  /** when 不通过被跳过的步骤（非错误——后续步骤继续执行） */
  skippedSteps: string[]
  stepResults: Record<string, StepOutput>
  /** 截断/终止信息：error = 步骤失败；skippedReason = if 短路 */
  error?: string
  skippedReason?: string
  dry: boolean
  startedAt: number
  finishedAt: number
}

/** 执行模式：live 真执行（副作用真发生）；dry 打桩副作用步骤 */
export type RunMode = 'live' | 'dry'

/** 步骤字段声明（人话渲染 / UI 表单 / LLM 约束共享） */
export interface StepField {
  name: string
  label: string
  type?: string
  placeholder?: string
}

/** 步骤执行器：注册表类型 → run(config, ctx, env) → output */
export interface StepHandler {
  /** 步骤类型名（注册 key） */
  type: string
  /** 中文标签 + 字段 schema（人话渲染 / LLM 生成约束 / 校验共用） */
  label?: string
  fields?: StepField[]
  /** 必填字段名（config 必须存在且非空字符串） */
  required?: string[]
  /** 执行（同步或异步均可；失败抛错 → runner 捕获记 error） */
  run: (config: Record<string, unknown>, ctx: WorkflowCtx, env: StepEnv) => Promise<unknown> | unknown
  /** 副作用面（默认 false）：dry 模式下打桩不执行 */
  effects?: boolean
}

/** 步骤执行环境（适配器注入——ai/email 等外部能力 + edge 去重存储） */
export interface StepEnv {
  fetch?: typeof fetch
  ai?: {
    chat: (params: { messages: { role: string; content: string }[] }) => Promise<{ content: string }>
  }
  email?: {
    send: (msg: { to: string | string[]; subject: string; body: string }) => Promise<{ ok: boolean; id?: string }>
  }
  /** edge 去重存储（if 步骤 config.edge 需要）——未注入时 edge 配置报明确错误 */
  edge?: EdgeStore
  log?: (line: string) => void
}

/** 单次执行的入参（execute 签名） */
export interface ExecuteOptions {
  mode?: RunMode
  /** 手动触发注入的初始数据（ctx.input） */
  input?: unknown
  signal?: AbortSignal
}
