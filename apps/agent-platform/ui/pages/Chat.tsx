/**
 * 聊天页面 — 气泡式消息 + 流式输出 + WebSocket 实时推送
 *
 * 流式 AI 回复：
 *   后端逐 chunk 推送 WS 事件，前端原地更新气泡内容。
 *   无需等待完整回复，用户即时看到 AI 生成过程。
 */

import { signal, computed, Show, For, effect, onCleanup, onMount, batch } from 'weifuwu/client'
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
  let inputEl: HTMLInputElement | null = null

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

  // ── WebSocket 连接状态 ──
  const wsConnected = computed(() => ctx.ws.isConnected.value)
  const showReconnectBanner = computed(() => !wsConnected.value)

  // ── 自动聚焦输入框 ──
  onMount(() => { inputEl?.focus() })

  // 发送后自动 focus
  effect(() => {
    void sending.value // 依赖 sending 变化
    if (!sending.value) {
      requestAnimationFrame(() => { inputEl?.focus() })
    }
  })

  // ── 自动滚动（带用户滚动检测）──
  let prevLen = 0
  let prevContentLen = 0
  let isUserScrolledUp = false

  function scrollToBottom() {
    if (!bodyEl || isUserScrolledUp) return
    requestAnimationFrame(() => {
      if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
    })
  }

  function onBodyScroll() {
    if (!bodyEl) return
    const threshold = 80 // 距离底部 80px 内视为"在底部"
    const nearBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < threshold
    isUserScrolledUp = !nearBottom
  }

  effect(() => {
    const msgs = messages.value
    if (!bodyEl) return

    // 新消息时滚动
    if (msgs.length > prevLen && prevLen > 0) {
      scrollToBottom()
    }

    // 流式输出时滚动
    if (msgs.length > 0) {
      const totalLen = msgs.reduce((s, m) => s + m.content.length, 0)
      if (totalLen > prevContentLen && prevContentLen > 0) {
        scrollToBottom()
      }
      prevContentLen = totalLen
    }

    if (msgs.length > 0) prevLen = msgs.length
  })

  // ── WebSocket 事件处理 ──
  const wsVersion = signal(0)

  // 流式超时保护：30 秒后自动清除所有卡住的状态
  const streamTimeout = setInterval(() => {
    let changed = false
    const now = Date.now()
    const updated = messages.value.map(m => {
      if ((m.status === 'thinking' || m.status === 'generating') && m.created_at) {
        const age = now - new Date(m.created_at).getTime()
        if (age > 60000) { // 超过 60 秒强制完成
          changed = true
          return { ...m, status: 'complete' }
        }
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
        const m = event.message
        messages.value = [...messages.value, {
          id: m.id,
          sender_id: m.sender_id,
          sender_name: m.sender_name ?? '',
          sender_type: m.sender_type ?? 'user',
          content: m.content,
          msg_type: 'text',
          created_at: m.created_at ?? new Date().toISOString(),
          status: 'idle',
          tools: [],
        }]
        wsVersion.value++
        break
      }

      // ── AI 状态机事件 ────────────────────────────────
      // status: thinking   → LLM 调用中
      // status: generating → 正在输出文本
      // status: complete   → 生成完成
      // status: error      → 生成失败
      case 'ai:status': {
        const s = event.status
        const existing = messages.value.findIndex(m => m.id === event.messageId)

        if (s === 'thinking' && existing === -1) {
          // 新建 AI 消息占位
          messages.value = [...messages.value, {
            id: event.messageId,
            sender_id: event.agentId,
            sender_name: event.agentName ?? 'AI',
            sender_type: 'ai',
            content: '',
            msg_type: 'text',
            created_at: new Date().toISOString(),
            status: 'thinking',
            tools: [],
          }]
        } else if (existing !== -1) {
          const updated = [...messages.value]
          if (s === 'complete' || s === 'error') {
            // 完成/失败：移除空消息，或保留内容
            const content = updated[existing].content || ''
            if (!content && s === 'error') {
              updated[existing] = { ...updated[existing], status: 'error', content: '⚠️ AI 回复失败' }
            } else if (!content) {
              messages.value = updated.filter(m => m.id !== event.messageId)
              wsVersion.value++
              break
            }
            updated[existing] = { ...updated[existing], status: s, usage: event.usage }
          } else {
            updated[existing] = { ...updated[existing], status: s }
          }
          messages.value = updated
        }
        wsVersion.value++
        break
      }

      case 'ai:token': {
        // 流式文本片段
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx !== -1) {
          const updated = [...messages.value]
          updated[idx] = { ...updated[idx], content: updated[idx].content + event.text }
          messages.value = updated
          wsVersion.value++
        }
        break
      }

      case 'ai:tool': {
        // 工具调用 / 工具返回
        const idx = messages.value.findIndex(m => m.id === event.messageId)
        if (idx === -1) break

        const updated = [...messages.value]
        if (event.phase === 'call') {
          const tools = [...(updated[idx].tools ?? []), {
            name: event.name,
            args: event.args,
            status: 'running' as const,
          }]
          updated[idx] = { ...updated[idx], tools }
        } else if (event.phase === 'result') {
          const tools = (updated[idx].tools ?? []).map(t =>
            t.name === event.name && t.status === 'running'
              ? { ...t, status: 'done' as const, result: event.result }
              : t
          )
          updated[idx] = { ...updated[idx], tools }
        }
        messages.value = updated
        wsVersion.value++
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

  // ── 重新生成 ──
  async function retryMessage(fromMsgId: string) {
    // 找到该消息之前的用户消息
    const msgs = messages.value
    const errIdx = msgs.findIndex(m => m.id === fromMsgId)
    if (errIdx <= 0) return
    const userMsgs = msgs.slice(0, errIdx).filter(m => m.sender_type === 'user').reverse()
    const lastUserMsg = userMsgs[0]
    if (!lastUserMsg) return

    // 移除失败的 AI 消息
    messages.value = msgs.filter(m => m.id !== fromMsgId)
    wsVersion.value++

    // 重新发送用户消息
    sending.value = true
    try {
      await fetch(`/api/departments/${departmentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ content: lastUserMsg.content }),
      })
    } finally {
      sending.value = false
    }
  }

  // ── 发送消息 ──
  async function sendMessage(e: Event) {
    e.preventDefault()
    const content = inputValue.value.trim()
    if (!content || sending.value) return
    const savedInput = content // 发送失败时恢复
    sending.value = true
    inputValue.value = ''

    try {
      const res = await fetch(`/api/departments/${departmentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        // 发送失败，恢复输入
        inputValue.value = savedInput
        const data = await res.json().catch(() => ({}))
        alert(data.error || '发送失败')
      }
      // WS 事件会推送 new_message，不用手动 refetch
    } catch {
      // 网络错误，恢复输入
      inputValue.value = savedInput
      alert('网络错误，请检查连接后重试')
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

  // ── 相对时间自动刷新 ──
  const timeVersion = signal(0)
  const timeTimer = setInterval(() => { timeVersion.value++ }, 30000)
  onCleanup(() => clearInterval(timeTimer))

  // 渲染消息列表时依赖 wsVersion 触发重渲染
  const renderVersion = computed(() => wsVersion.value + timeVersion.value)

  return (
    <div class="chat-shell">
      {/* WS 断连提示 */}
      <Show when={showReconnectBanner}>
        <div style={{
          padding: '6px 24px', fontSize: '12px', textAlign: 'center', flex: 'none',
          background: '#fef3c7', color: '#b45309', borderBottom: '1px solid #fde68a',
        }}>连接断开，正在重连...</div>
      </Show>

      <div class="chat-head">
        <a href="/chat/new" class="back-link" style={{ marginBottom: '0' }}
          onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/chat/new') }}>←</a>
        <div class="chat-head-info">
          <div class="chat-head-name">{deptName}</div>
          <div class="chat-head-sub">{computed(() => `${deptMemberCount.value} 位成员`)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onClick={() => ctx.app.navigate(`/departments/${departmentId}`)}>部门详情</button>
      </div>

      <div class="chat-body" ref={(el: any) => { bodyEl = el }} onScroll={onBodyScroll}>
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
                const st = msg.status
                const isActive = st === 'thinking' || st === 'generating'

                function statusLabel() {
                  if (st === 'thinking') {
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        思考中
                        <span class="typing-dots">
                          <span></span><span></span><span></span>
                        </span>
                      </span>
                    )
                  }
                  if (st === 'generating') {
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        生成中
                        <span class="typing-dots">
                          <span></span><span></span><span></span>
                        </span>
                      </span>
                    )
                  }
                  if (st === 'error') return <span>⚠️ 出错了</span>
                  return ''
                }

                return (
                  <div class={`msg-row${own ? ' own' : ''}`}>
                    <div class={`ava ava-sm ava-${msg.sender_type ?? 'user'}`}>{(msg.sender_name ?? '?')[0]}</div>
                    <div class="msg-col">
                      <div class="msg-meta">
                        <span>{msg.sender_name ?? '未知'}</span>
                        <span>{fmtTime(msg.created_at)}</span>
                        {isActive && <span style={{ color: 'var(--primary)', fontSize: '11px' }}>{statusLabel()}</span>}
                        {st === 'error' && <span style={{ color: 'var(--danger)', fontSize: '11px' }}>{statusLabel()}</span>}
                        {canEdit(msg) && !isEditing.value && !isActive && (
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

                      {/* 工具调用 -- 仅 AI 消息且非 idle 时显示 */}
                      <Show when={computed(() => msg.sender_type === 'ai' && msg.status !== 'idle' && (msg.tools ?? []).length > 0)}>
                        {() => (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '4px' }}>
                            {(msg.tools ?? []).map((t, i) => (
                              <div key={i} class={t.status === 'running' ? 'tool-running' : ''} style={{
                                fontSize: '11px', color: 'var(--text-3)',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '2px 8px', borderRadius: '4px',
                                background: '#f3f4f6', width: 'fit-content',
                              }}>
                                {t.status === 'running'
                                  ? <span class="typing-dots" style={{ display: 'inline-flex', gap: '2px' }}>
                                      <span></span><span></span><span></span>
                                    </span>
                                  : <span>✅</span>
                                }
                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                                <span style={{ color: 'var(--text-3)' }}>···</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Show>

                      <Show when={computed(() => !beingEdited.value)}>
                        <div class={`bubble${isActive ? ' active' : ''}${st === 'error' ? ' error' : ''}`}>
                          {msg.content || ''}
                          {st === 'generating' && <span class="cursor-blink"></span>}
                        </div>
                        {st === 'complete' && msg.usage && (
                          <div style={{ marginTop: '4px', textAlign: 'right' }}>
                            <span class="badge badge-gray" style={{ fontSize: '10px', opacity: '.7' }}>
                              ⚡ {msg.usage.total_tokens} tokens
                            </span>
                          </div>
                        )}
                        {st === 'error' && (
                          <div style={{ marginTop: '4px' }}>
                            <button
                              class="btn btn-sm"
                              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '12px', cursor: 'pointer', borderRadius: '6px', padding: '2px 10px' }}
                              onClick={() => retryMessage(msg.id)}
                            >🔄 重新生成</button>
                          </div>
                        )}
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
          ref={(el: any) => { inputEl = el }}
        />
        <button class="chat-send" type="submit" disabled={computed(() => !canSend.value)}>➤</button>
      </form>
    </div>
  )
}
