import type { WfuiContext, Component } from 'weifuwu/client'
import { Ava } from '../components/ui'
import { Alert, Badge, Button, EmptyState, Input } from 'weifuwu/components'

export const Chat: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const deptId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

  $.msgs = []; $.deptName = '聊天'; $.memberCount = 0; $.input = ''
  $.editingId = ''; $.editValue = ''; $.userAgentId = ''; $.sending = false
  $.bodyEl = null; $.isUserScrolledUp = false; $.unsubWs = null
  $.approving = null; $.copiedId = ''; $.timeVersion = 0

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

  const unsub = ctx.ws?.onMessage((event: any) => {
    switch (event.type) {
      case 'new_message':
        if (!$.msgs.some((m: any) => m.id === event.message.id)) {
          $.msgs.push({ id: event.message.id, sender_id: event.message.sender_id, sender_name: event.message.sender_name ?? '', sender_type: event.message.sender_type ?? 'user', content: event.message.content, msg_type: 'text', created_at: event.message.created_at ?? new Date().toISOString(), status: 'idle', tools: [] })
        }
        ; break
      case 'ai_draft':
        if (!$.msgs.some((m: any) => m.id === event.message.id)) {
          $.msgs.push({ id: event.message.id, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'idle', tools: [], ai_draft: event.draft, ai_approved: null })
        }
        ; break
      case 'wf:step': {
        // 框架协议：stepType 'llm'（开始思考）/ 'tool'（工具调用）
        const idx = $.msgs.findIndex((m: any) => m.id === event.messageId)
        if (event.stepType === 'llm') {
          if (idx === -1) {
            $.msgs.push({ id: event.messageId, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'thinking', tools: [] })
          } else if ($.msgs[idx].status !== 'complete' && $.msgs[idx].status !== 'error') {
            $.msgs[idx].status = 'thinking'
          }
        } else if (event.stepType === 'tool') {
          const m = $.msgs.find((m: any) => m.id === event.messageId)
          if (m) {
            if (!m.tools) m.tools = []
            if (!m.tools.some((t: any) => t.name === event.name && t.status === 'running')) {
              m.tools.push({ name: event.name, args: event.args, status: 'running' })
            }
          }
        }
        ; break
      }
      case 'wf:token': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (m) { m.content += event.text; if (m.status !== 'complete') m.status = 'generating' }
        ; break
      }
      case 'wf:tool_result': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (m) {
          (m.tools ?? []).forEach((t: any) => { if (t.name === event.name && t.status === 'running') { t.status = 'done'; t.result = event.result } })
          if (m.status !== 'complete') m.status = 'thinking'
        }
        ; break
      }
      case 'wf:done': {
        const idx = $.msgs.findIndex((m: any) => m.id === event.messageId)
        if (idx !== -1) {
          const m = $.msgs[idx]
          if (event.content) m.content = event.content
          m.status = 'complete'; if (event.usage) m.usage = event.usage
        }
        ; break
      }
      case 'wf:error': {
        const m = $.msgs.find((m: any) => m.id === event.messageId)
        if (m) { if (!m.content) m.content = '⚠️ AI 回复失败'; m.status = 'error' }
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

  ctx.ws?.send({ type: 'subscribe', room: deptId })

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
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    try {
      const res = await fetch(`/api/departments/${deptId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.message && !$.msgs.some((m: any) => m.id === data.message.id)) {
          $.msgs.push({
            id: data.message.id,
            sender_id: data.message.sender_id ?? '',
            sender_name: data.message.sender_name ?? '我',
            sender_type: 'user',
            content: data.message.content ?? content,
            msg_type: 'text',
            created_at: data.message.created_at ?? new Date().toISOString(),
            status: 'idle',
            tools: [],
          })
        }
      } else {
        $.input = saved; const d = await res.json().catch(() => ({})); alert(d.error || '发送失败')
      }
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
    ctx.ws?.send({ type: 'subscribe', room: deptId })
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
    const ok = await ctx.confirm!('确定撤回这条消息？')
    if (!ok) return
    const res = await fetch(`/api/messages/${msg.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { const d = await res.json(); ctx.toast!(d.error || '撤回失败', 'error') }
    else ctx.toast!('消息已撤回', 'success')
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

  const chatBodyRef = (el: any) => {
    if (el) { $.bodyEl = el; scrollToBottom(true) }
    if (!el && $.bodyEl) {
      $.bodyEl = null
      if ($.unsubWs) { try { $.unsubWs() } catch {}; $.unsubWs = null }
      if ($.streamTimer) { clearInterval($.streamTimer); $.streamTimer = null }
    }
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

  return (props: {}) => {
    const msgsLen = $.msgs.length
    if (msgsLen > prevLen) { scrollToBottom(); prevLen = msgsLen }
    if (msgsLen > 0) {
      const totalLen = $.msgs.reduce((s: number, m: any) => s + m.content.length, 0)
      if (totalLen > prevContentLen && prevContentLen > 0) { scrollToBottom() }
      prevContentLen = totalLen
    }

    const inputDisabled = $.editingId !== ''
    const canSend = $.input.trim().length > 0 && !$.sending

    return (
    <div class="wf-stack wf-h-full">
      <div class="wf-row wf-gap-sm wf-p-sm wf-bg-secondary wf-border-b">
        <a href="/chat/new" class="wf-text-brand"
          onClick={(e: any) => { e.preventDefault(); ctx.app?.navigate('/chat/new') }}>←</a>
        <div class="wf-fill wf-stack wf-gap-none">
          <div class="wf-text-base wf-text-semibold">{$.deptName}</div>
          <div class="wf-text-xs wf-text-tertiary">{$.memberCount} 位成员</div>
        </div>
        {!ctx.ws?.isConnected && <Badge variant="error">⚠ 连接断开</Badge>}
        <Button size="sm" variant="ghost" onClick={() => ctx.app?.navigate(`/departments/${deptId}`)}>部门详情</Button>
      </div>

      <div class="wf-fill wf-scroll wf-stack wf-gap-md wf-p-md"
        ref={chatBodyRef}
        onScroll={() => {
          if (!$.bodyEl) return
          const threshold = 80
          $.isUserScrolledUp = ($.bodyEl.scrollHeight - $.bodyEl.scrollTop - $.bodyEl.clientHeight) > threshold
        }}>
        {$.msgs.length === 0 && (
          <EmptyState icon="💬" text="暂无消息" hint="发送第一条消息，@ 的 AI 成员会自动回复" />
        )}

        {$.msgs.map((msg: any) => {
          const own = isOwn(msg)
          const beingEdited = $.editingId === msg.id
          const st = msg.status
          const isActive = st === 'thinking' || st === 'generating'
          const isError = st === 'error'
          const showTools = msg.sender_type === 'ai' && (msg.tools ?? []).length > 0

          if (msg.msg_type === 'system') return <div class="wf-center"><span class="wf-pill wf-bg-tertiary wf-text-secondary wf-px-sm wf-py-xs wf-text-xs">{msg.content}</span></div>

          return (
            <div class={`wf-row wf-top wf-gap-sm${own ? ' wf-row-reverse' : ''}`}>
              <Ava name={msg.sender_name} type={msg.sender_type ?? 'user'} small />
              <div class={`wf-stack wf-gap-xs wf-shrink${own ? ' wf-bottom' : ''}`}>
                <div class={`wf-row wf-gap-xs wf-text-xs wf-text-tertiary${own ? ' wf-row-reverse' : ''}`}>
                  <span>{msg.sender_name ?? '未知'}</span>
                  <span>{fmtTime(msg.created_at)}</span>
                  {isActive && <span class="wf-text-brand">{st === 'thinking' ? '思考中...' : '生成中...'}</span>}
                  {isError && <span class="wf-text-error">出错了</span>}
                  {canEdit(msg) && !$.editingId && !isActive && (
                    <span class="wf-row wf-gap-xs">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(msg)}>编辑</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMsg(msg)}>撤回</Button>
                    </span>
                  )}
                  {st === 'complete' && msg.sender_type === 'ai' && msg.content && (
                    <Button size="sm" variant="ghost" onClick={() => copyContent(msg)}>
                      {$.copiedId === msg.id ? '✅ 已复制' : '📋 复制'}
                    </Button>
                  )}
                </div>

                {showTools && (
                  <div class="wf-stack wf-gap-xs">
                    {(msg.tools ?? []).map((t: any, i: number) => (
                      <span key={i} class="wf-pill wf-bg-brand wf-px-sm wf-py-xs wf-text-xs wf-text-brand">
                        {t.status === 'running' ? '⏳' : '✅'} {toolLabel(t.name)}
                      </span>
                    ))}
                  </div>
                )}

                {!beingEdited && (
                  <div>
                    <div class={`wf-bubble${own ? ' wf-bubble--own' : ''}${!own && msg.sender_type === 'ai' && st === 'complete' ? ' wf-bubble--ai' : ''}${isActive ? ' wf-dim' : ''}${isError ? '' : ''}`}
                      style={isError ? { borderColor: 'var(--wf-color-error)' } : undefined}>
                      {msg.content || ''}
                    </div>
                    {st === 'complete' && msg.usage && (
                      <div class="wf-text-right wf-mt-xs">
                        <Badge variant="default">⚡ {msg.usage.total_tokens} tokens</Badge>
                      </div>
                    )}
                    {isError && (
                      <Button size="sm" variant="ghost" class="wf-mt-xs" onClick={() => retryMessage(msg.id)}>🔄 重新生成</Button>
                    )}

                    {msg.ai_draft && msg.ai_approved === null && (
                      <div class="wf-mt-sm">
                        <Alert variant="warning">
                          <div class="wf-text-xs wf-text-semibold wf-mb-xs">⏳ AI 草稿待审批</div>
                          {msg.ai_draft}
                        </Alert>
                        <div class="wf-row wf-gap-xs wf-mt-xs">
                          <Button size="sm" disabled={$.approving === msg.id}
                            onClick={() => approveDraft(msg.id)}>{$.approving === msg.id ? '处理中...' : '✓ 批准'}</Button>
                          <Button size="sm" variant="danger" disabled={$.approving === msg.id}
                            onClick={() => rejectDraft(msg.id)}>✕ 拒绝</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {beingEdited && (
                  <form onSubmit={saveEdit} class="wf-row wf-gap-xs wf-top">
                    <div class="wf-fill">
                      <Input value={$.editValue} onInput={(e: any) => { $.editValue = e.target.value }} />
                    </div>
                    <Button type="submit" size="sm">✓</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>✕</Button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <form class="wf-row wf-gap-sm wf-p-sm wf-border-t" onSubmit={sendMessage}>
        <div class="wf-fill">
          <Input type="text" placeholder="输入消息，回车发送..."
            value={$.input} onInput={(e: any) => { $.input = e.target.value }}
            disabled={inputDisabled} />
        </div>
        <Button type="submit" variant="primary" disabled={!canSend}>➤</Button>
      </form>
    </div>
    )
  }
}
