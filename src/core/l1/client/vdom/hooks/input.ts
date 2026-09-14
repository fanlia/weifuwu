/**
 * vdom hooks — useControlledInput（受控输入——设计规则 §5.3 纪律）
 *
 * 核心（受控输入纪律）：**输入态不依赖受控 value 回流**——
 * - keyword：内部输入态（输入期间 value 走内部态——不触发 onChange 回流——
 *   父组件 render 不重挂 input——**焦点保持**）
 * - setValue：触发 onChange（受控回流）
 * - selectedLabel：选中回填（关闭后 input 回填选中 label——受控 onChange
 *   不渲染时 props.value 不回流——input 空的坑）
 * - **IME composition 门控**：中文输入法组合期间受控 value 重置打断——
 *   isComposing 门控 + onCompositionEnd 处理最终值
 */

import type { HookEnv } from './env.ts'

export interface ControlledInput {
  /** 原受控选项（ui-dom 兼容——Mentions 读 controlled 原引用） */
  controlled: { value?: string; onChange?: (v: string) => void; name?: string }
  /** 受控值（渲染期读 props） */
  value: string
  /** 触发 onChange（受控回流） */
  setValue(v: string): void
  /** 内部输入态（输入期间——不回流——焦点保持） */
  keyword: string
  setKeyword(v: string): void
  /** 选中回填（关闭后 input 回填选中 label） */
  selectedLabel: string
  setSelectedLabel(v: string): void
  /** IME 组合门控（中文输入法） */
  isComposing: boolean
  onCompositionStart(): void
  onCompositionEnd(): void
}

interface InputState {
  keyword: string
  selectedLabel: string
  composing: boolean
}

/** 受控输入（渲染期调用——受控值读最新 props——内部态 hook 缓存） */
export function useControlledInput(
  env: HookEnv,
  controlled: { value?: string; onChange?: (v: string) => void; name?: string },
  opts?: { name?: string },
): ControlledInput {
  const idx = env.nextHookIndex()
  const state = env.getHookState<InputState>(idx) ?? { keyword: '', selectedLabel: '', composing: false }
  env.setHookState(idx, state)
  const isControlled = controlled.value !== undefined
  return {
    controlled,
    get value() {
      return controlled.value ?? state.keyword
    },
    setValue(v: string): void {
      if (isControlled) {
        if (!controlled.onChange) {
          console.warn(`[vdom] useControlledInput(${opts?.name ?? ''}) 受控缺 onChange 回调——交互静默失效`)
        }
        controlled.onChange?.(v)
      } else {
        state.keyword = v
        env.requestRender()
      }
    },
    get keyword() {
      return state.keyword
    },
    setKeyword(v: string): void {
      state.keyword = v // 内部态——不回流（输入期间焦点保持）
      if (!state.composing) {
        this.setValue(v) // 非组合期——同步触发 onChange（受控回流）
      }
    },
    get selectedLabel() {
      return state.selectedLabel
    },
    setSelectedLabel(v: string): void {
      state.selectedLabel = v
    },
    get isComposing() {
      return state.composing
    },
    onCompositionStart(): void {
      state.composing = true
    },
    onCompositionEnd(): void {
      state.composing = false
    },
  }
}
