/**
 * AiChat — 标准 AI 对话组件（useChat 的标准展示层）
 *
 * 组件库第一个领域复合组件：接收 ctx.ui.useChat() 返回的 handle，
 * 渲染完整对话界面：消息气泡、工具调用卡（ToolCallCard）、HITL 审批卡
 * （ApprovalCard）、思考/工具状态、usage、错误 + 重试、输入条 + 自动滚动。
 *
 * 分工：
 *   - useChat（hook）= 会话语义 + 协议（数据层）
 *   - AiChat（组件）= 标准界面（展示层，5 分钟出可交互对话页）
 *   - 需要完全自定义 UI 的应用直接用 useChat + 自有渲染（hook 保持灵活路径）
 *
 * 约定（手动优先）：内部无 $，let + 事件；自动滚动经 ref + scroll 事件。
 * 文案默认中文（与 ToolCallCard/ApprovalCard 一致），labels 可覆盖。
 *
 * ```tsx
 * const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
 * return () => h(AiChat, { chat: $ })
 * ```
 */

import type { Component } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { h } from '../../ui-dom/vnode.ts'
import type { UseChatHandle, UiMessage } from '../../ui-dom/use-chat.ts'
import type { WfError, WfUsage } from '../../ai/types.ts'
import { ToolCallCard } from '../ToolCallCard/ToolCallCard.ts'
import { ApprovalCard } from '../ApprovalCard/ApprovalCard.ts'

// ── 类型 ─────────────────────────────────────────────────

export interface AiChatLabels {
  send: string
  stop: string
  retry: string
  thinking: string
  runningTool: (name?: string) => string
  tokens: (u: WfUsage) => string
  error: (e: WfError) => string
  placeholder: string
  empty: string
}

export interface AiChatProps {
  /** ctx.ui.useChat() 返回的会话 handle（同一 $，状态变化自动重渲染） */
  chat: UseChatHandle
  /** 消息列表最大高度（默认 '70vh'） */
  maxHeight?: string
  /** 界面文案覆盖 */
  labels?: Partial<AiChatLabels>
  /** 自定义气泡渲染逃生舱（默认纯文本） */
  renderMessage?: (msg: UiMessage) => any
  /** 工具参数渲染（透传 ToolCallCard） */
  renderToolArgs?: (args: Record<string, unknown>) => any
  /** 键盘弹起时输入区 fixed 抬升（全屏 chat 布局用；内联卡片默认 false——原生聚焦滚动已够） */
  raiseOnKeyboard?: boolean
}

const defaultLabels: AiChatLabels = {
  send: '发送',
  stop: '停止',
  retry: '重试',
  thinking: '🤔 思考中…',
  runningTool: (name) => (name ? `执行工具 ${name}` : '执行工具…'),
  tokens: (u) => `tokens: ${u.prompt_tokens}→${u.completion_tokens}`,
  error: (e) => `${e.code}: ${e.message}`,
  placeholder: '输入消息，回车发送…',
  empty: '输入消息开始对话。',
}

// ── 组件 ─────────────────────────────────────────────────

export const AiChat: Component<AiChatProps> = (initProps, ctx) => {
  const _browser = ctx.browser ?? createClientBrowser()
  // ── 手动状态（组件库约定：let + 事件，不依赖 $）──
  let listEl: HTMLElement | undefined
  let stickToBottom = true

  // 订阅 chat 变更：chat 是父组件的 $（引用恒定，props 浅比较恒等 → 三态 skip 命中），
  // 父 dirty 不会驱动本组件重渲染 → 自行订阅，任何会话状态变化都 dirty 自身
  const unwatch = (initProps.chat as any).__watch?.(() => ctx.ui.dirty())

  // 可视视口跟踪：虚拟键盘弹起时输入区抬升到键盘上方（fixed 底部栏场景）
  const vv = ctx.ui.useVisualViewport()

  const scrollToBottom = () => {
    if (listEl) listEl.scrollTop = listEl.scrollHeight
  }

  // 滚动位置跟踪（useScrollPosition：全局 scroll 监听 + rAF 节流，替代自建 listEl scroll 监听）。
  // y 响应式变化自动 dirty → render 里重算 stickToBottom（贴底判定，距底 <48px 视为贴底）。
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => listEl ?? window })

  // 稳定 ref 函数：跨渲染保持同一引用。
  // weifuwu 的 ref-diff 在 ref 函数引用变化时调用旧 ref(null)——若 ref 内联在 render 里，
  // 每次重渲染都会触发 null 分支（退订 watcher / 移除监听），必须把 ref 定义在 mount 作用域。
  const listRef = (el: any) => {
    if (el && !listEl) {
      listEl = el
      scroll.refresh() // 初始 y
      queueMicrotask(scrollToBottom)
    } else if (!el && listEl) {
      listEl = undefined
      unwatch?.() // 真正卸载时退订
    }
  }

  // ── render（每次 dirty/props 变化）──
  return (props) => {
    const { chat, raiseOnKeyboard = false } = props
    const labels: AiChatLabels = { ...defaultLabels, ...props.labels }

    // 贴底判定（useScrollPosition 的 y 响应式驱动；scrollHeight/clientHeight 读当前 DOM）
    if (listEl) {
      stickToBottom = listEl.scrollHeight - scroll.y - listEl.clientHeight < 48
    }

    // 自动滚动：内容更新且用户未上翻 → 微任务内滚到底（render 返回后 patch 已完成）
    if (stickToBottom) queueMicrotask(scrollToBottom)

    const msgs = (chat.messages ?? []) as UiMessage[]
    const nodes: any[] = []

    if (msgs.length === 0) {
      nodes.push(h('p', { class: 'wf-aichat-empty' }, labels.empty))
    }
    for (const m of msgs) {
      nodes.push(renderMessage(m, props, labels))
    }
    if (chat.step) {
      nodes.push(
        h('div', { class: 'wf-aichat-status' },
          chat.step.type === 'llm' ? labels.thinking : labels.runningTool(chat.step.name)),
      )
    }
    if (chat.usage) nodes.push(h('div', { class: 'wf-aichat-usage' }, labels.tokens(chat.usage)))
    if (chat.error) nodes.push(h('div', { class: 'wf-aichat-error' }, labels.error(chat.error)))

    return h('div', { class: 'wf-aichat' }, [
      h('div', {
        class: 'wf-aichat-list',
        style: { maxHeight: props.maxHeight ?? '70vh' },
        ref: listRef,
      }, nodes),
      h('div', {
        class: `wf-aichat-inputbar${vv.keyboardOpen && raiseOnKeyboard ? ' wf-aichat-inputbar--raised' : ''}`,
        // 键盘弹起（opt-in，全屏 chat 布局）：fixed 抬升到键盘上方（bottom = 键盘高度）
        style: vv.keyboardOpen && raiseOnKeyboard
          ? { position: 'fixed', left: '0', right: '0', bottom: `${Math.max(0, _browser?.viewportHeight() - (vv.height + vv.offsetTop)) + 8}px`, zIndex: 'var(--wf-z-popover)' }
          : undefined,
      }, [
        h('input', {
          class: 'wf-aichat-input',
          value: chat.input ?? '',
          placeholder: labels.placeholder,
          onInput: (e: any) => { chat.input = e.target.value },
          onKeyDown: (e: any) => { if (e.key === 'Enter') chat.send() },
        }),
        chat.streaming
          ? h('button', {
              class: 'wf-btn wf-btn--primary wf-btn--sm',
              type: 'button',
              onClick: () => chat.stop(),
            }, labels.stop)
          : h('button', {
              class: 'wf-btn wf-btn--primary wf-btn--sm',
              type: 'button',
              onClick: () => chat.send(),
            }, labels.send),
        !chat.streaming && chat.error
          ? h('button', {
              class: 'wf-btn wf-btn--danger wf-btn--sm',
              type: 'button',
              onClick: () => chat.retry(),
            }, labels.retry)
          : null,
      ]),
    ])
  }
}

// ── 单条消息：工具卡 + 审批卡 + 气泡 ──────────────────────

function renderMessage(m: UiMessage, props: AiChatProps, _labels: AiChatLabels): any {
  const nodes: any[] = []

  if (m.toolCalls?.length) {
    const cards = m.toolCalls.map((tc, i) =>
      h(ToolCallCard, {
        key: `${m.id}-tool-${i}`,
        call: tc.call,
        progress: tc.progress,
        result: tc.result,
        renderArgs: props.renderToolArgs,
      }))
    nodes.push(h('div', { class: 'wf-aichat-tools' }, cards))
  }

  if (m.approval) {
    const card = h(ApprovalCard, {
      request: m.approval,
      onApprove: () => props.chat.approve('approved'),
      onReject: (note?: string) => props.chat.approve('rejected', note ?? '用户拒绝'),
    })
    nodes.push(h('div', { class: 'wf-aichat-approval' }, card))
  }

  nodes.push(h('div', { class: `wf-aichat-bubble wf-aichat-bubble--${m.role}` },
    props.renderMessage ? props.renderMessage(m) : (m.content || '…')))

  return h('div', { key: m.id, class: `wf-aichat-msg wf-aichat-msg--${m.role}` }, nodes)
}
