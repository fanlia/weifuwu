/**
 * AI 对话页 — wf: 协议端到端 demo
 *
 * 后端：ctx.ai.stream()（自研 OpenAI 兼容客户端 + SSE 编码）
 * 前端：aiStream() 解码器（事件分发 + 自动 X-Trace-Id + abort）
 *
 * 无 DEEPSEEK_API_KEY 时使用内置 wire-fake（apps/demo/src/ai-demo.ts），
 * 完整走一遍真实协议栈：ctx.ai.stream → fetch → fake(HTTP+SSE) → wf: 事件 → aiStream。
 */

import type { WfuiContext } from 'weifuwu/client'
import { aiStream } from 'weifuwu/client'
import type { AiStreamHandle } from 'weifuwu/client'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage(_props: {}, ctx: WfuiContext) {
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.messages = [] as ChatMsg[]
  $.input = ''
  $.streaming = false
  $.status = ''
  $.error = ''
  $.usage = ''

  let handle: AiStreamHandle | undefined

  async function send() {
    const text = $.input.trim()
    if (!text || $.streaming) return
    $.input = ''
    $.status = ''
    $.error = ''
    $.usage = ''
    $.messages = [...$.messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]

    handle = aiStream('/api/chat', { messages: $.messages }, {
      onToken: (t) => {
        const last = $.messages[$.messages.length - 1]
        $.messages = [...$.messages.slice(0, -1), { ...last, content: last.content + t }]
      },
      onToolCall: (c) => { $.status = `⚙️ 调用工具 ${c.name}` },
      onUsage: (u) => { $.usage = `tokens: ${u.prompt_tokens}→${u.completion_tokens}` },
      onDone: () => { $.streaming = false; $.status = '' },
      onError: (e) => { $.error = `${e.code}: ${e.message}`; $.streaming = false },
      onEvent: (name, data) => {
        if (name === 'x:demo_note') $.status = `ℹ️ ${(data as { note?: string }).note ?? ''}`
      },
    })
    $.streaming = true
    void handle.done
  }

  function stop() {
    handle?.abort()
    $.streaming = false
  }

  // ── render（每次 dirty/props 变化）──
  return () => (
    <div class="max-w-2xl mx-auto">
      <h2 class="text-lg font-bold mb-1">AI 对话</h2>
      <p class="text-gray-400 text-xs mb-4">wf: 协议 demo — 未设置 DEEPSEEK_API_KEY 时使用内置确定性 fake</p>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-h-72 space-y-3 overflow-y-auto max-h-96">
        {$.messages.length === 0 && (
          <p class="text-gray-400 text-sm">输入消息开始对话。流式 token、工具调用事件会实时渲染。</p>
        )}
        {$.messages.map((m: ChatMsg, i: number) => (
          <div key={i} class={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span class={`inline-block rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {m.content || '…'}
            </span>
          </div>
        ))}
        {$.status && <div class="text-xs text-blue-500">{$.status}</div>}
        {$.usage && <div class="text-xs text-gray-400">{$.usage}</div>}
        {$.error && <div class="text-xs text-red-500 bg-red-50 rounded p-2">{$.error}</div>}
      </div>

      <div class="flex gap-2 mt-4">
        <input
          class="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={$.input}
          onInput={(e: any) => { $.input = e.target.value }}
          onKeyDown={(e: any) => { if (e.key === 'Enter') send() }}
          placeholder="输入消息，回车发送…"
          disabled={$.streaming}
        />
        {$.streaming ? (
          <button class="bg-gray-500 text-white rounded-lg px-4 py-2 text-sm" onClick={() => stop()}>停止</button>
        ) : (
          <button class="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2 text-sm transition-colors" onClick={() => send()}>发送</button>
        )}
      </div>
    </div>
  )
}
