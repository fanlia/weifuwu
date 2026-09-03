/**
 * weifuwu/workflow/validate — WorkflowDef 校验（确定性闸门：LLM 生成 / 用户配置共用）
 *
 * 返回 { ok, errors[] }（不抛错——调用方决定呈现方式）。
 * 检查：steps 非空 / id 唯一（子链递归）/ type 在册（内建或注册表）/ config 必填
 * / 表达式可编译（when/assign.value/if.when/while.when/for.items/return.value）
 * / 变量自足（vars.* 引用必须已声明、steps.* 引用必须是已知步骤 id——防运行期 undefined 暗雷）
 * 递归深度上限（防御畸形输入）。
 */
import type { WorkflowDef, StepDef } from './contracts.ts'
import { BUILTIN_TYPES } from './contracts.ts'
import { compile, parse } from './expression.ts'
import type { ExprNode } from './expression.ts'

export interface ValidationError {
  path: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationError[]
}

export type StepSchema = {
  /** 必填字段名（config 中必须存在且非空字符串） */
  required: string[]
  /** 字段声明（人话渲染 / UI 表单 / LLM 约束共享） */
  fields?: { name: string; label: string; type?: string; placeholder?: string }[]
}

const MAX_DEPTH = 16

export function validate(def: unknown, registry: { has: (type: string) => boolean; schema: (type: string) => StepSchema | undefined }): ValidationResult {
  const errors: ValidationError[] = []
  const d = def as Partial<WorkflowDef>
  if (!Array.isArray(d?.steps) || d.steps.length === 0) {
    return { ok: false, errors: [{ path: 'steps', message: 'steps 必须为非空数组' }] }
  }
  const seen = new Set<string>()
  // 变量自足：pass 1 收集声明（vars: assign target 并集；steps: 全部步骤 id）——IR 层 vars 是全局命名空间
  const declaredVars = new Set<string>()
  const stepIds = new Set<string>()
  collectDecls(d as WorkflowDef, declaredVars, stepIds)
  validateChain(d.steps, 'steps', registry, errors, seen, 0)
  // pass 2：表达式/模板引用检查（vars.* 与 steps.* 的存在性）
  const refChecks: { path: string; expr: string }[] = []
  collectRefs(d as WorkflowDef, refChecks)
  for (const rc of refChecks) {
    let ast: ExprNode
    try { ast = parse(rc.expr) } catch { continue } // 语法错已由 checkExprField 报
    checkRefs(ast, declaredVars, stepIds, rc.path, errors)
  }
  return { ok: errors.length === 0, errors }
}

/** 声明收集（遍历树：assign target → vars；全部步骤 id → steps 引用域） */
function collectDecls(def: WorkflowDef, declaredVars: Set<string>, stepIds: Set<string>): void {
  const walk = (steps: StepDef[]): void => {
    for (const s of steps) {
      stepIds.add(s.id)
      const cfg = (s.config ?? {}) as Record<string, unknown>
      if (s.type === 'assign' && typeof cfg.target === 'string') declaredVars.add(cfg.target)
      const sub = cfg.then as { steps?: unknown } | undefined
      if (sub && Array.isArray(sub.steps)) walk(sub.steps as StepDef[])
      const sub2 = cfg.else as { steps?: unknown } | undefined
      if (sub2 && Array.isArray(sub2.steps)) walk(sub2.steps as StepDef[])
      const chain = cfg.step as { steps?: unknown } | undefined
      if (chain && Array.isArray(chain.steps)) walk(chain.steps as StepDef[])
    }
  }
  walk(def.steps)
  for (const f of def.functions ?? []) {
    for (const p of f.params ?? []) declaredVars.add(p)
    walk(f.step.steps)
  }
}

/** 引用收集：所有表达式/模板串字段（内置 template 值/URL/body 含 {{}} 插值） */
function collectRefs(def: WorkflowDef, out: { path: string; expr: string }[]): void {
  const walk = (steps: StepDef[], prefix: string): void => {
    for (const s of steps) {
      const cfg = (s.config ?? {}) as Record<string, unknown>
      const p = `${prefix}/${s.id}`
      if (s.type === 'assign') { pushE(cfg.value, `${p}.value`); }
      else if (s.type === 'if') {
        pushE(cfg.when, `${p}.when`)
        for (const b of ['then', 'else'] as const) {
          const chain = cfg[b] as { steps?: unknown } | undefined
          if (chain && Array.isArray(chain.steps)) walk(chain.steps as StepDef[], `${p}.${b}`)
        }
      } else if (s.type === 'while') { pushE(cfg.when, `${p}.when`); }
      else if (s.type === 'for') { pushE(cfg.items, `${p}.items`); }
      else if (s.type === 'return') { pushE(cfg.value, `${p}.value`); }
      else if (s.type === 'call') {
        for (const [i, a] of (cfg.args as unknown[] ?? []).entries()) pushE(a, `${p}.args[${i}]`)
      } else {
        // 内建模板字段：全部值按模板串处理（{{}} 插值）
        for (const [k, v] of Object.entries(cfg)) {
          if (typeof v === 'string') pushTemplate(v, `${p}.${k}`)
          else if (v && typeof v === 'object' && !Array.isArray(v)) walkObj(v, `${p}.${k}`)
        }
      }
      if (typeof s.when === 'string') pushE(s.when, `${p}.when`)
    }
  }
  const walkObj = (obj: object, prefix: string): void => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') pushTemplate(v, `${prefix}.${k}`)
      else if (v && typeof v === 'object' && !Array.isArray(v)) walkObj(v as Record<string, unknown>, `${prefix}.${k}`)
    }
  }
  const pushE = (v: unknown, path: string): void => { if (typeof v === 'string') out.push({ path, expr: v }) }
  const pushTemplate = (v: string, path: string): void => {
    for (const m of v.matchAll(/\{\{([\s\S]+?)\}\}/g)) out.push({ path, expr: m[1].trim() })
  }
  walk(def.steps, 'steps')
  for (const f of def.functions ?? []) walk(f.step.steps, `functions.${f.name}`)
}

/** 引用检查：path 首段 vars/steps → 存在性；loop/input 系统根放行 */
function checkRefs(node: ExprNode | null, declaredVars: Set<string>, stepIds: Set<string>, path: string, errors: ValidationError[]): void {
  if (!node || typeof node !== 'object') return
  if ('segments' in node && Array.isArray(node.segments)) {
    const first = node.segments[0]
    if (first === 'vars' && node.segments[1] === 'loop') return // vars.loop.* 系统根放行（循环当前项）
    if (first === 'vars' && typeof node.segments[1] === 'string' && !declaredVars.has(node.segments[1])) {
      errors.push({ path, message: `未声明变量引用：vars.${node.segments[1]}（须有 assign target 声明）` })
    } else if (first === 'steps' && typeof node.segments[1] === 'string' && !stepIds.has(node.segments[1])) {
      errors.push({ path, message: `未知步骤引用：steps.${node.segments[1]}（须是已定义步骤 id）` })
    }
    return
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') checkRefs(v as ExprNode, declaredVars, stepIds, path, errors)
  }
}

function validateChain(
  steps: StepDef[], prefix: string, registry: { has: (t: string) => boolean; schema: (t: string) => StepSchema | undefined },
  errors: ValidationError[], seen: Set<string>, depth: number,
): void {
  if (depth > MAX_DEPTH) { errors.push({ path: prefix, message: `子链嵌套超过 ${MAX_DEPTH} 层` }); return }
  for (const [i, step] of steps.entries()) {
    const p = `${prefix}[${i}]`
    if (!step || typeof step !== 'object') { errors.push({ path: p, message: 'step 必须是对象' }); continue }
    if (!step.id || typeof step.id !== 'string') errors.push({ path: `${p}.id`, message: '必填：唯一 id' })
    else if (seen.has(step.id)) errors.push({ path: `${p}.id`, message: `id 重复：'${step.id}'` })
    else seen.add(step.id)
    if (!step.type || typeof step.type !== 'string') {
      errors.push({ path: `${p}.type`, message: '必填：步骤类型' })
      continue
    }
    if (!BUILTIN_TYPES.includes(step.type as never) && !registry.has(step.type)) {
      errors.push({ path: `${p}.type`, message: `未注册的步骤类型：'${step.type}'` })
      continue
    }
    const config = (step.config ?? {}) as Record<string, unknown>
    // 内建类型的专属校验（注册表步骤走 schema.required）
    switch (step.type) {
      case 'assign':
        checkExprField(config, 'target', '目标变量名', errors, `${p}.config.target`, false)
        checkExprField(config, 'value', '赋值表达式', errors, `${p}.config.value`, false)
        break
      case 'if': {
        checkExprField(config, 'when', '条件表达式', errors, `${p}.config.when`, false)
        for (const branch of ['then', 'else'] as const) {
          const chain = config[branch] as { steps?: unknown } | undefined
          if (chain !== undefined) {
            if (!Array.isArray(chain.steps)) errors.push({ path: `${p}.config.${branch}.steps`, message: '必须是步骤数组' })
            else validateChain(chain.steps as StepDef[], `${p}.config.${branch}.steps`, registry, errors, seen, depth + 1)
          }
        }
        break
      }
      case 'while': {
        checkExprField(config, 'when', '循环条件', errors, `${p}.config.when`, false)
        validateChainField(config, 'step', registry, errors, seen, depth, p, 'steps')
        break
      }
      case 'for': {
        checkExprField(config, 'items', '集合表达式', errors, `${p}.config.items`, false)
        validateChainField(config, 'step', registry, errors, seen, depth, p, 'steps')
        break
      }
      case 'return': {
        if (config.value !== undefined) checkExprField(config, 'value', '返回值表达式', errors, `${p}.config.value`, true)
        break
      }
      default: {
        const schema = registry.schema(step.type)
        for (const field of schema?.required ?? []) {
          if (typeof config[field] !== 'string' || config[field] === '') {
            errors.push({ path: `${p}.config.${field}`, message: `必填：${field}` })
          }
        }
      }
    }
    if (step.when !== undefined && typeof step.when !== 'string') {
      errors.push({ path: `${p}.when`, message: '必须是字符串表达式' })
    } else if (typeof step.when === 'string') {
      try { compile(step.when) } catch (e) { errors.push({ path: `${p}.when`, message: `表达式错误：${(e as Error).message}` }) }
    }
  }
}

/** 子链字段（while.step / for.step）：{ steps: [...] } */
function validateChainField(
  config: Record<string, unknown>, field: string,
  registry: { has: (t: string) => boolean; schema: (t: string) => StepSchema | undefined },
  errors: ValidationError[], seen: Set<string>, depth: number, p: string, ctxPath: string,
): void {
  const chain = config[field] as { steps?: unknown } | undefined
  if (!chain || !Array.isArray(chain.steps)) {
    errors.push({ path: `${p}.config.${field}.${ctxPath}`, message: '必须是步骤数组' })
    return
  }
  validateChain(chain.steps as StepDef[], `${p}.config.${field}.${ctxPath}`, registry, errors, seen, depth + 1)
}

/** 必填字符串字段 + 表达式编译检查（required=true 时允许为空——return.value 可为 undefined 但提供了必须编译） */
function checkExprField(
  config: Record<string, unknown>, field: string, label: string,
  errors: ValidationError[], path: string, optional: boolean,
): void {
  const v = config[field]
  if (typeof v !== 'string' || v === '') {
    if (!optional) errors.push({ path, message: `必填：${label}` })
    return
  }
  try { compile(v) } catch (e) { errors.push({ path, message: `表达式错误：${(e as Error).message}` }) }
}
