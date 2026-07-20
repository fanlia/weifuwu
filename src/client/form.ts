/**
 * weifuwu/client useForm — 表单状态管理
 *
 * 提供字段绑定、验证、提交、重置等功能，零依赖。
 *
 * ```tsx
 * const form = useForm({
 *   initial: { name: '', email: '' },
 *   validate: {
 *     name: (v) => !v ? '请输入姓名' : null,
 *     email: (v) => !v.includes('@') ? '邮箱格式错误' : null,
 *   },
 *   onSubmit: async (values) => {
 *     await fetch('/api/users', { method: 'POST', body: JSON.stringify(values) })
 *   },
 * })
 *
 * // 在 JSX 中：
 * <form onSubmit={form.handleSubmit}>
 *   <input {...form.field('name')} placeholder="姓名" />
 *   <Show when={form.errors.value.name}>
 *     <p class="text-red-500">{form.errors.value.name}</p>
 *   </Show>
 *   <input {...form.field('email')} placeholder="邮箱" />
 *   <button type="submit" disabled={form.submitting}>
 *     {form.submitting.value ? '提交中...' : '提交'}
 *   </button>
 * </form>
 * ```
 */

import { signal, type Signal } from './signal.ts'

type Validator<T> = (value: T) => string | null

/**
 * 表单验证规则定义。
 * 每个字段可以是一个 validator 函数，或 validator 函数数组。
 *
 * ```ts
 * const form = useForm({
 *   initial: { password: '' },
 *   validate: {
 *     password: [
 *       (v) => v.length < 6 ? '至少6位' : null,
 *       (v) => !/[A-Z]/.test(v) ? '需要大写字母' : null,
 *     ],
 *   },
 * })
 * ```
 */
export type FormValidators<T> = {
  [K in keyof T]?: Validator<T[K]> | Validator<T[K]>[]
}

export interface FormOptions<T extends Record<string, unknown>> {
  /** 表单初始值 */
  initial: T
  /** 验证规则（可选） */
  validate?: FormValidators<T>
  /** 提交回调（可选） */
  onSubmit?: (values: T) => Promise<void> | void
}

export interface FormFieldBindings {
  value: string
  onInput: (e: Event) => void
  onChange?: (e: Event) => void
}

export interface FormReturn<T extends Record<string, unknown>> {
  /** 表单当前值信号 */
  values: Signal<T>
  /** 表单错误信号 */
  errors: Signal<Partial<Record<keyof T, string | null>>>
  /** 是否正在提交 */
  submitting: Signal<boolean>
  /** 被触碰过的字段集合 */
  touched: Signal<Partial<Record<keyof T, boolean>>>
  /** 表单提交处理函数（绑定到 <form>） */
  handleSubmit: (e: Event) => void
  /** 获取某个字段的绑定对象（value + onInput） */
  field: (name: keyof T) => FormFieldBindings & { error: Signal<string | null | undefined> }
  /** 设置指定字段的值 */
  setValue: (name: keyof T, value: T[keyof T]) => void
  /** 重置表单到初始值 */
  reset: () => void
  /** 手动触发全部验证，返回是否有错误 */
  validateAll: () => boolean
}

/**
 * 创建表单状态管理器。
 *
 * 支持多个 validator 数组、提交状态、触碰追踪等。
 *
 * ```tsx
 * const form = useForm({
 *   initial: { name: '', email: '' },
 *   validate: {
 *     email: (v) => !v.includes('@') ? '邮箱格式错误' : null,
 *   },
 *   onSubmit: async (values) => console.log('提交', values),
 * })
 *
 * return (
 *   <form onSubmit={form.handleSubmit}>
 *     <input {...form.field('name')} />
 *     <span>{form.errors.value.name}</span>
 *     <button type="submit">保存</button>
 *   </form>
 * )
 * ```
 */
export function useForm<T extends Record<string, unknown>>(
  options: FormOptions<T>,
): FormReturn<T> {
  const values = signal<T>({ ...options.initial })
  const errors = signal<Partial<Record<keyof T, string | null>>>({})
  const submitting = signal<boolean>(false)
  const touched = signal<Partial<Record<keyof T, boolean>>>({})

  function getValidators(name: keyof T): Validator<any>[] {
    const rules = options.validate?.[name]
    if (!rules) return []
    return Array.isArray(rules) ? rules : [rules]
  }

  function validateField(name: keyof T, value: T[keyof T]): string | null {
    const validators = getValidators(name)
    for (const v of validators) {
      const err = v(value)
      if (err !== null) return err
    }
    return null
  }

  function validateAllFields(): boolean {
    const newErrors: Partial<Record<keyof T, string | null>> = {}
    let hasError = false
    for (const key of Object.keys(values.value) as Array<keyof T>) {
      const err = validateField(key, values.value[key])
      newErrors[key] = err
      if (err !== null) hasError = true
    }
    errors.value = newErrors
    return !hasError
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    if (submitting.value) return

    // 标记所有字段为已触碰
    const allTouched: Partial<Record<keyof T, boolean>> = {}
    for (const key of Object.keys(values.value) as Array<keyof T>) {
      allTouched[key] = true
    }
    touched.value = allTouched

    // 验证所有字段
    if (!validateAllFields()) return

    if (options.onSubmit) {
      submitting.value = true
      const result = options.onSubmit({ ...values.value })
      if (result instanceof Promise) {
        result.finally(() => { submitting.value = false })
      } else {
        submitting.value = false
      }
    }
  }

  function field(name: keyof T): FormFieldBindings & { error: Signal<string | null | undefined> } {
    // 创建一个计算字段错误的信号
    const fieldError = {
      get value(): string | null | undefined {
        return errors.value[name]
      },
    } as Signal<string | null | undefined>

    return {
      get value(): string {
        return String(values.value[name] ?? '')
      },
      onInput(e: Event) {
        const target = e.target as HTMLInputElement
        const newVal = target.type === 'checkbox' ? target.checked as any : target.value as any
        const newValues = { ...values.value, [name]: newVal }
        values.value = newValues

        // 如果该字段已被触碰，实时验证
        if (touched.value[name]) {
          const err = validateField(name, newVal)
          errors.value = { ...errors.value, [name]: err }
        }
      },
      get error(): Signal<string | null | undefined> {
        return fieldError
      },
    }
  }

  function setValue(name: keyof T, value: T[keyof T]) {
    values.value = { ...values.value, [name]: value }
  }

  function reset() {
    values.value = { ...options.initial }
    errors.value = {}
    touched.value = {}
    submitting.value = false
  }

  return {
    values,
    errors,
    submitting,
    touched,
    handleSubmit,
    field,
    setValue,
    reset,
    validateAll: validateAllFields,
  }
}
