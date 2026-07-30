import type { WfuiContext, Component } from 'weifuwu/client'

export const Chat: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const deptId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

  $.msgs = []; $.deptName = '聊天'; $.memberCount = 0; $.input = ''
  $.editingId = ''; $.editValue = ''; $.userAgentId = ''; $.sending = false
  $.bodyEl = null; $.isUserScrolledUp = false; $.unsubWs = null
  $.approving = null; $.copiedId = ''; $.timeVersion = 0

  // 加载初始数据
  Promise.all([
    fetch(`/api/departments/${deptId}/messages`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    fetch(`/api/departments/${deptId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    fetch('/api/agents?type=user', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
  ]).then(([msgRes, deptRes, agentRes]) => {
    const agents = agentRes.agents ?? []
    const user = ctx.auth?.user
    const mine = agents.find((a: any) => a.user_id === user?.id)
    if (mine) $.userAgentId = mine.id
    $.msgs = (msgRes.messages ?? []).reverse().map((m: any) => ({ ...m }))
    $.deptName = deptRes?.department?.name ?? deptRes?.name ?? '聊天'
    $.memberCount = (deptRes?.members ?? []).length
  }).catch(() => {})

  // WS 事件
  const unsub = ctx.ws?.onMessage((event: any) => {
    switch (event.type) {
      case 'new_message':
        $.msgs.push({ id: event.message.id, sender_id: event.message.sender_id, sender_name: event.message.sender_name ?? '', sender_type: event.message.sender_type ?? 'user', content: event.message.content, msg_type: 'text', created_at: event.message.created_at ?? new Date().toISOString(), status: 'idle', tools: [] }); break
      case 'ai_draft':
        $.msgs.push({ id: event.message.id, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'idle', tools: [], ai_draft: event.draft, ai_approved: null }); break
      case 'ai:status': {
        const idx = $.msgs.findIndex((m: any) => m.id === event.messageId)
        if (event.status === 'thinking' && idx === -1) {
          $.msgs.push({ id: event.messageId, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'thinking', tools: [] })
        } else if (idx !== -1) {
          if (event.status === 'complete' || event.status === 'error') {
            const m = $.msgs[idx]
            if (!m.content && event.status === 'error') { m.content = '⚠️ AI 回复失败' }
            m.status = event.status; if (event.usage) m.usage = event.usage
          } else { $.msgs[idx].status = event.status }
        }
        ; break
      }
      case 'ai:token': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (m) m.content += event.text
        ; break
      }
      case 'ai:tool': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (!m) break
        if (event.phase === 'call') {
          if (!m.tools) m.tools = []
          if (!m.tools.some((t: any) => t.name === event.name && t.status === 'running')) {
            m.tools.push({ name: event.name, args: event.args, status: 'running' })
          }
        } else if (event.phase === 'result') {
          (m.tools ?? []).forEach((t: any) => { if (t.name === event.name && t.status === 'running') { t.status = 'done'; t.result = event.result } })
        }
        ; break
      }
      case 'message_edited': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (m) m.content = event.content; break
      }
      case 'message_deleted': {
        $.msgs = $.msgs.filter((m: any) => m.id !== event.messageId); break
      }
    }
  })
  $.unsubWs = unsub

  // WS 订阅
  if (ctx.ws?.isConnected) {
    ctx.ws?.send({ type: 'subscribe', departmentId: deptId })
  }

  // 流式超时保护 + 相对时间刷新
  const timer = setInterval(() => {
    $.timeVersion++
    let changed = false
    const now = Date.now()
    const updated = $.msgs.map((m: any) => {
      if ((m.status === 'thinking' || m.status === 'generating') && m.created_at) {
        if (now - new Date(m.created_at).getTime() > 60000) {
          changed = true; return { ...m, status: 'complete' }
        }
      }
      return m
    })
    if (changed) { $.msgs = updated }
  }, 30000)
  $.streamTimer = timer

  // ── 自动滚动 ──
  let prevLen = 0
  let prevContentLen = 0

  function scrollToBottom(force = false) {
    const body = $.bodyEl
    if (!body || ($.isUserScrolledUp && !force)) return
    requestAnimationFrame(() => { if ($.bodyEl) $.bodyEl.scrollTop = $.bodyEl.scrollHeight })
  }

  function isOwn(msg: any) { return $.userAgentId && msg.sender_id === $.userAgentId }
  function canEdit(msg: any) { return isOwn(msg) && Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000 }

  async function sendMessage(e: Event) {
    e.preventDefault()
    const content = $.input.trim()
    if (!content || $.sending) return
    const saved = content
    $.sending = true; $.input = ''
    ctx.ws?.send({ type: 'subscribe', departmentId: deptId })
    try {
      const res = await fetch(`/api/departments/${deptId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) { $.input = saved; const d = await res.json().catch(() => ({})); alert(d.error || '发送失败') }
    } catch { $.input = saved; alert('网络错误') }
    finally { $.sending = false }
  }

  async function retryMessage(fromMsgId: string) {
    const idx = $.msgs.findIndex((m: any) => m.id === fromMsgId)
    if (idx <= 0) return
    const lastUser = $.msgs.slice(0, idx).filter((m: any) => m.sender_type === 'user').pop()
    if (!lastUser) return
    $.msgs = $.msgs.filter((m: any) => m.id !== fromMsgId)
    $.sending = true
    ctx.ws?.send({ type: 'subscribe', departmentId: deptId })
    await fetch(`/api/departments/${deptId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: lastUser.content }),
    })
    $.sending = false
  }

  function startEdit(msg: any) { $.editingId = msg.id; $.editValue = msg.content }
  function cancelEdit() { $.editingId = ''; $.editValue = '' }

  async function saveEdit(e: Event) {
    e.preventDefault()
    if (!$.editingId || !$.editValue.trim()) return
    const res = await fetch(`/api/messages/${$.editingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: $.editValue }),
    })
    if (res.ok) cancelEdit(); else { const d = await res.json(); alert(d.error || '编辑失败') }
  }

  async function deleteMsg(msg: any) {
    if (!confirm('确定撤回这条消息？')) return
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { const d = await res.json(); alert(d.error || '撤回失败') }
  }

  function copyContent(msg: any) {
    navigator.clipboard.writeText(msg.content).then(() => {
      $.copiedId = msg.id
      setTimeout(() => { if ($.copiedId === msg.id) { $.copiedId = '' } }, 2000)
    }).catch(() => {})
  }

  async function approveDraft(msgId: string) {
    $.approving = msgId
    await fetch(`/api/messages/${msgId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approved: true }),
    }).catch(() => {})
    $.approving = null
  }

  async function rejectDraft(msgId: string) {
    $.approving = msgId
    await fetch(`/api/messages/${msgId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approved: false }),
    }).catch(() => {})
    $.approving = null
  }

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso)
      const diff = Date.now() - d.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  function toolLabel(name: string) {
    const labels: Record<string, string> = { 'search-knowledge-base': '搜索知识库', 'get-current-time': '获取当前时间', list_files: '列出文件', read: '读取文件', write: '写入文件', edit: '编辑文件', grep: '搜索文件', bash: '执行命令' }
    return labels[name] ?? name.replace(/_/g, ' ')
  }

  // 每次 render 后检查是否需要滚动
  const msgs = $.msgs
  if (msgs.length > prevLen) { scrollToBottom(); prevLen = msgs.length }
  if (msgs.length > 0) {
    const totalLen = msgs.reduce((s: number, m: any) => s + m.content.length, 0)
    if (totalLen > prevContentLen && prevContentLen > 0) { scrollToBottom() }
    prevContentLen = totalLen
  }

  return (props: {}) => {
    const inputDisabled = $.editingId !== ''
    const canSend = $.input.trim().length > 0 && !$.sending

    return (
    <div class="chat-shell">
      <div class="chat-head">
        <a href="/chat/new" class="back-link" style={{ marginBottom: '0' }}
          onClick={(e: any) => { e.preventDefault(); ctx.app?.navigate('/chat/new') }}>←</a>
        <div class="chat-head-info">
          <div class="chat-head-name">{$.deptName}</div>
          <div class="chat-head-sub">{$.memberCount} 位成员</div>
        </div>
        {!ctx.ws?.isConnected && <span class="badge badge-err" style={{ marginLeft: '8px' }}>⚠ 连接断开</span>}
        <button class="btn btn-ghost btn-sm" onClick={() => ctx.app?.navigate(`/departments/${deptId}`)}>部门详情</button>
      </div>

      <div class="chat-body" ref={(el: any) => {
        if (el) { $.bodyEl = el; scrollToBottom(true) }
        if (!el && $.bodyEl) {
          $.bodyEl = null
          if ($.unsubWs) { try { $.unsubWs() } catch {}; $.unsubWs = null }
          if ($.streamTimer) { clearInterval($.streamTimer); $.streamTimer = null }
        }
      }}
        onScroll={() => {
          if (!$.bodyEl) return
          const threshold = 80
          $.isUserScrolledUp = ($.bodyEl.scrollHeight - $.bodyEl.scrollTop - $.bodyEl.clientHeight) > threshold
        }}>
        {$.msgs.length === 0 && (
          <div class="empty">
            <div class="empty-ico">💬</div>
            <div class="empty-txt">暂无消息</div>
            <div class="empty-hint">发送第一条消息，@ 的 AI 成员会自动回复</div>
          </div>
        )}

        {$.msgs.map((msg: any) => {
          const own = isOwn(msg)
          const beingEdited = $.editingId === msg.id
          const st = msg.status
          const isActive = st === 'thinking' || st === 'generating'
          const isError = st === 'error'
          const showTools = msg.sender_type === 'ai' && (msg.tools ?? []).length > 0

          if (msg.msg_type === 'system') return <div class="sys-pill">{msg.content}</div>

          return (
            <div class={`msg-row${own ? ' own' : ''}`}>
              <div class={`ava ava-sm ava-${msg.sender_type ?? 'user'}`}>{(msg.sender_name ?? '?')[0]}</div>
              <div class="msg-col">
                <div class="msg-meta">
                  <span>{msg.sender_name ?? '未知'}</span>
                  <span>{fmtTime(msg.created_at)}</span>
                  {isActive && <span style={{ color: 'var(--primary)', fontSize: '11px' }}>{st === 'thinking' ? '思考中...' : '生成中...'}</span>}
                  {isError && <span style={{ color: 'var(--danger)', fontSize: '11px' }}>出错了</span>}
                  {canEdit(msg) && !$.editingId && !isActive && (
                    <span style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '11px', padding: '0 2px' }}
                        onClick={() => startEdit(msg)}>编辑</button>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '11px', padding: '0 2px' }}
                        onClick={() => deleteMsg(msg)}>撤回</button>
                    </span>
                  )}
                  {st === 'complete' && msg.sender_type === 'ai' && msg.content && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: $.copiedId === msg.id ? 'var(--success, #10b981)' : 'var(--text-3)', fontSize: '11px', padding: '0 2px', marginLeft: '4px' }}
                      onClick={() => copyContent(msg)}>{$.copiedId === msg.id ? '✅ 已复制' : '📋 复制'}</button>
                  )}
                </div>

                {showTools && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '6px' }}>
                    {(msg.tools ?? []).map((t: any, i: number) => (
                      <div key={i} style={{
                        fontSize: '11px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '3px 10px', borderRadius: '6px', background: '#f0f0ff', width: 'fit-content', border: '1px solid #e4e4f0',
                      }}>
                        <span>{t.status === 'running' ? '⏳' : '✅'}</span>
                        <span style={{ fontWeight: 500, color: '#555' }}>{toolLabel(t.name)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!beingEdited && (
                  <div>
                    <div class={`bubble${isActive ? ' active' : ''}${isError ? ' error' : ''}${!own && msg.sender_type === 'ai' && st === 'complete' ? ' bubble-ai' : ''}`}>
                      {msg.content || ''}
                    </div>
                    {st === 'complete' && msg.usage && (
                      <div style={{ marginTop: '3px', textAlign: 'right' }}>
                        <span class="badge badge-gray" style={{ fontSize: '10px', opacity: '.6' }}>⚡ {msg.usage.total_tokens} tokens</span>
                      </div>
                    )}
                    {isError && (
                      <button class="btn btn-sm" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '12px', cursor: 'pointer', borderRadius: '6px', padding: '2px 10px', marginTop: '4px' }}
                        onClick={() => retryMessage(msg.id)}>🔄 重新生成</button>
                    )}

                    {/* HITL 审批 */}
                    {msg.ai_draft && msg.ai_approved === null && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: '6px' }}>
                          <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '11px', color: '#b45309' }}>⏳ AI 草稿待审批</div>
                          {msg.ai_draft}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button class="btn btn-sm" style={{ background: '#10b981', color: '#fff', border: 'none' }}
                            disabled={$.approving === msg.id}
                            onClick={() => approveDraft(msg.id)}>{$.approving === msg.id ? '处理中...' : '✓ 批准'}</button>
                          <button class="btn btn-sm" style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                            disabled={$.approving === msg.id}
                            onClick={() => rejectDraft(msg.id)}>✕ 拒绝</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {beingEdited && (
                  <form onSubmit={saveEdit} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <input class="chat-input" style={{ borderRadius: '14px', padding: '8px 14px', fontSize: '14px' }}
                      value={$.editValue} onInput={(e: any) => { $.editValue = e.target.value }} autoFocus />
                    <button type="submit" class="chat-send" style={{ width: '36px', height: '36px', fontSize: '14px' }}>✓</button>
                    <button type="button" class="chat-send" style={{ width: '36px', height: '36px', fontSize: '14px', background: '#6b7280' }} onClick={cancelEdit}>✕</button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <form class="chat-bar" onSubmit={sendMessage}>
        <input class="chat-input" type="text" placeholder="输入消息，回车发送..."
          value={$.input} onInput={(e: any) => { $.input = e.target.value }}
          disabled={inputDisabled} />
        <button class="chat-send" type="submit" disabled={!canSend}>➤</button>
      </form>
    </div>
    )
  }
}
