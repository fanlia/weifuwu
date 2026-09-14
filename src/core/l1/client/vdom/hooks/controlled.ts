/**
 * vdom hooks — useControlled（受控值——受控 props 语义）
 *
 * 规则（设计规则 §5.2/§5.3）：受控值由父独占——onChange 唯一出口；
 * 非受控内部状态（hook 状态缓存——渲染期调用——读最新 props）；
 * 受控缺回调 warn（静默不可用防护）。
 */

import type { HookEnv } from './env.ts'

/** useControlled 选项（ui-dom 兼容——含 name——组件消费） */
export interface ControlledOptions<T> {
  value?: T
  onChange?: (v: T) => void
  name?: string
}

/** useControlled 结果 */
export interface ControlledValue<T> {
  /** 当前值（受控读 props——非受控读内部状态） */
  value: T
  /** 设置（受控 → onChange 回调；非受控 → 内部 + 重渲染） */
  setValue(v: T): void
  /** 原受控选项（ui-dom 兼容——组件读 controlled 原引用） */
  controlled: ControlledOptions<T>
}

/** 受控/非受控值（渲染期调用——受控读最新 props）
 *  **双形状**：useControlled(controlled, defaultValue?)——defaultValue 可选
 *  （ui-dom 兼容单参对象——无默认值时非受控初始为 undefined） */
export function useControlled<T>(
  env: HookEnv,
  controlled: ControlledOptions<T>,
  defaultValue?: T,
): ControlledValue<T> {
  const idx = env.nextHookIndex()
  const state = env.getHookState<{ value: T | undefined }>(idx) ?? { value: defaultValue }
  env.setHookState(idx, state)
  const isControlled = controlled.value !== undefined
  return {
    get value() {
      return (controlled.value ?? state.value) as T
    },
    controlled,
    setValue(v: T): void {
      if (isControlled) {
        // 受控：唯一出口是回调（缺回调 = 静默不可用——设计规则 §5.2 warn）
        if (!controlled.onChange) {
          console.warn('[vdom] useControlled 受控缺 onChange 回调——交互静默失效')
        }
        controlled.onChange?.(v)
      } else {
        state.value = v
        env.requestRender()
      }
    },
  }
}
