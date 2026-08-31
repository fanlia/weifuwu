/**
 * AiChat — 标准 AI 对话组件（useChat 的标准展示层）
 *
 * 组件库第一个领域复合组件：接收 ctx.ui.useChat() 返回的 handle  // audit-exempt: 用法示例文档（组件契约 = 接收 useChat handle）
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
 * const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })  // audit-exempt: 用法示例文档（组件契约 = 接收 useChat handle）
 * return () => h(AiChat, { chat: $ })
 * ```
 */

import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { ChatHandle as UseChatHandle, ChatMessage as UiMessage } from '../../vdom/hooks/chat.ts'
import type { WfError, WfUsage, WfApprovalRequest } from '../../../server/ai/types.ts'
import type { JsonSchema } from '../JsonSchemaForm/JsonSchemaForm.ts'
import { ToolCallCard } from '../ToolCallCard/ToolCallCard.ts'
import { ApprovalCard } from '../ApprovalCard/ApprovalCard.ts'
import { ReasoningBlock } from '../ReasoningBlock/ReasoningBlock.ts'
import { ChatInput } from '../ChatInput/ChatInput.ts'

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
  /** ctx.ui.useChat() 返回的会话 handle（同一 $，状态变化自动重渲染） */  // audit-exempt: 用法示例文档（组件契约 = 接收 useChat handle）
  chat: UseChatHandle
  /** 消息列表最大高度（默认 '70vh'） */
  maxHeight?: string
  /** 界面文案覆盖 */
  labels?: Partial<AiChatLabels>
  /** 自定义气泡渲染逃生舱（默认纯文本） */
  renderMessage?: (msg: UiMessage) => any
  /** 工具参数渲染（透传 ToolCallCard） */
  renderToolArgs?: (args: Record<string, unknown>) => any
  /** 审批修改参数：按审批请求返回工具参数 schema（返回 undefined 则审批卡无修改入口；
   *  提交修改后参数 → chat.approve('modified', …)——后端按 modifiedArgs 执行） */
  approveSchema?: (request: WfApprovalRequest) => JsonSchema | undefined
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

  // 订阅 chat 变更（render-only 共享原语）：chat 是父组件持有的共享会话（活引用，
  // props 浅比较恒等 → 三态 skip 命中），父 dirty 不会驱动本组件重渲染 →
  // 订阅：任何会话状态变化 → 自身重渲染。**跟随最新 chat**（父换 handle → 重新订阅——
  // 防“订阅旧 handle：新会话流式更新但界面无输出”——真实事故：父组件违反稳定契约传新 handle）
  let currentChat: UseChatHandle = initProps.chat
  let unsubChat: (() => void) | undefined
  const resubscribe = () => {
    unsubChat?.()
    const c = currentChat as UseChatHandle & { subscribe?: (cb: () => void) => () => void }
    unsubChat = c?.subscribe ? c.subscribe(() => ctx.render()) : undefined
  }
  resubscribe()
  // 卸载退订（ref 纪律：稳定 ref + null 分支只在真卸载触发）
  const rootRef = (el: any) => { if (!el) { unsubChat?.(); unsubChat = undefined } }

  // 可视视口跟踪：虚拟键盘弹起时输入区抬升到键盘上方（fixed 底部栏场景）
  const vv = ctx.ui.useVisualViewport()

  const scrollToBottom = () => {
    if (listEl) listEl.scrollTop = listEl.scrollHeight
  }

  // 滚动位置跟踪（useScrollPosition：全局 scroll 监听 + rAF 节流，替代自建 listEl scroll 监听）。
  // y 响应式变化自动 dirty → render 里重算 stickToBottom（贴底判定，距底 <48px 视为贴底）。
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => listEl ?? null })

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
    }
  }

  // ── render（每次 dirty/props 变化）──
  return (props) => {
    const { chat, raiseOnKeyboard = false } = props
    const labels: AiChatLabels = { ...defaultLabels, ...props.labels }

    // §5.3 受控输入纪律：输入态走内部 keyword（IME 组合期间不回流传受控 value——
    // 否则组合被打断，中文输入法无法输入 → 消息发不出 → “没有流式输出”的真实根因）
    // 受控 value = chat.input（共享 handle 的输入态）；Enter 时写入 chat.input + send
    if (chat !== currentChat) {
      currentChat = chat
      resubscribe() // 换 handle → 重新订阅（新会话的 notify 才能驱动本组件）
    }


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

    return h('div', { class: 'wf-aichat', ref: rootRef }, [
      h('div', {
        class: 'wf-aichat-list',
        style: { maxHeight: props.maxHeight ?? '70vh' },
        ref: listRef,
      }, nodes),
      // 输入条（ChatInput 独立组件——§5.3 受控输入纪律内置：IME 组合/Enter 发送/streaming 切换）
      h('div', {
        class: `wf-aichat-inputbar${vv.keyboardOpen && raiseOnKeyboard ? ' wf-aichat-inputbar--raised' : ''}`,
        // 键盘弹起（opt-in，全屏 chat 布局）：fixed 抬升到键盘上方（bottom = 键盘高度）
        style: vv.keyboardOpen && raiseOnKeyboard
          ? { position: 'fixed', left: '0', right: '0', bottom: `${Math.max(0, _browser?.viewportHeight() - (vv.height + vv.offsetTop)) + 8}px`, zIndex: 'var(--wf-z-popover)' }
          : undefined,
      }, [
        h(ChatInput, {
          value: chat.input ?? '',
          onChange: (v: string) => { chat.setInput(v) }, // 输入期每键同步共享 handle（发送读 state.input）
          onSend: (text: string) => {
            chat.setInput(text) // 写入共享 handle（send 读 state.input）
            chat.send()
          },
          streaming: chat.streaming,
          onStop: () => chat.stop(),
          error: chat.error ? chat.error.message : null,
          onRetry: () => chat.retry(),
          labels: { send: labels.send, stop: labels.stop, retry: labels.retry, placeholder: labels.placeholder },
        }),
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
      argsSchema: props.approveSchema?.(m.approval),
      onApprove: (modifiedArgs?: Record<string, unknown>) => props.chat.approve(modifiedArgs ? 'modified' : 'approved', undefined, modifiedArgs),
      onReject: (note?: string) => props.chat.approve('rejected', note ?? '用户拒绝'),
    })
    nodes.push(h('div', { class: 'wf-aichat-approval' }, card))
  }

  if (m.reasoning) {
    nodes.push(h(ReasoningBlock, {
      content: m.reasoning,
      streaming: m.status === 'streaming',
    }))
  }

  nodes.push(h('div', { class: `wf-aichat-bubble wf-aichat-bubble--${m.role}` },
    props.renderMessage ? props.renderMessage(m) : (m.content || '…')))

  return h('div', { key: m.id, class: `wf-aichat-msg wf-aichat-msg--${m.role}` }, nodes)
}
