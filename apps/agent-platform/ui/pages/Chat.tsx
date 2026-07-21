/**
 * 聊天页面 — 气泡式消息 + 静默轮询 + 自动滚动（仅新消息）
 */

import { signal, computed, createResource, Show, For, effect, onCleanup } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

export function Chat(_props: {}, ctx: WfuiContext) {
  const departmentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const inputValue = signal('')
  const sending = signal(false)
  const loaded = signal(false)       // 首屏加载完成标志
  const prevCount = signal(0)        // 上一次消息数，用于判断是否滚到底部
  let bodyEl: HTMLElement | null = null

  const [messagesRes, { loading, refetch }] = createResource<any[]>(
    () => fetch(`/api/departments/${departmentId}/messages`, { headers })
      .then(r => r.json())
      .then(d => (d.messages ?? []).reverse()),
    { initialValue: [] },
  )
  const [dept] = createResource<any>(
    () => fetch(`/api/departments/${departmentId}`, { headers }).then(r => r.json()),
  )

  const messages = computed(() => messagesRes.value ?? [])
  const showLoading = computed(() => loading.value && !loaded.value)  // 只首屏显示
  const showEmpty = computed(() => !loading.value && messages.value.length === 0)
  const deptName = computed(() => dept.value?.department?.name ?? dept.value?.name ?? '聊天')
  const memberCount = computed(() => (dept.value?.members ?? []).length)
  const canSend = computed(() => inputValue.value.trim().length > 0 && !sending.value)

  // ── 首屏加载标记 + 消息增量时自动滚动 ──
  effect(() => {
    const count = messages.value.length
    if (count > 0 && !loaded.value) loaded.value = true
    // 只在消息数增加（新消息到达）时自动滚到底部
    if (bodyEl && count > prevCount.value && prevCount.value > 0) {
      requestAnimationFrame(() => {
        if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
      })
    }
    if (count > 0) prevCount.value = count
  })

  // ── WebSocket 实时推送（替代 3s 轮询） ──
  const unsub = ctx.ws.onMessage(() => refetch())
  onCleanup(() => unsub())
  // 订阅该部门的实时消息
  ctx.ws.send({ type: 'subscribe', departmentId })

  async function sendMessage(e: Event) {
    e.preventDefault()
    const content = inputValue.value.trim()
    if (!content || sending.value) return
    sending.value = true
    inputValue.value = ''

    try {
      const res = await fetch(`/api/departments/${departmentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ content }),
      })
      if (res.ok) await refetch()
    } finally {
      sending.value = false
    }
  }

  function fmtTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div class="chat-shell">
      <div class="chat-head">
        <a href="/chat/new" class="back-link" style={{ marginBottom: '0' }}
          onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/chat/new') }}>←</a>
        <div class="chat-head-info">
          <div class="chat-head-name">{deptName}</div>
          <div class="chat-head-sub">{computed(() => `${memberCount.value} 位成员`)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onClick={() => ctx.app.navigate(`/departments/${departmentId}`)}>部门详情</button>
      </div>

      <div class="chat-body" ref={(el: any) => { bodyEl = el }}>
        <Show when={showLoading}>
          <div class="loading-wrap"><div class="spinner"></div></div>
        </Show>

        <Show when={showEmpty}>
          <div class="empty">
            <div class="empty-ico">💬</div>
            <div class="empty-txt">暂无消息</div>
            <div class="empty-hint">发送第一条消息，@ 的 AI 成员会自动回复</div>
          </div>
        </Show>

        <For each={messages} keyBy="id">{(msg: any) => {
          if (msg.msg_type === 'system') {
            return <div class="sys-pill">{msg.content}</div>
          }
          const own = msg.sender_type === 'user'
          return (
            <div class={`msg-row${own ? ' own' : ''}`}>
              <div class={`ava ava-sm ava-${msg.sender_type ?? 'user'}`}>{(msg.sender_name ?? '?')[0]}</div>
              <div class="msg-col">
                <div class="msg-meta">
                  <span>{msg.sender_name ?? '未知'}</span>
                  <span>{fmtTime(msg.created_at)}</span>
                </div>
                <div class="bubble">{msg.content}</div>
                {msg.ai_draft && msg.ai_approved === null && (
                  <span class="draft-flag">⏳ AI 草稿待审批</span>
                )}
              </div>
            </div>
          )
        }}</For>
      </div>

      <form class="chat-bar" onSubmit={sendMessage}>
        <input
          class="chat-input"
          type="text"
          placeholder="输入消息，回车发送..."
          value={inputValue}
          onInput={(e: any) => { inputValue.value = e.target.value }}
        />
        <button class="chat-send" type="submit" disabled={computed(() => !canSend.value)}>➤</button>
      </form>
    </div>
  )
}
