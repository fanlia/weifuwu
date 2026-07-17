/**
 * useModel — 表单双向绑定
 *
 * 一行代码绑定 signal 到 input 元素，省去手动 onInput 处理。
 *
 * ```tsx
 * // 文本输入
 * const name = signal('')
 * <input {...useModel(name)} placeholder="姓名" />
 *
 * // 复选框
 * const agreed = signal(false)
 * <input type="checkbox" {...useModel(agreed)} /> 同意
 *
 * // 选择框
 * const city = signal('')
 * <select {...useModel(city)}>
 *   <option value="beijing">北京</option>
 * </select>
 * ```
 *
 * useModel 返回 { value, onInput }，可直接 spread 到 <input> / <select> / <textarea>。
 * 对 type="checkbox" 自动处理 checked 而非 value。
 */

import { type Signal } from '../signal.ts'

export interface UseModelResult<T> {
  value: Signal<T>
  onInput: (e: Event) => void
}

/**
 * 创建双向绑定属性。
 *
 * @param sig 绑定的 signal
 * @returns { value, onInput } — spread 到 input/select/textarea
 */
export function useModel<T = string>(sig: Signal<T>): UseModelResult<T> {
  return {
    value: sig,
    onInput(e: Event) {
      const target = e.target as any
      if (target.type === 'checkbox') {
        ;(sig as unknown as Signal<boolean>).value = target.checked as any
      } else {
        sig.value = target.value as T
      }
    },
  }
}
