/**
 * weifuwu/workflow/validate — WorkflowDef 校验（确定性闸门：LLM 生成 / 用户配置共用）
 *
 * 返回 { ok, errors[] }（不抛错——调用方决定呈现方式）。
 * 检查：steps 非空 / id 唯一（子链递归）/ type 在册（内建或注册表）/ config 必填
 * / 表达式可编译（when/assign.value/if.when/while.when/for.items/return.value）
 * 递归深度上限（防御畸形输入）。
 */
import type { WorkflowDef, StepDef } from './contracts.ts'
import { BUILTIN_TYPES } from './contracts.ts'
import { compile } from './expression.ts'

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
  validateChain(d.steps, 'steps', registry, errors, seen, 0)
  return { ok: errors.length === 0, errors }
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
