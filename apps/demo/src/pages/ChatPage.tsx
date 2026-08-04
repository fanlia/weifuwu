/**
 * AI 对话页 — wf: 协议端到端 demo（chat 流式 + agent 工具循环 + HITL 审批）
 *
 * 后端：
 *   /api/chat   → ctx.ai.stream()          （流式对话）
 *   /api/agent  → ctx.ai.agent().run()     （工具循环 + 人工审批）
 *   /api/approve→ ctx.ai.approve()         （审批响应，POST 上行）
 * 前端：aiStream() 解码器（事件分发 + 自动 X-Trace-Id + abort）
 */

import type { WfuiContext } from 'weifuwu/client'
import { aiStream } from 'weifuwu/client'
import type { AiStreamHandle } from 'weifuwu/client'
import { ToolCallCard } from 'weifuwu/components'
import { ApprovalCard } from 'weifuwu/components'
import type { WfToolCall, WfToolProgress, WfToolResult, WfApprovalRequest } from 'weifuwu'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage(_props: {}, ctx: WfuiContext) {
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.mode = 'chat'                       // 'chat' | 'agent'
  $.messages = [] as ChatMsg[]
  $.input = ''
  $.streaming = false
  $.status = ''
  $.error = ''
  $.usage = ''
  $.activeTool = undefined as WfToolCall | undefined
  $.toolProgress = undefined as WfToolProgress | undefined
  $.toolResult = undefined as WfToolResult | undefined
  $.approval = undefined as WfApprovalRequest | undefined

  let handle: AiStreamHandle | undefined

  async function send() {
    const text = $.input.trim()
    if (!text || $.streaming) return
    $.input = ''
    $.status = ''
    $.error = ''
    $.usage = ''
    $.approval = undefined
    $.messages = [...$.messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]

    handle = aiStream($.mode === 'agent' ? '/api/agent' : '/api/chat', { messages: $.messages }, {
      onToken: (t) => {
        const last = $.messages[$.messages.length - 1]
        $.messages = [...$.messages.slice(0, -1), { ...last, content: last.content + t }]
      },
      onStep: (s) => {
        if (s.type === 'llm') $.status = '🤔 思考中…'
        if (s.type === 'tool') $.status = `⚙️ 执行工具 ${s.name ?? ''}`
      },
      onToolCall: (c) => { $.activeTool = c; $.status = `⚙️ 调用工具 ${c.name}` },
      onToolProgress: (p) => { $.toolProgress = p; $.status = p.message ?? '' },
      onToolResult: (r) => {
        $.toolResult = r
        $.status = r.ok ? '' : `❌ 工具失败: ${r.error?.code ?? ''}`
      },
      onApproval: (req) => {
        $.approval = { id: req.id, name: req.name, args: req.args, reason: req.reason }
        $.status = `⏸ 等待审批：${req.name}`
      },
      onUsage: (u) => { $.usage = `tokens: ${u.prompt_tokens}→${u.completion_tokens}` },
      onDone: () => { $.streaming = false; $.status = ''; $.approval = undefined },
      onError: (e) => { $.error = `${e.code}: ${e.message}`; $.streaming = false; $.approval = undefined },
      onEvent: (name, data) => {
        if (name === 'x:weather_source') $.status = `ℹ️ 数据源: ${(data as { source?: string }).source ?? ''}`
      },
    })
    $.streaming = true
    void handle.done
  }

  function clearTool() {
    $.activeTool = undefined
    $.toolProgress = undefined
    $.toolResult = undefined
  }

  /** HITL 审批响应（协议 §4.5：POST 上行） */
  async function respond(decision: 'approved' | 'rejected', note?: string) {
    if (!$.approval) return
    const req = $.approval
    $.approval = undefined
    $.status = decision === 'approved' ? '✅ 已批准，继续执行…' : '❌ 已拒绝，agent 将换方案'
    await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: req.id, decision, note }),
    })
  }

  function stop() {
    handle?.abort()
    $.streaming = false
    $.approval = undefined
  }

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
              onClick={() => { $.mode = m; $.messages = []; $.status = ''; $.usage = ''; $.error = '' }}
            >
              {m === 'chat' ? '流式对话' : 'Agent（工具+审批）'}
            </span>
          ))}
        </div>
      </div>
      <p class="text-gray-400 text-xs mb-4">
        {$.mode === 'agent' ? '试："查一下北京的天气" —— 会触发工具调用 + 人工审批' : '流式对话（未设置 DEEPSEEK_API_KEY 时用内置 fake）'}
      </p>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-h-72 space-y-3 overflow-y-auto max-h-96">
        {$.messages.length === 0 && (
          <p class="text-gray-400 text-sm">输入消息开始对话。流式 token、工具调用、审批卡片会实时渲染。</p>
        )}
        {$.messages.map((m: ChatMsg, i: number) => (
          <div key={i} class={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span class={`inline-block rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {m.content || '…'}
            </span>
          </div>
        ))}

        {$.activeTool && (
          <div class="mb-2">
            <ToolCallCard call={$.activeTool} progress={$.toolProgress} result={$.toolResult} renderArgs={(a) => JSON.stringify(a)} />
          </div>
        )}

        {$.approval && (
          <div class="mb-2">
            <ApprovalCard
              request={$.approval}
              onApprove={() => respond('approved')}
              onReject={(note) => respond('rejected', note ?? '用户拒绝')}
            />
          </div>
        )}

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
