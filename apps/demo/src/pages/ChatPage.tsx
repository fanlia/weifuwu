/**
 * AI 对话页 — ctx.ui.useChat + AiChat demo（chat 流式 + agent 工具循环 + HITL 审批）
 *
 * 后端：
 *   /api/chat     → mode=chat: ctx.ai.stream() / mode=agent: agent 工具循环（统一入口）
 *   /api/approve  → ctx.ai.approve()（审批响应，POST 上行）
 * 前端：useChat（数据层）+ AiChat（展示层）。整个页面只剩模式切换，协议细节全透明。
 */

import type { WfuiContext } from 'weifuwu/client'
import { AiChat } from 'weifuwu/components'

export default function ChatPage(_props: {}, ctx: WfuiContext) {
  // ── mount（只一次）──
  const $ = ctx.ui.useChat({
    url: '/api/chat',
    approveUrl: '/api/approve',
    body: (messages) => ({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      mode: $.mode, // 统一入口分发：chat | agent
    }),
  })
  $.mode = 'chat'

  // ── render（每次 dirty/props 变化）──
  return () => (
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-1">
        <h2 class="text-lg font-bold">AI 对话</h2>
        <div class="flex gap-1 text-sm">
          {(['chat', 'agent'] as const).map((m) => (
            <span
              key={m}
              class={`px-2 py-0.5 rounded cursor-pointer ${$.mode === m ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              onClick={() => { $.mode = m; $.clear() }}
            >
              {m === 'chat' ? '流式对话' : 'Agent（工具+审批）'}
            </span>
          ))}
        </div>
      </div>
      <p class="text-gray-400 text-xs mb-4">
        {$.mode === 'agent' ? '试："查一下北京的天气" —— 会触发工具调用 + 人工审批' : '流式对话（未设置 DEEPSEEK_API_KEY 时用内置 fake）'}
      </p>

      <AiChat chat={$} />
    </div>
  )
}
