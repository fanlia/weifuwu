/**
 * vdom hooks — useField（表单字段行为契约——label/error/hint/aria 连接单源）
 *
 * 设计（2027-09——分层抽象 W5）：表单字段（Input/Select/DatePicker……）的
 * label/required·error/hint 结构与 aria 连接（label for ↔ input id ·
 * aria-invalid · aria-describedby · aria-required）重复手写实证——
 * 契约化：字段作者只写输入面——标签/错误/提示/aria 由契约结构性保证。
 *
 * 结构类（labelClass/errClass/hintClass/reqClass/wrapErrClass）是皮
 * （字段 CSS 定）——行为（属性/连接/态）契约内建。**渲染期 opts**（useOverlay
 * 同模式——每次渲染读最新）。
 *
 * 用法：
 *   const f = useField({ label, error, hint, required, name })
 *   if (!f.hasWrap) return h('input', f.inputProps())
 *   return h('div', { class: `wf-x-wrap${f.stateClass}` }, [
 *     f.renderLabel(), h('input', f.inputProps()), f.renderError(), f.renderHint(),
 *   ])
 */
import type { HookEnv } from './env.ts'
import type { VNode } from '../core/vnode.ts'
import { h } from '../core/vnode.ts'

export interface FieldOptions {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  /** 连接 id 基（显式 id 或 name——label for ↔ input id） */
  name?: string
  id?: string
  /** 包装面（错误态类——字段 CSS 的 --err 变体） */
  wrapErrClass?: string
  /** 标签/错误/提示的类（皮——字段 CSS） */
  labelClass?: string
  errClass?: string
  hintClass?: string
  reqClass?: string
  /** 必填星字符（默认 *） */
  reqChar?: string
}

export interface FieldHandle {
  /** 包装与否（无 label/error/hint = 裸输入——Input 先例） */
  hasWrap: boolean
  /** 错误态类（'' 或 ' --err'——组件拼到 wrap class） */
  stateClass: string
  /** 输入 id（name/id 提供时——label for 连接） */
  inputId: string | undefined
  /** 输入面（id/aria-invalid/aria-describedby/aria-required） */
  inputProps(): Record<string, unknown>
  renderLabel(): VNode | null
  renderError(): VNode | null
  renderHint(): VNode | null
}

/** 表单字段契约（mount 期调用；opts 渲染期读最新——闭包引用） */
export function useField(env: HookEnv, optsIn: FieldOptions): FieldHandle {
  void env
  let opts = optsIn
  const id = () => opts.id ?? (opts.name ? `wf-${opts.name}` : undefined)
  const baseId = () => id() ?? 'wf-field'
  return {
    get hasWrap() { return !!(opts.label || opts.error || opts.hint) },
    get stateClass() { return opts.error ? ` ${opts.wrapErrClass ?? 'wf-field--err'}` : '' },
    get inputId() { return id() },
    inputProps() {
      const p: Record<string, unknown> = {}
      const i = id()
      if (i) p.id = i
      if (opts.error) p['aria-invalid'] = true
      const desc: string[] = []
      if (opts.error) desc.push(`${baseId()}-err`)
      if (opts.hint && !opts.error) desc.push(`${baseId()}-hint`) // 与 renderHint 对齐（error 时 hint 不渲染）
      if (desc.length) p['aria-describedby'] = desc.join(' ')
      if (opts.required) p['aria-required'] = true
      return p
    },
    renderLabel() {
      if (opts.label == null && !opts.required) return null
      const kids: VNode[] = []
      if (opts.label != null) kids.push(opts.label as unknown as VNode)
      if (opts.required) {
        kids.push(h('span', { class: opts.reqClass ?? 'wf-field-req' }, opts.reqChar ?? '*'))
      }
      return h('label', { class: opts.labelClass, ...(id() ? { for: id() } : {}) }, kids)
    },
    renderError() {
      return opts.error ? h('div', { class: opts.errClass, id: `${baseId()}-err` }, opts.error) : null
    },
    renderHint() {
      return opts.hint && !opts.error
        ? h('div', { class: opts.hintClass, id: `${baseId()}-hint` }, opts.hint)
        : null
    },
  }
}
