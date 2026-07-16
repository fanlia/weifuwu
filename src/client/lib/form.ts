/**
 * useForm — 表单状态管理
 *
 * 自动绑定字段信号、验证、提交。
 *
 * ```tsx
 * const form = useForm({
 *   initial: { email: '', password: '' },
 *   validate: {
 *     email: (v) => !v.includes('@') && '请输入有效邮箱',
 *   },
 * })
 *
 * // 在 JSX 中
 * <input {...form.field('email')} placeholder="邮箱" />
 * {form.errors.email && <span class="text-red-500">{form.errors.email}</span>}
 *
 * <button onClick={() => form.submit((data) => ctx.login(data.email, data.password))}>
 *   登录
 * </button>
 * ```
 */

import { signal, type Signal } from '../signal.ts'

// ── 类型 ────────────────────────────────────────────────────

export type ValidationRule<T> = {
  [K in keyof T]?: (value: T[K], values: T) => string | false | undefined | null
}

export interface UseFormOptions<T extends Record<string, unknown>> {
  initial: T
  validate?: ValidationRule<T>
}

export interface UseFormResult<T extends Record<string, unknown>> {
  /** 绑定到 input 的属性：value + onInput */
  field: (name: keyof T) => { value: Signal<T[keyof T]>; onInput: (e: Event) => void }
  /** 字段错误信息（空字符串表示无错误） */
  errors: Record<keyof T, string | null>
  /** 字段是否已 touched（用户操作过） */
  touched: Record<keyof T, boolean>
  /** 整个表单是否有效 */
  valid: Signal<boolean>
  /** 表单数据快照（只读） */
  values: Signal<T>
  /** 提交 — 先验证，验证通过后调用 handler */
  submit: (handler: (data: T) => void | Promise<void>) => Promise<void>
  /** 重置到初始值 */
  reset: () => void
  /** 设置单个字段值 */
  setValue: <K extends keyof T>(name: K, value: T[K]) => void
  /** 批量设置字段值 */
  setValues: (partial: Partial<T>) => void
}

// ── 实现 ────────────────────────────────────────────────────

export function useForm<T extends Record<string, unknown>>(
  opts: UseFormOptions<T>,
): UseFormResult<T> {
  const fields = new Map<keyof T, Signal<any>>()
  const errors: Record<string, string | null> = {}
  const touched: Record<string, boolean> = {}

  // 初始化字段信号
  for (const key of Object.keys(opts.initial) as (keyof T)[]) {
    fields.set(key, signal(opts.initial[key]))
    errors[key as string] = null
    touched[key as string] = false
  }

  const valid = signal(true)
  const values = signal<T>({ ...opts.initial })

  // 更新 values 快照
  function snapshot() {
    const data: Record<string, unknown> = {}
    for (const [key, sig] of fields) {
      data[key as string] = sig.value
    }
    values.value = data as T
  }

  // 验证单个字段
  function validateField(name: keyof T): string | null {
    if (!opts.validate) return null
    const rule = opts.validate[name]
    if (!rule) return null
    const sig = fields.get(name)
    const result = rule(sig!.value, values.value)
    const error = result && typeof result === 'string' ? result : null
    errors[name as string] = error
    return error
  }

  // 验证所有字段
  function validateAll(): boolean {
    if (!opts.validate) return true
    let allValid = true
    for (const key of Object.keys(opts.initial) as (keyof T)[]) {
      const err = validateField(key)
      if (err) allValid = false
    }
    valid.value = allValid
    return allValid
  }

  return {
    field(name) {
      let sig = fields.get(name)
      if (!sig) {
        sig = signal(opts.initial[name])
        fields.set(name, sig)
      }

      return {
        value: sig,
        onInput(e: Event) {
          const target = e.target as HTMLInputElement
          touched[name as string] = true
          if (target.type === 'checkbox') {
            sig.value = target.checked as any
          } else {
            sig.value = (target as any).value as T[keyof T]
          }
          snapshot()
          validateField(name)
        },
      }
    },

    get errors() { return errors as Record<keyof T, string | null> },
    get touched() { return touched as Record<keyof T, boolean> },
    valid,

    get values() { return values },

    async submit(handler) {
      if (!validateAll()) return
      const data: Record<string, unknown> = {}
      for (const [key, sig] of fields) {
        data[key as string] = sig.value
      }
      await handler(data as T)
    },

    reset() {
      for (const key of Object.keys(opts.initial) as (keyof T)[]) {
        const sig = fields.get(key)
        if (sig) sig.value = opts.initial[key]
        errors[key as string] = null
        touched[key as string] = false
      }
      valid.value = true
      snapshot()
    },

    setValue(name, value) {
      const sig = fields.get(name)
      if (sig) sig.value = value
      snapshot()
      validateField(name)
    },

    setValues(partial) {
      for (const [key, value] of Object.entries(partial)) {
        const sig = fields.get(key)
        if (sig) sig.value = value as any
      }
      snapshot()
      validateAll()
    },
  }
}
