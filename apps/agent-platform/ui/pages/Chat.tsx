/**
 * 聊天页面 — 气泡式消息 + 编辑/撤回 + WebSocket 实时推送
 */

import { signal, computed, createResource, Show, For, effect, onCleanup } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

export function Chat(_props: {}, ctx: WfuiContext) {
  const departmentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const inputValue = signal('')
  const sending = signal(false)
  const loaded = signal(false)
  const prevCount = signal(0)
  let bodyEl: HTMLElement | null = null

  // 编辑状态
  const editingId = signal('')
  const editValue = signal('')

  const [messagesRes, { loading, refetch }] = createResource<any[]>(
    () => fetch(`/api/departments/${departmentId}/messages`, { headers })
      .then(r => r.json())
      .then(d => (d.messages ?? []).reverse()),
    { initialValue: [] },
  )
  const [dept] = createResource<any>(
    () => fetch(`/api/departments/${departmentId}`, { headers }).then(r => r.json()),
  )

  // 获取当前用户的 user agent ID（用于判断消息归属）
  const [userAgentId] = createResource<string>(
    () => fetch('/api/agents?type=user', { headers })
      .then(r => r.json())
      .then(d => {
        const agents = d.agents ?? []
        const mine = agents.find((a: any) => a.user_id === (ctx.auth?.user?.value ?? ctx.auth?.user)?.id)
        return mine?.id ?? ''
      }),
    { initialValue: '' },
  )

  const messages = computed(() => messagesRes.value ?? [])
  const showLoading = computed(() => loading.value && !loaded.value)
  const showEmpty = computed(() => !loading.value && messages.value.length === 0)
  const deptName = computed(() => dept.value?.department?.name ?? dept.value?.name ?? '聊天')
  const memberCount = computed(() => (dept.value?.members ?? []).length)
  const canSend = computed(() => inputValue.value.trim().length > 0 && !sending.value)

  // 判断消息是否可编辑/撤回：是本人发送且在 5 分钟内
  function isOwn(msg: any): boolean {
    return userAgentId.value !== '' && msg.sender_id === userAgentId.value
  }
  function canEdit(msg: any): boolean {
    if (!isOwn(msg)) return false
    const fiveMin = Date.now() - 5 * 60 * 1000
    return new Date(msg.created_at).getTime() > fiveMin
  }

  // ── 首屏 + 自动滚动 ──
  effect(() => {
    const count = messages.value.length
    if (count > 0 && !loaded.value) loaded.value = true
    if (bodyEl && count > prevCount.value && prevCount.value > 0) {
      requestAnimationFrame(() => {
        if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
      })
    }
    if (count > 0) prevCount.value = count
  })

  // ── WebSocket ──
  const unsub = ctx.ws.onMessage(() => refetch())
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

  // ── 编辑消息 ──
  function startEdit(msg: any) {
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
      await refetch()
    } else {
      const data = await res.json()
      alert(data.error || '编辑失败')
    }
  }

  // ── 删除消息 ──
  async function deleteMsg(msg: any) {
    if (!confirm('确定撤回这条消息？')) return
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'DELETE', headers })
    if (res.ok) await refetch()
    else {
      const data = await res.json()
      alert(data.error || '撤回失败')
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

  const isEditing = computed(() => editingId.value !== '')

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
          const own = isOwn(msg)
          const beingEdited = computed(() => editingId.value === msg.id)

          return (
            <div class={`msg-row${own ? ' own' : ''}`}>
              <div class={`ava ava-sm ava-${msg.sender_type ?? 'user'}`}>{(msg.sender_name ?? '?')[0]}</div>
              <div class="msg-col">
                <div class="msg-meta">
                  <span>{msg.sender_name ?? '未知'}</span>
                  <span>{fmtTime(msg.created_at)}</span>
                  {canEdit(msg) && !isEditing.value && (
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

                <Show when={computed(() => !beingEdited.value)}>
                  <div class="bubble">{msg.content}</div>
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
          disabled={isEditing}
        />
        <button class="chat-send" type="submit" disabled={computed(() => !canSend.value)}>➤</button>
      </form>
    </div>
  )
}
