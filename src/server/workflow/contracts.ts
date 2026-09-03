/**
 * weifuwu/workflow — 契约类型（引擎公共接口单一来源）
 *
 * WorkflowDef（触发 + 步骤链）→ ctx 数据流（steps.<id> 命名空间 + vars.<name> 变量）
 * → RunResult（逐步骤结果 + 分支语义）。
 *
 * 语义红线（docs/server.md 同步——与 JS 心智对齐，v0.2 定版）：
 *   - 分支：if 不通过 → 走 else（无 else 则跳过子链），**后续继续**（非错误非"跳过"）
 *   - 终止：return 步骤（无值）→ 整流程终止，status='success'（JS 顶层 return 同义）
 *   - 短路：步骤级 when 不通过 → 跳过该步（skippedSteps），后续继续
 *   - edge：「发一次」——静默 = 不执行子链且**继续后续**（不再截断）
 *   - dry-run：副作用步骤打桩 { dry: true }；http 真跑（用户要看数据）
 */
import type { EdgeStore } from './edge.ts'

/** 步骤定义：{ id, type, config?, when? } —— when 为布尔表达式（expression 模块） */
export interface StepDef {
  /** 步骤唯一 id（ctx 命名空间 key） */
  id: string
  /**
   * 步骤类型：内建链步骤（assign/if/while/for/return——runner 直接解释）
   * 或注册表类型（http/template/ai/email/log——handler 执行）
   */
  type: string
  /** 类型专属配置（内建 schema 或步骤注册表校验） */
  config?: Record<string, unknown>
  /** 前置条件表达式：不通过 → 跳过本步（后续继续） */
  when?: string
}

/** 子链（if.then/else、while.step、for.step 复用——同构于顶层 steps） */
export interface StepChain {
  steps: StepDef[]
}

/** assign 步骤：value 表达式求值 → ctx.vars[target] */
export interface AssignConfig {
  target: string
  value: string
}

/** if 步骤：分支语义（then/else 子链执行后**继续后续**；edge=「发一次」去重） */
export interface IfConfig {
  when: string
  then?: StepChain
  else?: StepChain
  /** edge 去重：上升沿执行 then；静默 = 跳过子链继续后续；变假重新武装 */
  edge?: boolean
  /** edge 存储键（默认 wf:edge:<def>:<step.id>） */
  key?: string
}

/** while 步骤：条件为真循环执行 step 子链（maxIters 硬上限防死循环，默认 1000） */
export interface WhileConfig {
  when: string
  step: StepChain
  maxIters?: number
}

/** for 步骤：items 表达式（数组）逐项执行 step 子链（loop.item/loop.index 注入 ctx） */
export interface ForConfig {
  items: string
  step: StepChain
  maxIters?: number
}

/** return 步骤：无值 → 终止整流程（success）；有值 → W8 函数返回语义 */
export interface ReturnConfig {
  value?: string
}

/** 工作流定义：触发 + 步骤链（触发语义由消费方装配——scheduler cron / 手动 / webhook） */
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
  /** assign 变量命名空间（vars.<name>） */
  vars: Record<string, unknown>
  /** for 循环当前项（仅循环体内非空——嵌套循环内层覆盖，退出恢复） */
  loop?: { item: unknown; index: number }
  /** 手动触发时注入的初始数据 */
  input?: unknown
}

export type RunStatus = 'success' | 'error'

export interface RunResult {
  status: RunStatus
  /** 执行了哪些步骤（顺序）——when 跳过的步骤不在其中 */
  executed: string[]
  /** when 不通过被跳过的步骤（非错误——后续步骤继续执行） */
  skippedSteps: string[]
  stepResults: Record<string, StepOutput>
  /** 终止原因（error = 步骤失败 / abort）——success 时无 */
  error?: string
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

/** 内建链步骤类型（runner 直接解释——不进 registry；validate 特判） */
export const BUILTIN_TYPES = ['assign', 'if', 'while', 'for', 'return'] as const
