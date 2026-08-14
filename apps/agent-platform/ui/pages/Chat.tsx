import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Ava } from '../components/ui'
import { Alert, Badge, Button, ChatInput, CopyButton, EmptyState, Icon, Input, Markdown, MessageBubble } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { track } from '../lib/track'
import type { Agent, Member, Message, MessageListResponse, MessageTool } from '../lib/types'

/** ChatInput 程序化控制（与 weifuwu/components ChatInputControl 同形） */
interface ChatInputControl {
  setKeyword: (v: string) => void
  setValue: (v: string) => void
}

/** 前端消息形态（后端字段 + 流式状态——宽松：WS 推送对象字段不全） */
interface ChatMessage {
  id: string
  department_id?: string
  sender_id: string
  sender_name?: string | null
  sender_type?: string
  content: string
  msg_type?: string
  created_at: string
  status: string
  tools: MessageTool[]
  usage?: { total_tokens: number }
  ai_draft?: string | null
  ai_approved?: boolean | null
  reply_content?: string | null
  reply_sender?: string | null
}

interface ChatState {
  msgs: ChatMessage[]
  deptName: string; memberCount: number; input: string; isAdmin: boolean
  editingId: string; editValue: string; userAgentId: string; sending: boolean
  bodyEl: HTMLElement | null; isUserScrolledUp: boolean
  unsubWs: (() => void) | null
  approving: string | null; copiedId: string; timeVersion: number
  hasMore: boolean; loadingMore: boolean; searchQ: string; searching: boolean
  replyTo: { id: string; sender: string; content: string } | null
  membersList: Member[]; atMenu: Member[]; atMenuOpen: boolean; atQuery: string
  streamTimer: ReturnType<typeof setInterval> | null
  expandedTool: string | null
}

export const Chat: Component = async (_props, ctx) => {
  const $ = {} as ChatState
  const rerender = () => ctx.ui.render()
  const deptId = ctx.route?.params?.id ?? ''

  $.msgs = []; $.deptName = '聊天'; $.memberCount = 0; $.input = ''; $.isAdmin = false
  $.editingId = ''; $.editValue = ''; $.userAgentId = ''; $.sending = false
  $.bodyEl = null; $.isUserScrolledUp = false; $.unsubWs = null
  $.approving = null; $.copiedId = ''; $.timeVersion = 0
  $.hasMore = false; $.loadingMore = false; $.searchQ = ''; $.searching = false
  $.replyTo = null
  $.membersList = []; $.atMenu = []; $.atMenuOpen = false; $.atQuery = ''
  $.expandedTool = null
  const chatControl = { current: null as ChatInputControl | null }

  async function loadMessages() {
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50`).catch(() => ({ messages: [] }))
    const list = msgRes.messages ?? []
    $.hasMore = list.length >= 50
    $.msgs = [...list].reverse().map((m: Message) => ({ ...m } as ChatMessage))
  }

  Promise.all([
    loadMessages(),
    ctx.api!.get(`/api/departments/${deptId}`).catch(() => ({})),
    ctx.api!.get('/api/agents?type=user').catch(() => ({ agents: [] })),
  ]).then(([, deptRes, agentRes]) => {
    const agents = agentRes.agents ?? []
    const user = ctx.auth?.user
    const mine = agents.find((a: Agent) => a.user_id === user?.id)
    if (mine) $.userAgentId = mine.id
    $.isAdmin = (ctx.auth as any)?.role === 'owner' || (ctx.auth as any)?.role === 'admin'
    $.deptName = deptRes?.department?.name ?? deptRes?.name ?? '聊天'
    $.memberCount = (deptRes?.members ?? []).length
    $.membersList = (deptRes?.members ?? []).filter((m: Member) => m.type === 'ai' || m.type === 'knowledge_base')
    rerender()
  }).catch(() => {})

  async function loadOlder() {
    if ($.loadingMore || !$.hasMore) return
    $.loadingMore = true; rerender()
    const oldest = $.msgs[0]
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50&before=${oldest?.id ?? ''}`).catch(() => ({ messages: [] }))
    const older = msgRes.messages ?? []
    if (older.length > 0) {
      $.msgs = [...older.reverse() as ChatMessage[], ...$.msgs]
      $.hasMore = older.length >= 50
    } else {
      $.hasMore = false
    }
    $.loadingMore = false
    rerender()
  }

  async function runSearch() {
    const q = $.searchQ.trim()
    $.searching = true; rerender()
    if (!q) {
      await loadMessages(); $.searching = false; rerender(); return
    }
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50&q=${encodeURIComponent(q)}`).catch(() => ({ messages: [] }))
    $.msgs = [...(msgRes.messages ?? [])].reverse().map((m: Message) => ({ ...m } as ChatMessage))
    $.hasMore = false
    $.searching = false
    rerender()
  }

  const unsub: (() => void) | undefined = ctx.ws?.onMessage((event: any) => {
    switch (event.type) {
      case 'new_message':
        if (!$.msgs.some((m: ChatMessage) => m.id === event.message.id)) {
          $.msgs.push({ id: event.message.id, sender_id: event.message.sender_id, sender_name: event.message.sender_name ?? '', sender_type: event.message.sender_type ?? 'user', content: event.message.content, msg_type: 'text', created_at: event.message.created_at ?? new Date().toISOString(), status: 'idle', tools: [] as MessageTool[] })
        }
        ; break
      case 'ai_draft':
        if (!$.msgs.some((m: ChatMessage) => m.id === event.message.id)) {
          $.msgs.push({ id: event.message.id, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'idle', tools: [] as MessageTool[], ai_draft: event.draft, ai_approved: null })
        }
        ; break
      case 'wf:step': {
        // 框架协议：stepType 'llm'（开始思考）/ 'tool'（工具调用）
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        if (event.stepType === 'llm') {
          if (idx === -1) {
            $.msgs.push({ id: event.messageId, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'thinking', tools: [] as MessageTool[] })
          } else if ($.msgs[idx].status !== 'complete' && $.msgs[idx].status !== 'error') {
            $.msgs[idx].status = 'thinking'
          }
        } else if (event.stepType === 'tool') {
          const m = $.msgs.find((m: ChatMessage) => m.id === event.messageId)
          if (m) {
            if (!m.tools) m.tools = []
            if (!m.tools.some((t: MessageTool) => t.name === event.name && t.status === 'running')) {
              m.tools.push({ name: event.name, args: event.args, status: 'running' })
            }
          }
        }
        ; break
      }
      case 'wf:token': {
        const m = $.msgs.find((m: ChatMessage) => m.id === event.messageId)
        if (m) { m.content += event.text; if (m.status !== 'complete') m.status = 'generating' }
        ; break
      }
      case 'wf:tool_result': {
        const m = $.msgs.find((m: ChatMessage) => m.id === event.messageId)
        if (m) {
          (m.tools ?? []).forEach((t: MessageTool) => { if (t.name === event.name && t.status === 'running') { t.status = 'done'; t.result = event.result } })
          if (m.status !== 'complete') m.status = 'thinking'
        }
        ; break
      }
      case 'wf:done': {
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        if (idx !== -1) {
          const m = $.msgs[idx]
          if (event.content) m.content = event.content
          m.status = 'complete'; if (event.usage) m.usage = event.usage
        }
        ; break
      }
      case 'wf:error': {
        const m = $.msgs.find((m: ChatMessage) => m.id === event.messageId)
        if (m) { if (!m.content) m.content = '⚠️ AI 回复失败'; m.status = 'error' }
        ; break
      }
      case 'message_edited': {
        const m = $.msgs.find((m: ChatMessage) => m.id === event.messageId)
        if (m) m.content = event.content; break
      }
      case 'message_deleted': {
        $.msgs = $.msgs.filter((m: ChatMessage) => m.id !== event.messageId); break
      }
    }
    rerender()
  })
  $.unsubWs = unsub ?? null

  ctx.ws?.send({ type: 'subscribe', room: deptId })

  const timer = setInterval(() => {
    $.timeVersion++
    let changed = false
    const now = Date.now()
    const updated = $.msgs.map((m: ChatMessage) => {
      if ((m.status === 'thinking' || m.status === 'generating') && m.created_at) {
        if (now - new Date(m.created_at).getTime() > 60000) {
          changed = true; return { ...m, status: 'complete' }
        }
      }
      return m
    })
    if (changed) { $.msgs = updated; rerender() }
  }, 30000)
  $.streamTimer = timer

  // 生命周期双保险：卸载清理定时器 + ws 退订（ref 卸载回调之外——组件层契约，不依赖 DOM）
  ctx.ui.onUnmount?.(() => {
    if ($.streamTimer) { clearInterval($.streamTimer); $.streamTimer = null }
    if ($.unsubWs) { try { $.unsubWs() } catch {}; $.unsubWs = null }
  })

  let prevLen = 0
  let prevContentLen = 0

  function scrollToBottom(force = false) {
    const body = $.bodyEl
    if (!body || ($.isUserScrolledUp && !force)) return
    requestAnimationFrame(() => { if ($.bodyEl) $.bodyEl.scrollTop = $.bodyEl.scrollHeight })
  }

  function isOwn(msg: ChatMessage) { return $.userAgentId && msg.sender_id === $.userAgentId }
  function canEdit(msg: ChatMessage) { return isOwn(msg) && Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000 }

  async function sendText(content: string) {
    const trimmed = content.trim()
    if (!trimmed || $.sending) return
    const saved = trimmed
    $.sending = true; $.input = ''
    $.atMenuOpen = false; $.atQuery = ''
    const replyId = $.replyTo?.id ?? null
    $.replyTo = null
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    try {
      const data = await ctx.api!.post(`/api/departments/${deptId}/messages`, { content: trimmed, reply_to: replyId }).catch(() => null)
      if (data) {
        track('first_message')
        if (data.message && !$.msgs.some((m: ChatMessage) => m.id === data.message.id)) {
          $.msgs.push({
            id: data.message.id,
            sender_id: data.message.sender_id ?? '',
            sender_name: data.message.sender_name ?? '我',
            sender_type: 'user',
            content: data.message.content ?? trimmed,
            msg_type: 'text',
            created_at: data.message.created_at ?? new Date().toISOString(),
            status: 'idle',
            tools: [] as MessageTool[],
          })
        }
      } else {
        $.input = saved; ctx.toast!('发送失败', 'error')
      }
    } catch { $.input = saved; ctx.toast!('网络错误', 'error') }
    finally { $.sending = false; rerender() }
  }

  async function retryMessage(fromMsgId: string) {
    const idx = $.msgs.findIndex((m: ChatMessage) => m.id === fromMsgId)
    if (idx <= 0) return
    const lastUser = $.msgs.slice(0, idx).filter((m: ChatMessage) => m.sender_type === 'user').pop()
    if (!lastUser) return
    $.msgs = $.msgs.filter((m: ChatMessage) => m.id !== fromMsgId)
    $.sending = true
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    await ctx.api!.post(`/api/departments/${deptId}/messages`, { content: lastUser.content }).catch(() => {})
    $.sending = false
    rerender()
  }

  function startEdit(msg: ChatMessage) { $.editingId = msg.id; $.editValue = msg.content; rerender() }
  function startReply(msg: ChatMessage) { $.replyTo = { id: msg.id, sender: msg.sender_name ?? '消息', content: msg.content }; rerender() }
  function cancelEdit() { $.editingId = ''; $.editValue = ''; rerender() }

  async function saveEdit(e: Event) {
    e.preventDefault()
    if (!$.editingId || !$.editValue.trim()) return
    await ctx.api!.put(`/api/messages/${$.editingId}`, { content: $.editValue }).then(() => cancelEdit()).catch(() => ctx.toast!('编辑失败', 'error'))
  }

  async function deleteMsg(msg: ChatMessage) {
    const mine = isOwn(msg)
    const ok = await ctx.confirm!(mine ? '确定撤回这条消息？' : '作为管理员删除这条消息？删除后不可恢复。')
    if (!ok) return
    await ctx.api!.delete(`/api/messages/${msg.id}`).then(() => { ctx.toast!(mine ? '消息已撤回' : '消息已删除', 'success'); rerender() }).catch(() => ctx.toast!('操作失败', 'error'))
  }

  async function approveDraft(msgId: string) {
    $.approving = msgId
    await ctx.api!.post(`/api/messages/${msgId}/approve`, { approved: true }).catch(() => {})
    $.approving = null
    rerender()
  }

  async function rejectDraft(msgId: string) {
    $.approving = msgId
    await ctx.api!.post(`/api/messages/${msgId}/approve`, { approved: false }).catch(() => {})
    $.approving = null
    rerender()
  }

  const chatBodyRef = (el: HTMLElement | null) => {
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

  /** 导出对话为 Markdown（复制到剪贴板 + 下载 .md 文件） */
  function exportChat() {
    if ($.msgs.length === 0) {
      ctx.toast?.('暂无消息可导出', 'info')
      return
    }
    const lines: string[] = [`# ${$.deptName} 对话记录`, '', `> 导出时间：${new Date().toLocaleString()} · ${$.memberCount} 位成员`, '']
    for (const msg of $.msgs) {
      if (msg.msg_type === 'system') {
        lines.push(`> [系统] ${msg.content}`, '')
        continue
      }
      const sender = msg.sender_name ?? '未知'
      const time = new Date(msg.created_at).toLocaleString()
      lines.push(`## ${sender} · ${time}`)
      if ((msg.tools ?? []).length > 0) {
        for (const t of msg.tools ?? []) lines.push(`- 🛠 ${toolLabel(t.name)}${t.status === 'error' ? '（失败）' : ''}`)
      }
      if (msg.content) lines.push('', msg.content, '')
      if (msg.usage?.total_tokens) lines.push(`_（${msg.usage.total_tokens} tokens）_`, '')
    }
    const text = lines.join('\n')
    void ctx.browser?.copyText?.(text)
    const filename = `${($.deptName ?? '对话').replace(/[^\w\u4e00-\u9fa5-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.md`
    ctx.browser?.downloadFile?.(filename, text, 'text/markdown')
    ctx.toast?.(`已复制并下载对话（${$.msgs.length} 条消息）`, 'success')
  }

  return async (props: {}) => {
    const msgsLen = $.msgs.length
    if (msgsLen > prevLen) { scrollToBottom(); prevLen = msgsLen }
    if (msgsLen > 0) {
      const totalLen = $.msgs.reduce((s: number, m: ChatMessage) => s + m.content.length, 0)
      if (totalLen > prevContentLen && prevContentLen > 0) { scrollToBottom() }
      prevContentLen = totalLen
    }

    const inputDisabled = $.editingId !== ''

  // @ 补全：输入末尾 @ 或 @前缀 时弹出成员浮层
  function onInputChange(v: string) {
    $.input = v; rerender()
    const atMatch = v.match(/@([\u4e00-\u9fa5\w]*)$/)
    if (atMatch) {
      $.atQuery = atMatch[1]
      $.atMenu = $.membersList.filter((m) => (m.type === 'ai' || m.type === 'knowledge_base') && (String(m.name).includes($.atQuery) || !$.atQuery))
      $.atMenuOpen = $.atMenu.length > 0
    } else {
      $.atMenuOpen = false; $.atQuery = ''
    }
    rerender()
  }
  function pickAtMember(m: Member) {
    // 替换末尾 @前缀 为完整 @名 + 空格（ChatInput 内部 keyword 程序化改写——不触发 onChange 避免 IME 打断）
    const v = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, `@${m.name} `)
    $.input = v
    chatControl.current?.setKeyword(v)
    $.atMenuOpen = false; $.atQuery = ''
    rerender()
  }


    return (
    <div class="wf-stack wf-h-full">
      <div class="wf-row wf-gap-sm wf-p-sm wf-bg-secondary wf-border-b">
        <a href="/chat/new" class="wf-text-brand"
          onClick={(e: Event) => { e.preventDefault(); ctx.app?.navigate('/chat/new') }}>
          <Icon name="arrow-left" size={16} />
        </a>
        <div class="wf-fill wf-stack wf-gap-none">
          <div class="wf-text-base wf-text-semibold">{$.deptName}</div>
          <div class="wf-text-xs wf-text-tertiary">{$.memberCount} 位成员</div>
        </div>
        {!ctx.ws?.isConnected && <Badge variant="error"><Icon name="warning" size={12} /> 连接断开</Badge>}
        <Button size="sm" variant="ghost" onClick={exportChat} title="导出对话为 Markdown"><Icon name="copy" size={14} /> 导出</Button>
        <Button size="sm" variant="ghost" class="wf-hidden wf-flex@sm" onClick={() => ctx.app?.navigate(`/departments/${deptId}`)}>部门详情</Button>
      </div>

      <div class="wf-fill wf-scroll wf-stack wf-gap-md wf-p-md"
        ref={chatBodyRef}
        onScroll={() => {
          if (!$.bodyEl) return
          const threshold = 80
          $.isUserScrolledUp = ($.bodyEl.scrollHeight - $.bodyEl.scrollTop - $.bodyEl.clientHeight) > threshold
          // 顶部接近时自动加载更早
          if ($.bodyEl.scrollTop < 40 && $.hasMore && !$.loadingMore) { loadOlder() }
        }}>
        <div class="wf-row wf-gap-sm">
          {$.hasMore && (
            <Button size="sm" variant="ghost" disabled={$.loadingMore} onClick={loadOlder}>
              {$.loadingMore ? '加载中...' : '↑ 加载更早消息'}
            </Button>
          )}
          {$.searchQ && <Badge variant="primary">搜索："{$.searchQ}" <a class="wf-text-brand wf-ml-xs" style="cursor:pointer" onClick={() => { $.searchQ = ''; runSearch() }}><Icon name="close" size={12} /> 清除</a></Badge>}
        </div>

        {$.msgs.length === 0 && (
          <EmptyState icon={<Icon name="message" />} text={$.searchQ ? '没有匹配的消息' : '暂无消息'} hint={$.searchQ ? '换个关键词试试' : '发送第一条消息，@ 的 AI 成员会自动回复'} />
        )}

        {$.msgs.map((msg: ChatMessage) => {
          const own = isOwn(msg)
          const beingEdited = $.editingId === msg.id
          const st = msg.status
          const isActive = st === 'thinking' || st === 'generating'
          const isError = st === 'error'
          const showTools = msg.sender_type === 'ai' && (msg.tools ?? []).length > 0

          if (msg.msg_type === 'system') return <div class="wf-center"><span class="wf-pill wf-bg-tertiary wf-text-secondary wf-px-sm wf-py-xs wf-text-xs">{msg.content}</span></div>

          return (
            <div data-msgid={String(msg.id).slice(0, 8)} data-msgtype={msg.msg_type} class={`wf-row wf-top wf-gap-sm${own ? ' wf-row-reverse' : ''}`}>
              <Ava name={msg.sender_name ?? '未知'} type={msg.sender_type ?? 'user'} small />
              <div class={`wf-stack wf-gap-xs wf-shrink${own ? ' wf-bottom' : ''}`}>
                <div class={`wf-row wf-gap-xs wf-text-xs wf-text-tertiary${own ? ' wf-row-reverse' : ''}`}>
                  <span>{msg.sender_name ?? '未知'}</span>
                  <span>{fmtTime(msg.created_at)}</span>
                  {isActive && <span class="wf-text-brand">{st === 'thinking' ? '思考中...' : '生成中...'}</span>}
                  {isError && <span class="wf-text-error">出错了</span>}
                  {!$.editingId && !isActive && (
                    <span class="wf-row wf-gap-xs">
                      <Button size="sm" variant="ghost" onClick={() => startReply(msg)}>回复</Button>
                      {canEdit(msg) && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(msg)}>编辑</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteMsg(msg)}>撤回</Button>
                        </>
                      )}
                      {!isOwn(msg) && $.isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => deleteMsg(msg)}>删除</Button>
                      )}
                    </span>
                  )}
                  {st === 'complete' && msg.sender_type === 'ai' && msg.content && (
                    <CopyButton size="sm" variant="ghost" value={msg.content} label="复制" />
                  )}
                </div>

                {msg.reply_content && !beingEdited && (
                  <div class="wf-border-l wf-pl-sm wf-text-xs wf-text-tertiary">
                    <span class="wf-text-secondary">↩ {msg.reply_sender ?? '消息'}</span> {String(msg.reply_content ?? '').slice(0, 40)}
                  </div>
                )}

                {showTools && (
                  <div class="wf-stack wf-gap-xs">
                    {(msg.tools ?? []).map((t: MessageTool, i: number) => {
                      const tk = `${msg.id}:${i}`
                      const expanded = $.expandedTool === tk
                      return (
                        <div key={i} class="wf-stack wf-gap-none">
                          <button type="button" class="wf-pill wf-bg-brand wf-px-sm wf-py-xs wf-text-xs wf-text-brand wf-text-left"
                            style="background: none; border: none; cursor: pointer"
                            onClick={() => { $.expandedTool = expanded ? null : tk; rerender() }}>
                            <Icon name={t.status === 'running' ? 'clock' : t.status === 'error' ? 'warning' : 'check'} size={12} /> {toolLabel(t.name)}
                            {expanded ? ' ▾' : ' ▸'}
                          </button>
                          {expanded && (
                            <div class="wf-stack wf-gap-xs wf-ml-xs wf-mt-xs wf-px-sm wf-py-sm wf-rounded wf-bg-tertiary">
                              {t.args !== undefined && t.args !== null && (
                                <div class="wf-text-xs">
                                  <span class="wf-text-tertiary">参数 </span>
                                  <pre class="wf-mt-none wf-text-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{JSON.stringify(t.args)}</pre>
                                </div>
                              )}
                              {t.result !== undefined && t.result !== null && (
                                <div class="wf-text-xs">
                                  <span class="wf-text-tertiary">结果 </span>
                                  <pre class="wf-mt-none wf-text-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{String(t.result).slice(0, 500)}</pre>
                                </div>
                              )}
                              {t.status === 'error' && <span class="wf-text-error wf-text-xs">执行失败</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!beingEdited && (
                  <div>
                    <MessageBubble
                      role={own ? 'user' : 'assistant'}
                      status={isActive ? 'streaming' : isError ? 'error' : 'complete'}
                      className={isActive ? 'wf-dim' : ''}
                      content={msg.sender_type === 'ai'
                        ? <Markdown content={msg.content || ''} />
                        : (msg.content || '')}
                    />
                    {st === 'complete' && msg.usage && (
                      <div class="wf-text-right wf-mt-xs">
                        <Badge variant="default"><Icon name="zap" size={12} /> {msg.usage.total_tokens} tokens</Badge>
                      </div>
                    )}
                    {isError && (
                      <Button size="sm" variant="ghost" class="wf-mt-xs" onClick={() => retryMessage(msg.id)}><Icon name="refresh" size={12} /> 重新生成</Button>
                    )}

                    {msg.ai_draft && msg.ai_approved === null && (
                      <div class="wf-mt-sm">
                        <Alert variant="warning">
                          <div class="wf-text-xs wf-text-semibold wf-mb-xs"><Icon name="clock" size={12} /> AI 草稿待审批</div>
                          {msg.ai_draft}
                        </Alert>
                        <div class="wf-row wf-gap-xs wf-mt-xs">
                          <Button size="sm" disabled={$.approving === msg.id}
                            onClick={() => approveDraft(msg.id)}>{$.approving === msg.id ? '处理中...' : (<><Icon name="check" size={12} /> 批准</>)}
                          </Button>
                          <Button size="sm" variant="danger" disabled={$.approving === msg.id}
                            onClick={() => rejectDraft(msg.id)}><Icon name="close" size={12} /> 拒绝</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {beingEdited && (
                  <form onSubmit={saveEdit} class="wf-row wf-gap-xs wf-top">
                    <div class="wf-fill">
                      <Input value={$.editValue} onInput={(e: Event) => { $.editValue = inputValue(e); rerender() }}
                        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') cancelEdit() }} />
                    </div>
                    <Button type="submit" size="sm"><Icon name="check" size={14} /></Button>
                    <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}><Icon name="close" size={14} /></Button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div class="wf-border-t wf-p-sm">
        {$.atMenuOpen && (
          <div class="wf-stack wf-gap-none wf-p-sm wf-rounded wf-surface wf-mb-sm wf-shadow" style="position: relative; z-index: 10">
            <div class="wf-text-xs wf-text-tertiary wf-px-sm wf-pb-xs">@ 选择成员</div>
            {$.atMenu.map((m: Member) => (
              <button type="button" key={m.id} class="wf-row wf-gap-sm wf-px-sm wf-py-xs wf-text-left" style="background: none; border: none; cursor: pointer; border-radius: 6px"
                onClick={() => pickAtMember(m)}>
                <Ava name={m.name} type={m.type ?? 'ai'} small />
                <span class="wf-text-base">{m.name}</span>
              </button>
            ))}
          </div>
        )}
        {$.replyTo && (
          <div class="wf-row wf-gap-sm wf-bg-tertiary wf-px-sm wf-py-xs wf-rounded wf-mb-sm">
            <Icon name="message" size={14} />
            <span class="wf-text-sm wf-text-secondary wf-truncate wf-fill">回复 {$.replyTo.sender}：{String($.replyTo.content).slice(0, 40)}</span>
            <Button size="sm" variant="ghost" onClick={() => { $.replyTo = null; rerender() }}><Icon name="close" size={12} /></Button>
          </div>
        )}
        <div class="wf-row wf-gap-sm">
          <div class="wf-fill">
            <ChatInput
              value={$.input}
              control={chatControl}
              onChange={(v) => onInputChange(v)}
              onSend={(text) => sendText(text)}
              disabled={inputDisabled}
              labels={{ placeholder: $.searchQ ? '搜索模式：输入新消息退出搜索' : '输入消息，回车发送；@ 可定向 AI' }}
            />
          </div>
        </div>
        <div class="wf-row wf-gap-sm wf-mt-sm">
          <div class="wf-fill">
            <Input placeholder="搜索消息..." value={$.searchQ} onInput={(e: Event) => { $.searchQ = inputValue(e); rerender() }} />
          </div>
          <Button size="sm" disabled={$.searching} onClick={runSearch}><Icon name="search" size={14} /> 搜索</Button>
        </div>
      </div>
    </div>
    )
  }
}
