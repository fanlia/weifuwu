/**
 * weifuwu/workflow/validate — WorkflowDef 校验（确定性闸门：LLM 生成 / 用户配置共用）
 *
 * 返回 { ok, errors[] }（不抛错——调用方决定呈现方式）。
 * 检查：steps 非空 / id 唯一 / type 在册 / config 必填 / when 可编译（表达式语法）
 */
import type { WorkflowDef } from './contracts.ts'
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

export function validate(def: unknown, registry: { has: (type: string) => boolean; schema: (type: string) => StepSchema | undefined }): ValidationResult {
  const errors: ValidationError[] = []
  const d = def as Partial<WorkflowDef>
  if (!Array.isArray(d?.steps) || d.steps.length === 0) {
    return { ok: false, errors: [{ path: 'steps', message: 'steps 必须为非空数组' }] }
  }
  const seen = new Set<string>()
  for (const [i, step] of d.steps.entries()) {
    const p = `steps[${i}]`
    if (!step || typeof step !== 'object') { errors.push({ path: p, message: 'step 必须是对象' }); continue }
    if (!step.id || typeof step.id !== 'string') errors.push({ path: `${p}.id`, message: '必填：唯一 id' })
    else if (seen.has(step.id)) errors.push({ path: `${p}.id`, message: `id 重复：'${step.id}'` })
    else seen.add(step.id)
    if (!step.type || typeof step.type !== 'string') {
      errors.push({ path: `${p}.type`, message: '必填：步骤类型' })
      continue
    }
    if (!registry.has(step.type)) {
      errors.push({ path: `${p}.type`, message: `未注册的步骤类型：'${step.type}'` })
      continue
    }
    const schema = registry.schema(step.type)
    const config = (step.config ?? {}) as Record<string, unknown>
    for (const field of schema?.required ?? []) {
      if (typeof config[field] !== 'string' || config[field] === '') {
        errors.push({ path: `${p}.config.${field}`, message: `必填：${field}` })
      }
    }
    if (step.when !== undefined && typeof step.when !== 'string') {
      errors.push({ path: `${p}.when`, message: '必须是字符串表达式' })
    } else if (typeof step.when === 'string') {
      try { compile(step.when) } catch (e) { errors.push({ path: `${p}.when`, message: `表达式错误：${(e as Error).message}` }) }
    }
    // if 步骤：config.when 必填（截断语义）
    if (step.type === 'if') {
      const when = (config as { when?: unknown }).when
      if (typeof when !== 'string' || when === '') errors.push({ path: `${p}.config.when`, message: 'if 步骤必填：when 表达式' })
      else { try { compile(when) } catch (e) { errors.push({ path: `${p}.config.when`, message: `表达式错误：${(e as Error).message}` }) } }
    }
  }
  return { ok: errors.length === 0, errors }
}
