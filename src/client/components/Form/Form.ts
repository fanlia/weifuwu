import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface ValidationRule {
  required?: boolean
  pattern?: RegExp
  minLength?: number
  maxLength?: number
  message: string
  /** 自定义验证函数，返回 true = 通过，false/string = 失败（string 会覆盖 message） */
  validator?: (value: any) => boolean | string | Promise<boolean | string>
}

export interface FormProps {
  /** 提交回调，接收字段名→值的对象 */
  onSubmit?: (values: Record<string, any>) => void | Promise<void>
  /** 验证规则：字段名 → 规则数组 */
  validation?: Record<string, ValidationRule[]>
  /** 验证失败时回调，接收字段名→错误消息的对象 */
  onError?: (errors: Record<string, string>) => void
  children?: any
}

/** 验证函数：字段值 → 验证规则 → 错误消息 */
export async function validateValues(
  values: Record<string, any>,
  rules: Record<string, ValidationRule[]>,
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {}
  for (const [field, fieldRules] of Object.entries(rules)) {
    const val = values[field] ?? ''
    for (const rule of fieldRules) {
      // required
      if (rule.required && !String(val).trim()) {
        errors[field] = rule.message
        break
      }
      // pattern
      if (rule.pattern && !rule.pattern.test(String(val))) {
        errors[field] = rule.message
        break
      }
      // minLength
      if (rule.minLength != null && String(val).length < rule.minLength) {
        errors[field] = rule.message
        break
      }
      // maxLength
      if (rule.maxLength != null && String(val).length > rule.maxLength) {
        errors[field] = rule.message
        break
      }
      // 自定义验证
      if (rule.validator) {
        const result = await rule.validator(val)
        if (result !== true) {
          errors[field] = typeof result === 'string' ? result : rule.message
          break
        }
      }
    }
  }
  return errors
}

export const Form: Component<FormProps> = (_init, _ctx) =>
  (props) => {
  const { validation, onSubmit, onError, children } = props

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const data = new FormData(form)
    const values: Record<string, any> = {}
    for (const [key, val] of data.entries()) {
      // 同名多值（如 checkbox[]）→ 数组
      if (key in values) {
        const prev = values[key]
        values[key] = Array.isArray(prev) ? [...prev, val] : [prev, val]
      } else {
        values[key] = val
      }
    }

    // 验证
    if (validation) {
      const errors = await validateValues(values, validation)
      if (Object.keys(errors).length > 0) {
        onError?.(errors)
        return
      }
      // 验证通过 → 清空错误
      onError?.({})
    }

    await onSubmit?.(values)
  }

  return h('form', {
    class: 'wf-form',
    onSubmit: handleSubmit,
    noValidate: validation ? true : undefined,
  }, children)
}
