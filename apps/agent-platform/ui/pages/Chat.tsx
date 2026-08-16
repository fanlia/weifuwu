import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Ava } from '../components/ui'
import { Badge, Button, ChatInput, EmptyState, Icon, Input } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import type { Agent, ChatMessage, Member, Message, MessageListResponse, MessageTool } from '../lib/types'
import { track } from '../lib/track'
import { MessageItem } from '../components/project/MessageItem.tsx'
import { FilesSection } from '../components/agent/FilesSection.tsx'
import { bumpFilesVersion, setAiWorking, aiStatus, notifyFilesReload } from '../lib/project-store.ts'

/** ChatInput 程序化控制（与 weifuwu/components ChatInputControl 同形） */
interface ChatInputControl {
  setKeyword: (v: string) => void
  setValue: (v: string) => void
}

interface ChatState {
  msgs: ChatMessage[]
  deptName: string; memberCount: number; input: string; isAdmin: boolean
  editingId: string; editValue: string; userAgentId: string; sending: boolean
  bodyEl: HTMLElement | null; isUserScrolledUp: boolean
  unsubWs: (() => void) | null
  approving: string | null; copiedId: string; timeVersion: number
  hasMore: boolean; loadingMore: boolean; searchQ: string; searching: boolean
  files: Array<{ name: string; data: string; size: number }>
  replyTo: { id: string; sender: string; content: string } | null
  membersList: Member[]; atMenu: Member[]; atMenuOpen: boolean; atQuery: string
  streamTimer: ReturnType<typeof setInterval> | null
  expandedTool: string | null
  /** P1 项目空间：环境状态（用户语言——聚合 API） */
  env: { status: string; label: string }
  /** 组织层级：下级部门（经理代表的部门——上级可见子部门交付物） */
  subDepts: Array<{ id: string; name: string; managerId: string; managerName: string; memberCount: number; files: Array<{ name: string; type: string; size: number; mtime: string }> }>
  /** 产物审批：聊天流内操作中标记 */
  reviewBusy: string
}

export const Chat: Component = async (_props, ctx) => {
  const $ = {} as ChatState
  const rerender = () => ctx.ui.render()
  // P1-3 附件：隐藏 file input + FileReader（无 npm 依赖）
  let fileInputEl: HTMLInputElement | null = null
  const fileInputRef = (el: any) => { fileInputEl = el }
  const pickFile = () => { fileInputEl?.click() }
  const onFilePick = (e: Event) => {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { ctx.toast!('文件过大（上限 20MB）', 'warning'); input.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result ?? '').split(',')[1] ?? ''
      $.files = [...$.files, { name: f.name, data, size: f.size }]
      rerender()
    }
    reader.readAsDataURL(f)
    input.value = ''
  }
  const deptId = ctx.route?.params?.id ?? ''
  // P2-1：AI 干活状态（aiStatus store 订阅——左栏呼吸灯；useExternal 返回 store 活引用）
  const aiStatusStore = ctx.ui.useExternal(aiStatus)
  const aiStatusOf = (id: string) => (aiStatusStore.state as Record<string, string>)[id] ?? 'idle'

  // 产物审批（2026-12）：聊天流内批准/拒绝（调 API + 通知 + 标记已处理）
  $.reviewBusy = ''
  const reviewArtifact = async (action: 'approve' | 'reject', path: string) => {
    if ($.reviewBusy) return
    $.reviewBusy = 'chat'; rerender()
    try {
      const r = await ctx.api!.post(`/api/departments/${deptId}/artifacts/${action}`, { path })
      if (r.success) {
        ctx.toast!(action === 'approve' ? `已发布 ${path}` : `已拒绝 ${path}`, 'success')
        const m = $.msgs.find((x: ChatMessage) => x.msg_type === 'file_card' && x.content === path)
        if (m) { m.pending = false; m.content = `${path}（已${action === 'approve' ? '发布' : '拒绝'}）` }
        bumpFilesVersion()
        notifyFilesReload()
      } else {
        ctx.toast!((r as any).error ?? '操作失败', 'error')
      }
    } catch { ctx.toast!('操作失败', 'error') }
    $.reviewBusy = ''; rerender()
  }

  // 组织层级：重拉聚合 API（file_updated 时子部门交付物列表实时化）
  let reloadingWs = false
  const reloadWorkspace = async () => {
    if (reloadingWs) return
    reloadingWs = true
    try {
      const wsRes = await ctx.api!.get(`/api/departments/${deptId}/workspace`).catch(() => null)
      if (wsRes) {
        $.subDepts = wsRes.subDepartments ?? []
        if (wsRes.env) $.env = wsRes.env
        rerender()
      }
    } finally { reloadingWs = false }
  }

  $.msgs = []; $.deptName = '聊天'; $.memberCount = 0; $.input = ''; $.isAdmin = false
  $.files = []
  $.editingId = ''; $.editValue = ''; $.userAgentId = ''; $.sending = false
  $.bodyEl = null; $.isUserScrolledUp = false; $.unsubWs = null
  $.approving = null; $.copiedId = ''; $.timeVersion = 0
  $.hasMore = false; $.loadingMore = false; $.searchQ = ''; $.searching = false
  $.replyTo = null
  $.membersList = []; $.atMenu = []; $.atMenuOpen = false; $.atQuery = ''
  $.expandedTool = null
  $.env = { status: 'none', label: '' }
  $.subDepts = []
  const chatControl = { current: null as ChatInputControl | null }

  // ChatInput labels（引用稳定——剪枝命中不重建；placeholder 内容在搜索状态切换点更新）
  const CHAT_INPUT_LABELS = { placeholder: '输入消息，回车发送；@ 可定向 AI' }
  const setSearchQ = (q: string) => {
    $.searchQ = q
    CHAT_INPUT_LABELS.placeholder = q ? '搜索模式：输入新消息退出搜索' : '输入消息，回车发送；@ 可定向 AI'
  }

  // ── 稳定回调（mount 层定义——render 期传同一引用：MessageItem/ChatInput 的 props
  //    回调不变 → componentPropsEqual 成立 → 剪枝命中 → 不重建。内联箭头每次渲染
  //    新函数 → 全量重建（实测 MessageItem 28 次构建/4 次渲染）） ──
  const handleToggleTool = (tk: string) => { $.expandedTool = $.expandedTool === tk ? null : tk; rerender() }
  const handleReply = (m: ChatMessage) => startReply(m)
  const handleEdit = (m: ChatMessage) => startEdit(m)
  const handleDelete = (m: ChatMessage) => deleteMsg(m)
  const handleFeedback = (m: ChatMessage, v: 'like' | 'dislike' | null) => feedbackMsg(m, v)
  const handleApprove = (id: string) => approveDraft(id)
  const handleReject = (id: string) => rejectDraft(id)
  const handleRetry = (id: string) => retryMessage(id)
  const handleContinue = (id: string) => continueMessage(id)
  const handleReview = (action: 'approve' | 'reject', path: string) => reviewArtifact(action, path)
  const handleEditChange = (v: string) => { $.editValue = v; rerender() }
  const handleEditSave = () => saveEdit()
  const handleEditCancel = () => cancelEdit()

  // @ 补全（mount 层——只依赖 mount 闭包 $/rerender/chatControl/membersList）
  function onInputChange(v: string) {
    $.input = v; rerender()
    const atMatch = v.match(/@([\u4e00-\u9fa5\w]*)$/)
    if (atMatch) {
      $.atQuery = atMatch[1]
      $.atMenu = $.membersList.filter((m) => (m.type === 'ai' || m.type === 'knowledge_base' || m.type === 'department') && (String(m.name).includes($.atQuery) || !$.atQuery))
      // 始终显示 @ 菜单（@所有人 始终可选——无成员也出现——否则 @ 输入无反馈：
      // 真实 bug——成员 0 的部门 @ 输入无任何反应（atMenuOpen = atMenu.length > 0）
      $.atMenuOpen = true
    } else {
      $.atMenuOpen = false; $.atQuery = ''
    }
    rerender()
  }
  // 稳定引用（render 期传同一引用——ChatInput/Input props 不变 → 剪枝命中不重建）
  const handleSend = (text: string) => sendText(text)
  const onSearchInput = (e: Event) => { $.searchQ = inputValue(e); rerender() }
  function pickAtMember(m: Member) {
    // 替换末尾 @前缀 为完整 @名 + 空格（ChatInput 内部 keyword 程序化改写——不触发 onChange 避免 IME 打断）
    const v = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, `@${m.name} `)
    $.input = v
    chatControl.current?.setKeyword(v)
    $.atMenuOpen = false; $.atQuery = ''
    rerender()
  }

  async function loadMessages() {
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50`).catch(() => ({ messages: [] }))
    const list = msgRes.messages ?? []
    $.hasMore = list.length >= 50
    $.msgs = [...list].reverse().map((m: Message) => ({ ...m } as ChatMessage))
  }

  Promise.all([
    loadMessages(),
    // P1：聚合 API（部门+成员+环境状态一次拿）
    ctx.api!.get(`/api/departments/${deptId}/workspace`).catch(() => ({})),
    ctx.api!.get('/api/agents?type=user').catch(() => ({ agents: [] })),
  ]).then(([, wsRes, agentRes]) => {
    const agents = agentRes.agents ?? []
    const user = ctx.auth?.user
    const mine = agents.find((a: Agent) => a.user_id === user?.id)
    if (mine) $.userAgentId = mine.id
    $.isAdmin = (ctx.auth as any)?.role === 'owner' || (ctx.auth as any)?.role === 'admin'
    $.deptName = wsRes?.department?.name ?? '聊天'
    $.memberCount = (wsRes?.members ?? []).length
    $.membersList = (wsRes?.members ?? []).filter((m: Member) => m.type === 'ai' || m.type === 'knowledge_base' || m.type === 'department')
    $.env = wsRes?.env ?? { status: 'none', label: '' }
    $.subDepts = wsRes?.subDepartments ?? []
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
    setSearchQ(q) // 搜索状态切换 → labels placeholder 更新（引用不变——剪枝仍命中）
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
        // P2-1：AI 干活中状态（左栏呼吸灯）
        setAiWorking(event.agentId, true)
        if (event.stepType === 'llm') {
          if (idx === -1) {
            $.msgs.push({ id: event.messageId, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'thinking', tools: [] as MessageTool[] })
          } else if ($.msgs[idx].status !== 'complete' && $.msgs[idx].status !== 'error') {
            // 新建对象（引用变——vdom3 props 剪枝浅比较不命中——重渲染——
            // 否则原地改引用同 → 剪枝 → 状态/内容不更新（流式空 bubble 真实 bug））
            $.msgs[idx] = { ...$.msgs[idx], status: 'thinking' }
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
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        ;(window as any).__chatDbg = (window as any).__chatDbg ?? []
        ;(window as any).__chatDbg.push(`token msgId=${event.messageId} idx=${idx}`)
        if (idx !== -1) {
          const m = $.msgs[idx]
          // 新建对象（引用变——vdom3 剪枝不命中——流式 token 逐字渲染）
          $.msgs[idx] = { ...m, content: m.content + event.text, status: m.status !== 'complete' ? 'generating' : m.status }
        }
        ; break
      }
      case 'wf:tool_result': {
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        if (idx !== -1) {
          const m = $.msgs[idx]
          const tools = (m.tools ?? []).map((t: MessageTool) => t.name === event.name && t.status === 'running' ? { ...t, status: 'done' as const, result: event.result } : t)
          $.msgs[idx] = { ...m, tools, status: m.status !== 'complete' ? 'thinking' : m.status }
        }
        ; break
      }
      case 'wf:done': {
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        ;(window as any).__chatDbg = (window as any).__chatDbg ?? []
        ;(window as any).__chatDbg.push(`done msgId=${event.messageId} idx=${idx} msgs=${$.msgs.length}`)
        if (idx !== -1) {
          const m = $.msgs[idx]
          $.msgs[idx] = { ...m, content: event.content ?? m.content, status: 'complete', usage: event.usage ?? m.usage }
        }
        // P2-1：AI 干活结束（呼吸灯复位）
        setAiWorking(event.agentId, false)
        ; break
      }
      case 'wf:error': {
        const idx = $.msgs.findIndex((m: ChatMessage) => m.id === event.messageId)
        if (idx !== -1) {
          const m = $.msgs[idx]
          $.msgs[idx] = { ...m, content: m.content || '⚠️ AI 回复失败', status: 'error' }
        }
        setAiWorking(event.agentId, false)
        ; break
      }
      case 'file_updated': {
        // P1-3：AI 写入/编辑文件 → 交付物自动刷新（FilesSection 订阅 filesVersion）
        bumpFilesVersion()
        // 文件列表刷新（注册表——FilesSection 挂载时注册，事件直接驱动）
        notifyFilesReload()
        // 组织层级：子部门交付物列表实时化（重拉聚合 API——env/subDepts 更新）
        void reloadWorkspace()
        // P2-4：聊天流内「AI 刚生成了 X」文件卡片（可点击下载）
        const f = String(event.file ?? '')
        const fname = f.split('/').pop() ?? f
        const isNew = !$.msgs.some((m: ChatMessage) => m.msg_type === 'file_card' && m.content === fname)
        if (f && isNew) {
          $.msgs.push({
            id: `file-${f}-${Date.now()}`, sender_id: event.agentId ?? 'ai', sender_name: event.agentName ?? 'AI',
            sender_type: 'ai', content: fname, msg_type: 'file_card', created_at: new Date().toISOString(), status: 'idle', tools: [],
            pending: !!event.pending,
          })
          scrollToBottom()
        }
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
          // B.2 超时可见化：明确"超时"态（非静默 complete）——内容空则失败态——
          // 超时 = 服务端异常线索（wf:done 未达）——不再静默假装完成
          changed = true
          if (!m.content) console.warn(`[chat] AI 回复超时（${m.sender_name ?? 'AI'}——60s 无完成）——服务端可能异常`)
          return { ...m, status: m.content ? 'complete' : 'error' }
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

  function isOwn(msg: ChatMessage) { return !!( $.userAgentId && msg.sender_id === $.userAgentId) }
  function canEdit(msg: ChatMessage) { return isOwn(msg) && Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000 }

  async function sendText(content: string) {
    const trimmed = content.trim()
    const hasFiles = $.files.length > 0
    if ((!trimmed && !hasFiles) || $.sending) return
    const saved = trimmed
    const savedFiles = $.files
    $.sending = true; $.input = ''; $.files = []
    $.atMenuOpen = false; $.atQuery = ''
    const replyId = $.replyTo?.id ?? null
    $.replyTo = null
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    try {
      const data = await ctx.api!.post(`/api/departments/${deptId}/messages`, {
        content: trimmed,
        reply_to: replyId,
        attachments: savedFiles.map((f) => ({ name: f.name, data: f.data, size: f.size })),
      }).catch(() => null)
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
            attachments: data.message.attachments ?? null,
          })
        }
      } else {
        $.input = saved; ctx.toast!('发送失败', 'error')
      }
    } catch { $.input = saved; ctx.toast!('网络错误', 'error') }
    finally { $.sending = false; rerender() }
  }

  async function continueMessage(fromMsgId: string) {
    // C1 断点续跑：从中断处继续（后端注入已执行步骤，不重做）
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    try {
      const d = await ctx.api!.post(`/api/messages/${fromMsgId}/continue`).catch(() => null)
      if (d?.resumed) ctx.toast!(`继续执行（已 ${d.doneSteps}/${d.totalSteps} 步）`, 'info')
      else ctx.toast!('无断点——从头执行', 'info')
    } catch { ctx.toast!('续跑失败', 'error') }
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

  async function saveEdit() {
    if (!$.editingId || !$.editValue.trim()) return
    await ctx.api!.put(`/api/messages/${$.editingId}`, { content: $.editValue }).then(() => cancelEdit()).catch(() => ctx.toast!('编辑失败', 'error'))
  }

  async function feedbackMsg(msg: any, fb: 'like' | 'dislike' | null) {
    try {
      await ctx.api!.post(`/api/messages/${msg.id}/feedback`, { feedback: fb })
      msg.feedback = fb
      ctx.ui.render()
    } catch { /* 反馈失败静默 */ }
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

    return (
    <div class="wf-row wf-h-full wf-gap-none">
      {/* 左栏：成员与 AI 状态（P1 项目空间——窄屏隐藏） */}
      <aside class="wf-col wf-hidden wf-flex@lg wf-w-56 wf-bg-secondary wf-border-r wf-p-sm wf-stack wf-gap-sm" style="width: 220px; min-width: 220px">
        <div class="wf-text-xs wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">成员（{$.memberCount}）</div>
        {$.membersList.length === 0 && <div class="wf-text-xs wf-text-tertiary">暂无 AI 成员——聊天中 @ 不到人时去「管理 → Agent」添加</div>}
        {$.membersList.map((m: Member) => (
          <div key={m.id} class="wf-row wf-gap-sm wf-items-center wf-py-xs">
            {/* P2-1：AI 干活中呼吸灯（wf:step/wf:done 驱动 aiStatus store） */}
            <div class="wf-relative">
              <Ava name={m.name} type={m.type ?? 'ai'} small />
              {m.type !== 'knowledge_base' && (
                <span class="wf-dot" style={`position:absolute;right:-2px;bottom:-2px;width:8px;height:8px;border-radius:50%;background:${aiStatusOf(m.id) === 'working' ? 'var(--wf-color-brand)' : 'var(--wf-color-success)'};border:1px solid var(--wf-color-surface);${aiStatusOf(m.id) === 'working' ? 'animation:wf-breathe 1.2s ease-in-out infinite' : ''}`} />
              )}
            </div>
            <div class="wf-fill wf-stack wf-gap-none wf-min-w-0">
              <span class="wf-text-sm wf-text-medium wf-truncate">{m.name}</span>
              <span class="wf-text-xs wf-text-tertiary wf-truncate">
                {m.type === 'department'
                  ? `代表 ${$.subDepts.find(sd => sd.managerId === m.id)?.name ?? '本部门'}`
                  : aiStatusOf(m.id) === 'working' ? '干活中…' : (m.role_label || '空闲')}
              </span>
            </div>
            {m.type === 'knowledge_base' && <span class="wf-text-xs wf-text-tertiary">KB</span>}
          </div>
        ))}
        {$.membersList.length > 0 && (
          <a class="wf-text-xs wf-text-brand wf-mt-xs" style="cursor:pointer"
            onClick={() => ctx.app?.navigate('/departments/' + deptId)}>＋ 添加 AI 能力</a>
        )}
        <div class="wf-border-t wf-pt-sm wf-mt-sm">
          <div class="wf-text-xs wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">工作环境</div>
          {$.env.label ? (
            <div class="wf-text-xs wf-text-tertiary wf-mt-xs">{$.env.label}</div>
          ) : (
            <div class="wf-text-xs wf-text-tertiary wf-mt-xs">首次干活时自动创建</div>
          )}
        </div>
      </aside>

      {/* 中栏：聊天流 */}
      <main class="wf-col wf-fill wf-stack wf-h-full wf-min-w-0">
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
        {/* P1：环境状态用户语言（头部可见——颜色语义：ready 绿/error 红/其他灰） */}
        {$.env.label && (
          <Badge variant={$.env.status === 'error' ? 'error' : $.env.status === 'ready' ? 'success' : 'default'}>{$.env.label}</Badge>
        )}
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
          {$.searchQ && <Badge variant="primary">搜索："{$.searchQ}" <a class="wf-text-brand wf-ml-xs" style="cursor:pointer" onClick={() => { setSearchQ(''); runSearch() }}><Icon name="close" size={12} /> 清除</a></Badge>}
        </div>

        {$.msgs.length === 0 && (
          <EmptyState icon={<Icon name="message" />} text={$.searchQ ? '没有匹配的消息' : '暂无消息'} hint={$.searchQ ? '换个关键词试试' : '三步开始：上传资料到右侧交付物 → 发送消息 @AI 成员 → 交付物里拿成果'} />
        )}

        {$.msgs.map((msg: ChatMessage) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            departmentId={deptId}
            own={isOwn(msg)}
            canEditMsg={canEdit(msg)}
            isAdmin={$.isAdmin}
            approving={$.approving === msg.id}
            editing={$.editingId === msg.id}
            editValue={$.editValue}
            expandedToolKey={$.expandedTool}
            onToggleTool={handleToggleTool}
            onReply={handleReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onFeedback={handleFeedback}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            onContinue={handleContinue}
            onReview={handleReview}
            reviewBusy={$.reviewBusy === 'chat'}
            onEditChange={handleEditChange}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
          />
        ))}
      </div>

      <div class="wf-border-t wf-p-sm">
        {$.atMenuOpen && (
          <div class="wf-stack wf-gap-none wf-p-sm wf-rounded wf-surface wf-mb-sm wf-shadow" style="position: relative; z-index: 10">
            <div class="wf-text-xs wf-text-tertiary wf-px-sm wf-pb-xs">@ 选择成员（可多选——@all 全员）</div>
            <button type="button" class="wf-row wf-gap-sm wf-px-sm wf-py-xs wf-text-left" style="background: none; border: none; cursor: pointer; border-radius: 6px; color: var(--wf-color-brand)"
              onClick={() => { $.input = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, '@all '); $.atMenuOpen = false; rerender() }}>
              <span class="wf-text-base">@所有人（全部 AI）</span>
            </button>
            {$.atMenu.length === 0 && (
              <div class="wf-text-xs wf-text-tertiary wf-px-sm wf-py-xs">暂无其他成员可选——可 @所有人 或去「管理 → Agent」添加</div>
            )}
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
        {$.files.length > 0 && (
          <div class="wf-row wf-gap-sm wf-mb-sm">
            {$.files.map((f, i) => (
              <span key={i} class="wf-bg-tertiary wf-rounded wf-px-sm wf-py-xs wf-text-xs wf-row wf-gap-xs">
                📎 {f.name}（{f.size >= 1024 ? Math.round(f.size / 1024) + 'KB' : f.size + 'B'}）
                <button class="wf-no-bg wf-no-border wf-cursor wf-text-tertiary" onClick={() => { $.files = $.files.filter((_, j) => j !== i); rerender() }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div class="wf-row wf-gap-sm">
          <div class="wf-fill">
            <ChatInput
              value={$.input}
              control={chatControl}
              onChange={onInputChange}
              onSend={handleSend}
              disabled={inputDisabled}
              labels={CHAT_INPUT_LABELS}
            />
          </div>
          <Button variant="ghost" onClick={pickFile} title="上传附件（csv/xlsx/pdf/docx/pptx/txt/md/json/log/png/jpg，≤20MB）"><Icon name="paperclip" size={15} /></Button>
          <input ref={fileInputRef} type="file" hidden onChange={(e: Event) => { onFilePick(e as Event) }} />
        </div>
        <div class="wf-row wf-gap-sm wf-mt-sm">
          <div class="wf-fill">
            <Input placeholder="搜索消息..." value={$.searchQ} onInput={onSearchInput} />
          </div>
          <Button size="sm" disabled={$.searching} onClick={runSearch}><Icon name="search" size={14} /> 搜索</Button>
        </div>
      </div>
      </div>
      </main>

      {/* 右栏：交付物（P1 项目空间——共享工作目录；窄屏隐藏） */}
      <aside class="wf-col wf-hidden wf-flex@lg wf-p-sm wf-border-l wf-scroll" style="width: 300px; min-width: 300px">
        <div class="wf-text-xs wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm">交付物（共享目录）</div>
        <FilesSection departmentId={deptId} />

        {/* 组织层级：下级部门交付物（只读可见——上级看下属成果） */}
        {$.subDepts.length > 0 && (
          <div class="wf-mt-md">
            <div class="wf-text-xs wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-xs">下级部门（{$.subDepts.length}）</div>
            {$.subDepts.map((sd) => (
              <div key={sd.id} class="wf-bg-tertiary wf-rounded wf-p-sm wf-mb-sm">
                <div class="wf-row wf-gap-xs wf-items-center wf-mb-xs">
                  <Icon name="users" size={12} />
                  <span class="wf-text-sm wf-text-medium wf-truncate">{sd.name}</span>
                  <span class="wf-text-xs wf-text-tertiary">{sd.memberCount} 人</span>
                </div>
                <div class="wf-text-xs wf-text-tertiary wf-mb-xs">经理：{sd.managerName}</div>
                {sd.files.length === 0 ? (
                  <div class="wf-text-xs wf-text-tertiary">暂无交付物</div>
                ) : (
                  <div class="wf-stack wf-gap-none">
                    {sd.files.map((f) => (
                      <div key={f.name} class="wf-row wf-gap-xs wf-py-xs wf-items-center">
                        <Icon name={f.type === 'dir' ? 'folder' : 'file-text'} size={12} />
                        <span class="wf-text-xs wf-text-medium wf-truncate wf-fill">{f.name}{f.type === 'dir' ? '/' : ''}</span>
                        <span class="wf-text-xs wf-text-tertiary wf-nums">{f.type === 'file' && f.size > 1024 ? (f.size / 1024).toFixed(1) + 'KB' : f.size + 'B'}</span>
                        {f.type === 'file' && (
                          <a class="wf-text-brand" title="下载（子部门交付物）"
                            href={`/api/departments/${sd.id}/workspace/file?path=${encodeURIComponent(f.name)}&download=1`}>
                            <Icon name="arrow-down" size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
    )
  }
}
