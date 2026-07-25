/**
 * 聊天页面 — 气泡式消息 + 流式输出 + WebSocket 实时推送
 *
 * 流式 AI 回复：
 *   后端逐 chunk 推送 WS 事件，前端原地更新气泡内容。
 *   无需等待完整回复，用户即时看到 AI 生成过程。
 */

import { signal, computed, Show, For, effect, onCleanup } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

interface ChatMsg {
  id: string
  sender_id: string
  sender_name: string
  sender_type: string
  content: string
  msg_type: string
  created_at: string
  ai_draft?: string
  ai_approved?: boolean | null
  /** 是否正在流式输出 */
  streaming?: boolean
  /** 工具调用记录 */
  tools?: Array<{ name: string; args: string; result?: string; status: 'running' | 'done' | 'error' }>
}

export function Chat(_props: {}, ctx: WfuiContext) {
  const departmentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  // ── 状态 ──
  const inputValue = signal('')
  const sending = signal(false)
  const messages = signal<ChatMsg[]>([])
  const loaded = signal(false)
  const loading = signal(true)
  let bodyEl: HTMLElement | null = null

  // 编辑状态
  const editingId = signal('')
  const editValue = signal('')

  // 当前用户绑定的 agent ID
  const userAgentId = signal('')

  // 部门信息
  const deptName = signal('聊天')
  const deptMemberCount = signal(0)

  // ── 数据加载 ──
  async function loadMessages() {
    try {
      const [msgRes, deptRes, agentRes] = await Promise.all([
        fetch(`/api/departments/${departmentId}/messages`, { headers }).then(r => r.json()),
        fetch(`/api/departments/${departmentId}`, { headers }).then(r => r.json()),
        fetch('/api/agents?type=user', { headers }).then(r => r.json()),
      ])

      const msgs = (msgRes.messages ?? []).reverse().map((m: any) => ({ ...m, streaming: false, tools: [] }))
      messages.value = msgs

      deptName.value = deptRes?.department?.name ?? deptRes?.name ?? '聊天'
      deptMemberCount.value = (deptRes?.members ?? []).length

      const agents = agentRes.agents ?? []
      const user = ctx.auth?.user
      const mine = agents.find((a: any) => a.user_id === (user?.value ?? user)?.id)
      if (mine) userAgentId.value = mine.id

      loaded.value = true
      loading.value = false
    } catch {
      loading.value = false
    }
  }

  // 初始加载
  loadMessages()

  const isOwn = (msg: ChatMsg) => userAgentId.value !== '' && msg.sender_id === userAgentId.value
  const canEdit = (msg: ChatMsg) => {
    if (!isOwn(msg)) return false
    return Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000
  }
  const showLoading = computed(() => loading.value && !loaded.value)
  const showEmpty = computed(() => !loading.value && loaded.value && messages.value.length === 0)
  const canSend = computed(() => inputValue.value.trim().length > 0 && !sending.value)
  const isEditing = computed(() => editingId.value !== '')

  // ── 自动滚动 ──
  let prevLen = 0
  let prevContentLen = 0
  effect(() => {
    const msgs = messages.value
    if (!bodyEl) return

    // 新消息时滚动
    if (msgs.length > prevLen && prevLen > 0) {
      requestAnimationFrame(() => { if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight })
    }

    // 流式输出时滚动（最后一条消息内容变化）
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1]
      const totalLen = msgs.reduce((s, m) => s + m.content.length, 0)
      if (totalLen > prevContentLen && prevContentLen > 0) {
        requestAnimationFrame(() => { if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight })
      }
      prevContentLen = totalLen
    }

    if (msgs.length > 0) prevLen = msgs.length
  })

  // ── WebSocket 事件处理 ──
  const wsVersion = signal(0)

  // 流式超时保护：30 秒后自动清除所有卡住的 "生成中..."
  const streamTimeout = setInterval(() => {
    let changed = false
    const updated = messages.value.map(m => {
      if (m.streaming) {
        changed = true
        return { ...m, streaming: false }
      }
      return m
    })
    if (changed) {
      messages.value = updated
      wsVersion.value++
    }
  }, 30000)
  onCleanup(() => clearInterval(streamTimeout))

  function handleWsEvent(event: any) {
    const type = event.type

    switch (type) {
      case 'new_message': {
        // 新消息（用户发的）
        const m = event.message
        messages.value = [...messages.value, {
          id: m.id,
          sender_id: m.sender_id,
          sender_name: m.sender_name ?? '',
          sender_type: m.sender_type ?? 'user',
          content: m.content,
          msg_type: 'text',
          created_at: m.created_at ?? new Date().toISOString(),
          streaming: false,
          tools: [],
        }]
        wsVersion.value++
        break
      }
      case 'ai:status': {
        // 流式开始：添加空消息占位
        const existing = messages.value.findIndex(m => m.id === event.messageId)
        if (existing === -1) {
          messages.value = [...messages.value, {
            id: event.messageId,
            sender_id: event.agentId,
            sender_name: event.agentName ?? 'AI',
            sender_type: 'ai',
            content: '',
            msg_type: 'text',
            created_at: new Date().toISOString(),
            streaming: true,
            tools: [],
          }]
        }
        wsVersion.value++
        break
      }
      case 'ai:chunk': {
        // 流式文本块：追加到已有消息
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx !== -1) {
          const updated = [...messages.value]
          updated[idx] = { ...updated[idx], streaming: true, content: updated[idx].content + event.text }
          messages.value = updated
          wsVersion.value++
        }
        break
      }
      case 'ai:tool': {
        // 工具调用
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx !== -1) {
          const updated = [...messages.value]
          const tools = [...(updated[idx].tools ?? []), {
            name: event.name,
            args: event.args,
            status: 'running' as const,
          }]
          updated[idx] = { ...updated[idx], tools }
          messages.value = updated
          wsVersion.value++
        }
        break
      }
      case 'ai:tool_result': {
        // 工具调用结果（暂不使用，留作扩展）
        break
      }
      case 'ai:done': {
        // 流式完成或失败
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx !== -1) {
          const updated = [...messages.value]
          const hadError = !!event.error
          updated[idx] = {
            ...updated[idx],
            streaming: false,
            content: updated[idx].content || (hadError ? '⚠️ AI 回复失败' : ''),
          }
          // 如果内容为空且没有错误，移除这条空消息
          if (!updated[idx].content && !hadError) {
            messages.value = updated.filter(m => m.id !== event.messageId)
          } else {
            messages.value = updated
          }
          wsVersion.value++
        }
        break
      }
      case 'ai_draft': {
        // HITL 草稿（保持原有格式）
        const draft = event.message
        messages.value = [...messages.value, {
          id: draft.id,
          sender_id: draft.agentId,
          sender_name: draft.agentName ?? 'AI',
          sender_type: 'ai',
          content: '[AI 生成中...]',
          msg_type: 'text',
          created_at: draft.createdAt ?? new Date().toISOString(),
          ai_draft: draft.draft,
          ai_approved: null,
          streaming: false,
          tools: [],
        }]
        wsVersion.value++
        break
      }
      case 'message_edited': {
        // 消息编辑
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx !== -1) {
          const updated = [...messages.value]
          updated[idx] = { ...updated[idx], content: event.content }
          messages.value = updated
          wsVersion.value++
        }
        break
      }
      case 'message_deleted': {
        // 消息撤回
        messages.value = messages.value.filter(m => m.id !== event.messageId)
        wsVersion.value++
        break
      }
    }
  }

  const unsub = ctx.ws.onMessage(handleWsEvent)
  onCleanup(() => unsub())
  ctx.ws.send({ type: 'subscribe', departmentId })

  // ── 发送消息 ──
  async function sendMessage(e: Event) {
    e.preventDefault()
    const content = inputValue.value.trim()
    if (!content || sending.value) return
    sending.value = true
    inputValue.value = ''

    try {
      await fetch(`/api/departments/${departmentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ content }),
      })
      // WS 事件会推送 new_message，不用手动 refetch
    } finally {
      sending.value = false
    }
  }

  // ── 编辑消息 ──
  function startEdit(msg: ChatMsg) {
    editingId.value = msg.id
    editValue.value = msg.content
  }

  function cancelEdit() {
    editingId.value = ''
    editValue.value = ''
  }

  async function saveEdit(e: Event) {
    e.preventDefault()
    const id = editingId.value
    const content = editValue.value.trim()
    if (!id || !content) return
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      cancelEdit()
    } else {
      const data = await res.json()
      alert(data.error || '编辑失败')
    }
  }

  // ── 删除消息 ──
  async function deleteMsg(msg: ChatMsg) {
    if (!confirm('确定撤回这条消息？')) return
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'DELETE', headers })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || '撤回失败')
    }
  }

  // ── HITL 审批 ──
  const approving = signal<string | null>(null)

  async function approveDraft(msgId: string) {
    approving.value = msgId
    try {
      await fetch(`/api/messages/${msgId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ approved: true }),
      })
    } finally {
      approving.value = null
    }
  }

  async function rejectDraft(msgId: string) {
    approving.value = msgId
    try {
      await fetch(`/api/messages/${msgId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ approved: false }),
      })
    } finally {
      approving.value = null
    }
  }

  function fmtTime(iso: string): string {
    try {
      const d = new Date(iso)
      const now = Date.now()
      const diff = now - d.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // 渲染消息列表时依赖 wsVersion 触发重渲染
  const renderVersion = computed(() => wsVersion.value)

  return (
    <div class="chat-shell">
      <div class="chat-head">
        <a href="/chat/new" class="back-link" style={{ marginBottom: '0' }}
          onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/chat/new') }}>←</a>
        <div class="chat-head-info">
          <div class="chat-head-name">{deptName}</div>
          <div class="chat-head-sub">{computed(() => `${deptMemberCount.value} 位成员`)}</div>
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

        <Show when={computed(() => messages.value.length > 0)}>
          {() => {
            // 用 renderVersion 触发重渲染
            void renderVersion.value
            return (
              <For each={messages} keyBy="id">{(msg: ChatMsg) => {
                if (msg.msg_type === 'system') {
                  return <div class="sys-pill">{msg.content}</div>
                }
                const own = isOwn(msg)
                const beingEdited = computed(() => editingId.value === msg.id)
                const isStreaming = msg.streaming

                return (
                  <div class={`msg-row${own ? ' own' : ''}`}>
                    <div class={`ava ava-sm ava-${msg.sender_type ?? 'user'}`}>{(msg.sender_name ?? '?')[0]}</div>
                    <div class="msg-col">
                      <div class="msg-meta">
                        <span>{msg.sender_name ?? '未知'}</span>
                        <span>{fmtTime(msg.created_at)}</span>
                        {isStreaming && <span style={{ color: 'var(--primary)', fontSize: '11px' }}>⏳ 生成中...</span>}
                        {canEdit(msg) && !isEditing.value && !msg.streaming && (
                          <span style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '11px', padding: '0 2px' }}
                              onClick={() => startEdit(msg)}
                            >编辑</button>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '11px', padding: '0 2px' }}
                              onClick={() => deleteMsg(msg)}
                            >撤回</button>
                          </span>
                        )}
                      </div>

                      {/* 工具调用指示器 */}
                      <Show when={computed(() => (msg.tools ?? []).length > 0)}>
                        {() => (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '4px' }}>
                            {(msg.tools ?? []).map((t, i) => (
                              <div key={i} style={{
                                fontSize: '11px', color: 'var(--text-3)',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '2px 8px', borderRadius: '4px',
                                background: '#f3f4f6', width: 'fit-content',
                              }}>
                                <span>{t.status === 'running' ? '⏳' : '✅'}</span>
                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                                <span style={{ color: 'var(--text-3)' }}>···</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Show>

                      <Show when={computed(() => !beingEdited.value)}>
                        <div class={`bubble${isStreaming ? ' streaming' : ''}`}>
                          {msg.content || (isStreaming ? '▊' : '')}
                        </div>
                      </Show>

                      <Show when={computed(() => beingEdited.value)}>
                        <form onSubmit={saveEdit} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <input
                            class="chat-input"
                            style={{ borderRadius: '14px', padding: '8px 14px', fontSize: '14px' }}
                            value={editValue}
                            onInput={(e: any) => { editValue.value = e.target.value }}
                            autoFocus
                          />
                          <button type="submit" class="chat-send" style={{ width: '36px', height: '36px', fontSize: '14px' }}>✓</button>
                          <button type="button" class="chat-send" style={{ width: '36px', height: '36px', fontSize: '14px', background: '#6b7280' }} onClick={cancelEdit}>✕</button>
                        </form>
                      </Show>

                      {/* HITL 审批 */}
                      {msg.ai_draft && msg.ai_approved === null && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{
                            padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                            background: '#fffbeb', border: '1px solid #fde68a',
                            color: '#92400e', marginBottom: '6px',
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '11px', color: '#b45309' }}>
                              ⏳ AI 草稿待审批
                            </div>
                            {msg.ai_draft}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              class="btn btn-sm"
                              style={{ background: '#10b981', color: '#fff', border: 'none' }}
                              disabled={computed(() => approving.value === msg.id)}
                              onClick={() => approveDraft(msg.id)}
                            >
                              {computed(() => approving.value === msg.id ? '处理中...' : '✓ 批准')}
                            </button>
                            <button
                              class="btn btn-sm"
                              style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                              disabled={computed(() => approving.value === msg.id)}
                              onClick={() => rejectDraft(msg.id)}
                            >
                              ✕ 拒绝
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }}</For>
            )
          }}
        </Show>
      </div>

      <form class="chat-bar" onSubmit={sendMessage}>
        <input
          class="chat-input"
          type="text"
          placeholder="输入消息，回车发送..."
          value={inputValue}
          onInput={(e: any) => { inputValue.value = e.target.value }}
          disabled={isEditing}
        />
        <button class="chat-send" type="submit" disabled={computed(() => !canSend.value)}>➤</button>
      </form>
    </div>
  )
}
