/**
 * weifuwu/components — ChatInput
 *
 * 独立复用的聊天输入条（从 AiChat 抽取——消 AiChat 内置 + 消费方手搓双重复）。
 * 纯输入层：不自带聊天逻辑（useChat 组合在消费方——AiChat 传入 chat handle，
 * 业务页传入自己的发送/停止回调）。
 *
 * 能力：
 * - 单行 input（默认）/ 多行 textarea（multiline——Enter 发送 / Shift+Enter 换行）
 * - §5.3 受控输入纪律：内部 keyword（IME 组合期间不回流传受控 value——中文输入法不打断）
 * - streaming → 发送按钮变「停止」（onStop）
 * - error 且非流式 → 「重试」按钮（onRetry）
 * - disabled 输入/按钮；actions 插槽（附件/知识库等扩展位）
 *
 * 使用两阶段模型 + render-only。状态：内部 keyword（useControlledInput Map 缓存）。
 */

import type { Component, VNode } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'
import type { V3Ui } from '../../ui-dom/vdom3/types.ts'

export interface ChatInputLabels {
  send: string
  stop: string
  retry: string
  placeholder: string
}

export interface ChatInputProps {
  /** 受控值（共享输入态——ChatInput 不持有聊天逻辑） */
  value: string
  /** 值变化（IME 安全：组合期间不触发） */
  onChange: (v: string) => void
  /** 发送（Enter 或按钮）——入参为当前输入文本（trim 后非空才触发） */
  onSend: (text: string) => void
  /** 流式状态——true 时按钮变「停止」 */
  streaming?: boolean
  /** 停止回调（streaming 时按钮触发） */
  onStop?: () => void
  /** 错误——非流式时显示「重试」按钮 */
  error?: string | null
  /** 重试回调 */
  onRetry?: () => void
  /** 禁用（输入 + 按钮） */
  disabled?: boolean
  /** 多行 textarea（Enter 发送 / Shift+Enter 换行）；默认 false = 单行 input */
  multiline?: boolean
  /** 标签（i18n 覆盖） */
  labels?: Partial<ChatInputLabels>
  /** 扩展位（附件/知识库/模型选择等） */
  actions?: VNode | null
  /** 外部程序化控制（@ 补全等场景）——mount 期回调上抛稳定 handle（{ setKeyword, setValue }）——
   *  回调必须 mount 层定义（稳定引用——vdom3 props 剪枝）；禁止 out-param 对象（props 不可变契约——
   *  原地写 control.current 触发 vdom3 audit） */
  onControl?: (handle: ChatInputControl) => void
}

export interface ChatInputControl {
  /** 直接写内部输入态（不触发 onChange——程序化改写如 @ 补全） */
  setKeyword: (v: string) => void
  /** 写内部态并触发 onChange（受控回传） */
  setValue: (v: string) => void
}

export const ChatInput: Component<ChatInputProps, { ui: V3Ui }> = async (_init, ctx) => {
  // ── mount（只一次）：无状态初始化（keyword 在 useControlledInput 的 Map 缓存）
  return async (props) => {
    const labels: ChatInputLabels = {
      send: '发送',
      stop: '停止',
      retry: '重试',
      placeholder: '输入消息，回车发送…',
      ...props.labels,
    }

    // §5.3 受控输入纪律：输入态走内部 keyword（IME 组合期间不回流传受控 value——
    // 否则组合被打断，中文输入法无法输入 → 消息发不出）
    const input = ctx.ui.useControlledInput({
      value: props.value ?? '',
      onChange: props.onChange,
      name: 'ChatInput',
    })
    // §5.3 外部程序化控制：@ 补全等需要改写输入态（不触发 onChange 的 setKeyword——
    // 由消费方自行决定是否回传共享态）——回调上抛（props 不可变契约：不写 out-param）
    if (props.onControl) {
      props.onControl({
        setKeyword: (v: string) => { input.setKeyword(v) },
        setValue: (v: string) => { input.setKeyword(v); props.onChange?.(v) },
      })
    }
    let composing = false

    const send = () => {
      const text = input.keyword.trim()
      if (!text) return
      input.setKeyword('') // 清内部输入态（防残留重复发送）
      props.onSend(text)
    }

    const shared: Record<string, any> = {
      class: 'wf-chat-input',
      value: input.keyword,
      placeholder: labels.placeholder,
      disabled: props.disabled,
      // 输入期：内部 keyword + onChange 每键同步（消费方按需写共享态；组合期间跳过——IME 安全）
      onInput: (e: any) => {
        if (composing || e.isComposing) return
        input.setKeyword(e.target.value)
        props.onChange?.(e.target.value)
      },
      onCompositionStart: () => { composing = true },
      onCompositionEnd: (e: any) => {
        composing = false
        const v = (e.target as HTMLInputElement | HTMLTextAreaElement)?.value ?? ''
        input.setKeyword(v)
        props.onChange?.(v)
      },
      onKeyDown: (e: any) => {
        if (e.key !== 'Enter') return
        if (composing || e.isComposing) return
        // Ctrl/Cmd+Enter 强制发送（多行/单行通用快捷键——Gmail/微信习惯双保险）
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); send(); return }
        if (props.multiline && e.shiftKey) return // Shift+Enter 换行
        e.preventDefault()
        send()
      },
    }

    return h('div', { class: 'wf-chat-inputbar' }, [
      props.multiline
        ? h('textarea', { ...shared, rows: 1, style: { resize: 'none' } })
        : h('input', { ...shared, type: 'text' }),
      props.actions ?? null,
      props.streaming
        ? h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm',
            type: 'button',
            disabled: props.disabled,
            onClick: () => props.onStop?.(),
          }, labels.stop)
        : h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm',
            type: 'button',
            disabled: props.disabled,
            onClick: () => send(),
          }, labels.send),
      !props.streaming && props.error
        ? h('button', {
            class: 'wf-btn wf-btn--danger wf-btn--sm',
            type: 'button',
            onClick: () => props.onRetry?.(),
          }, labels.retry)
        : null,
    ])
  }
}
