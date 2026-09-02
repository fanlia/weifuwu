import type { UIContext, Component } from 'weifuwu/vdom'
import { Ava, errMsg } from '../components/ui'
import { BackTop, Badge, Button, ChatInput, EmptyState, Icon, Input } from 'weifuwu/components'
import { inputValue } from '../lib/types'

/** 部门工作区聚合响应（/api/departments/:id/workspace——一次拿部门+成员+环境） */
interface WsWorkspaceResponse {
  department?: { id: string; name: string } | null
  env?: { status: string; label: string } | null
  members?: Member[]
  // 主部门工作区文件（2026-08——首帧无延迟显示：聚合 API 已含——FilesSection
  // 用 initialFiles 直接首帧渲染——消除二次请求延迟）
  files?: Array<{ name: string; type: string; size: number; mtime: string }>
  subDepartments?: Array<{ id: string; name: string; managerId: string; managerName: string; memberCount: number; files: Array<{ name: string; type: string; size: number; mtime: string }> }>
}
import type { Agent, ChatMessage, Member, Message, MessageListResponse, MessageTool } from '../lib/types'
import { applyWfEvent } from '../lib/wf-events.ts'
import { canWrite, writeDenyReason } from '../lib/roles'

/** B1（2026-08）：ai_step → MessageTool[]（刷新后工具条恢复）——
 * 步骤存 msg_type 工具步骤——转换 { tool, ok, result } → { name, status, result } */
function parseStoredTools(aiStep: unknown): MessageTool[] {
  try {
    const parsed = typeof aiStep === 'string' ? JSON.parse(aiStep) : aiStep
    const steps = parsed?.steps
    if (!Array.isArray(steps)) return []
    const out: MessageTool[] = []
    for (const s of steps) {
      // 框架步骤：{ type: 'tool_call', toolCall } / { type: 'tool_result', toolCall, toolResult }
      // 应用层步骤：{ tool, args, ok, result, at }
      if (s?.type === 'tool_call') {
        out.push({ name: s.toolCall?.name ?? 'tool', args: s.toolCall?.arguments, status: 'running' })
      } else if (s?.type === 'tool_result') {
        const prev = out[out.length - 1]
        const isErr = String(s.toolResult ?? '').startsWith('Error:')
        if (prev) prev.status = isErr ? 'error' : 'done'
        prev.result = isErr ? s.toolResult : s.toolResult
      } else if (s?.tool && typeof s.tool === 'string') {
        out.push({
          name: s.tool,
          args: s.args,
          status: s.ok === false ? 'error' : 'done',
          result: s.result,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

import { track } from '../lib/track'
import { MessageItem } from '../components/project/MessageItem.tsx'
import { FilesSection } from '../components/agent/FilesSection.tsx'
import { bumpFilesVersion, setAiWorking, aiStatus, notifyFilesReload } from '../lib/project-store.ts'

/** ChatInput 程序化控制（与 weifuwu/components ChatInputControl 同形） */
interface ChatInputControl {
  setKeyword: (v: string) => void
  setValue: (v: string) => void
}

/** B-下载（2026-08）：子部门交付物带鉴权下载（<a href> 无 Bearer → 401 实证） */
async function downloadSubFile(deptId: string, name: string): Promise<void> {
  const { downloadFileAuthorized, authorizedGet } = await import('../lib/download.ts')
  await downloadFileAuthorized(
    `/api/departments/${deptId}/workspace/file?path=${encodeURIComponent(name)}&download=1`,
    name,
  )
}

interface ChatState {
  msgs: ChatMessage[]
  deptName: string; memberCount: number; input: string; isAdmin: boolean
  editingId: string; editValue: string; userAgentId: string; sending: boolean
  bodyEl: HTMLElement | null; isUserScrolledUp: boolean
  unsubWs: (() => void) | null
  approving: string | null; copiedId: string
  hasMore: boolean; loadingMore: boolean; searchQ: string; searching: boolean; searchOpen: boolean
  files: Array<{ name: string; data: string; size: number }>
  replyTo: { id: string; sender: string; content: string } | null
  membersList: Member[]; atMenu: Member[]; atMenuOpen: boolean; atQuery: string
  /** @ 菜单键盘导航高亮（2026-08——↑↓ 选择：0=@all，1..=成员；-1=无） */
  atMenuIndex: number
  /** CHAT-INTERACTION 波次 1：部门不存在/无权（404）——显式错误态而非静默空态 */
  deptMissing: boolean
  streamTimer: ReturnType<typeof setInterval> | null
  expandedTool: string | null
  /** P1 项目空间：环境状态（用户语言——聚合 API） */
  env: { status: string; label: string }
  /** 组织层级：下级部门（经理代表的部门——上级可见子部门交付物） */
  subDepts: Array<{ id: string; name: string; managerId: string; managerName: string; memberCount: number; files: Array<{ name: string; type: string; size: number; mtime: string }> }>
  /** 工作区文件（2026-08——聚合 API 首帧带——FilesSection initial 零延迟） */
  wsFiles: Array<{ name: string; type: string; size: number; mtime: string }>
  /** 产物审批：聊天流内操作中标记 */
  reviewBusy: string
  /** ChatInput labels（placeholder 随搜索态切换——切换时新建对象：props 不可变契约） */
  chatLabels: { placeholder: string }
}

export const Chat: Component = (_props, ctx) => {
  const $ = {} as ChatState
  const rerender = () => ctx.render()
  // P1-3 附件：隐藏 file input + FileReader（无 npm 依赖）
  let fileInputEl: HTMLInputElement | null = null
  const fileInputRef = (el: any) => { fileInputEl = el }
  const pickFile = () => { fileInputEl?.click() }
  /** **文件入列（2027-09——拖拽上传与按钮共享链）**：大小校验 → FileReader
   *  → $.files 累积 → 渲染（发送时随消息上传）——拖拽与 input 选择同一
   *  消费面（无第二套逻辑——拖拽坏如按钮坏） */
  const addFiles = (files: File[]) => {
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) { ctx.toast!(`「${f.name}」过大（上限 20MB）`, 'warning'); continue }
      const reader = new FileReader()
      reader.onload = () => {
        const data = String(reader.result ?? '').split(',')[1] ?? ''
        $.files = [...$.files, { name: f.name, data, size: f.size }]
        rerender()
      }
      reader.readAsDataURL(f)
    }
  }
  const onFilePick = (e: Event) => {
    const input = e.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    addFiles(files)
    input.value = ''
  }
  const deptId = ctx.route?.params?.id ?? ''
  // ── 移动端左栏抽屉（UX-PLAN-2 波次 3：左栏 <1024px 隐藏后无入口实证——
  // 头部提供「成员/环境/交付物」抽屉入口——聊天流仍默认）──
  let panelOpen = false
  const closePanel = () => { if (panelOpen) { panelOpen = false; rerender() } }
  ctx.ui.useGlobalKey('Escape', () => closePanel())
  // CHAT-UX 波次 2（L2）：窄屏判定（空态指路文案按视口切换——移动端面板默认隐藏）
  const bp = ctx.ui.useBreakpoint({ mobile: 0, desktop: 768 })
  // P2-1：AI 干活状态（aiStatus store 订阅——左栏呼吸灯；useExternal 返回 store 活引用）
  const aiStatusStore = ctx.ui.useExternal(aiStatus)
  const aiStatusOf = (id: string) => (aiStatusStore() as Record<string, string>)[id] ?? 'idle'

  // 产物审批（2026-12）：聊天流内批准/拒绝（调 API + 通知 + 标记已处理）
  $.reviewBusy = ''
  const reviewArtifact = async (action: 'approve' | 'reject', path: string) => {
    if ($.reviewBusy) return
    $.reviewBusy = 'chat'; rerender()
    try {
      const r = await ctx.api!.post<{ success: boolean; error?: string }>(`/api/departments/${deptId}/artifacts/${action}`, { path })
      if (r.success) {
        ctx.toast!(action === 'approve' ? `已发布 ${path}` : `已拒绝 ${path}`, 'success')
        // props 不可变契约：新建对象（原地改 msg → vdom3 audit + MessageItem 剪枝不更新审批态）
        $.msgs = $.msgs.map((x: ChatMessage) => x.msg_type === 'file_card' && x.content === path
          ? { ...x, pending: false, content: `${path}（已${action === 'approve' ? '发布' : '拒绝'}）` }
          : x)
        bumpFilesVersion()
        notifyFilesReload()
      } else {
        ctx.toast!(r.error ?? '操作失败', 'error')
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
      const wsRes = await ctx.api!.get<WsWorkspaceResponse>(`/api/departments/${deptId}/workspace`).catch(() => null)
      if (wsRes) {
        $.subDepts = wsRes.subDepartments ?? []
        if (wsRes.env) $.env = wsRes.env
        rerender()
      }
    } finally { reloadingWs = false }
  }

  $.msgs = []; $.deptName = '聊天'; $.memberCount = 0; $.input = ''; $.isAdmin = false
  // CHAT-UX 波次 4（E2）：恢复草稿（按部门 key——切回会话不丢已输入内容）
  try { $.input = sessionStorage.getItem(`wf-draft-${deptId}`) ?? '' } catch { /* 隐私模式忽略 */ }
  $.files = []
  $.editingId = ''; $.editValue = ''; $.userAgentId = ''; $.sending = false
  $.bodyEl = null; $.isUserScrolledUp = false; $.unsubWs = null
  $.approving = null; $.copiedId = ''
  $.hasMore = false; $.loadingMore = false; $.searchQ = ''; $.searching = false; $.searchOpen = false
  $.deptMissing = false
  $.replyTo = null
  $.membersList = []; $.atMenu = []; $.atMenuOpen = false; $.atQuery = ''
  $.atMenuIndex = -1
  $.wsFiles = []
  $.expandedTool = null
  $.env = { status: 'none', label: '' }
  $.subDepts = []
  $.chatLabels = { placeholder: '输入消息，回车发送；@ 可定向 AI' }
  const chatControl = { current: null as ChatInputControl | null }
  let draftRestored = false
  // onControl：mount 层稳定回调（ChatInput 回调上抛 handle——props 不可变契约：
  // 旧 control={{ current }} out-param 被 ChatInput 原地写 → vdom3 audit + 剪枝噪音）
  const onControl = (h: ChatInputControl) => {
    chatControl.current = h
    // CHAT-UX 波次 4（E2）：mount 后恢复草稿——ChatInput 首渲染读内部 keyword
    // （value prop 不回流 DOM——§5.3 受控纪律），编程恢复必须走 setKeyword
    if (!draftRestored) {
      draftRestored = true
      if ($.input) h.setValue($.input)
    }
  }

  // ChatInput labels（placeholder 随搜索态切换——每次切换新建对象（props 不可变契约：
  // 原地改 labels → vdom3 audit + ChatInput 剪枝后 placeholder 永不更新）；
  // 非切换渲染引用不变 → 剪枝仍命中不重建）
  const setSearchQ = (q: string) => {
    $.searchQ = q
    // viewer 禁用文案不因搜索态切换被覆盖（波次 2——placeholder 门控单点在此 + renderFn）
    $.chatLabels = {
      placeholder: !canWrite() ? '只读成员无法发言——可查看消息与下载交付物'
        : q ? '搜索模式：输入新消息退出搜索' : '输入消息，回车发送；@ 可定向 AI',
    }
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
    $.input = v
    saveDraft(v) // CHAT-UX 波次 4（E2）：草稿持久化
    const atMatch = v.match(/@([\u4e00-\u9fa5\w]*)$/)
    const hadAt = $.atMenuOpen
    const menuBefore = $.atMenu
    if (atMatch) {
      $.atQuery = atMatch[1]
      $.atMenu = $.membersList.filter((m) => (m.type === 'ai' || m.type === 'knowledge_base' || m.type === 'department') && (String(m.name).includes($.atQuery) || !$.atQuery))
      $.atMenuOpen = true
    } else {
      $.atMenuOpen = false; $.atQuery = ''
    }
    // **打字零 rerender（2026-08——卡顿根治）**：$.input 不在 JSX 消费——
    // 普通打字（无 @）零渲染；@ 菜单只在**显隐切换或菜单内容变化**时渲染
    // （同态继续打（已开继续打）菜单内容若变——需要刷新；否则零渲染）
    // 菜单内容变化时重置高亮（键盘导航从 @all 开始——2026-08）
    if ($.atMenuOpen && menuBefore !== $.atMenu) $.atMenuIndex = -1
    if (hadAt !== $.atMenuOpen || ($.atMenuOpen && menuBefore !== $.atMenu)) rerender()
  }

  // @ 菜单键盘导航（2026-08——↑↓ 选择 / Enter 确认 / Esc 关闭）：
  // 菜单开时拦截 ChatInput 的按键（返回 true = 已处理——Enter 选中而非发送）
  function onChatKeyDown(e: KeyboardEvent): boolean {
    if (!$.atMenuOpen) return false
    const total = 1 + $.atMenu.length // 1 = @all 项
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      $.atMenuIndex = ($.atMenuIndex + 1) % total
      rerender()
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      $.atMenuIndex = ($.atMenuIndex - 1 + total) % total
      rerender()
      return true
    }
    if (e.key === 'Enter' && $.atMenuIndex >= 0) {
      e.preventDefault()
      if ($.atMenuIndex === 0) {
        // @all（2026-08——同步 ChatInput 内部 keyword：此前只改 $.input——
        // 内部 keyword 未同步——输入框显示旧值——与 pickAtMember 一致用 setKeyword）
        const v = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, '@all ')
        $.input = v
        chatControl.current?.setKeyword(v)
        $.atMenuOpen = false; $.atMenuIndex = -1
        rerender()
      } else {
        pickAtMember($.atMenu[$.atMenuIndex - 1])
      }
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      $.atMenuOpen = false; $.atMenuIndex = -1
      rerender()
      return true
    }
    return false
  }
  // 稳定引用（render 期传同一引用——ChatInput/Input props 不变 → 剪枝命中不重建）
  const handleSend = (text: string) => {
    // **发送即清空渲染（2027-09——输入框残留实证）**：sendText 首行
    // $.input='' ——但父级「打字零渲染」优化下 onChange('') 无渲染——
    // ChatInput 渲染读内部 keyword（send 已清——先于 onSend）——父级
    // 重渲染驱动 input DOM 更新——否则输入框停留旧文本（用户实测）
    $.input = ''
    saveDraft('') // CHAT-UX 波次 4（E2）：发送成功清草稿
    rerender()
    void sendText(text)
  }
  const onSearchInput = (e: Event) => { $.searchQ = inputValue(e); rerender() }
  function pickAtMember(m: Member) {
    // 替换末尾 @前缀 为完整 @名 + 空格（ChatInput 内部 keyword 程序化改写——不触发 onChange 避免 IME 打断）
    const v = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, `@${m.name} `)
    $.input = v
    chatControl.current?.setKeyword(v)
    $.atMenuOpen = false; $.atQuery = ''
    rerender()
  }

  /** 图片直显（2026-09）：AI 消息内容里的 /ws/xxx.png 路径 → 带 token 拉图 →
   * blob URL 挂 preview（MessageItem 渲染 img——点击新页放大）
   * ponytail: blob 不 revoke（会话级小泄漏——页面卸载浏览器回收） */
  const IMG_PATH_RE = /\/ws\/[^\s"'()<>，。]+?\.(?:png|jpe?g|webp|gif)/g
  function extractImagePaths(content: string): string[] {
    return [...new Set(String(content ?? '').match(IMG_PATH_RE) ?? [])]
  }
  function setPreview(id: string, p: { state: 'loading' | 'ready' | 'error'; url?: string } | null): void {
    $.msgs = $.msgs.map((x: ChatMessage) => (x.id === id ? { ...x, preview: p } : x))
    ctx.render()
  }

  async function hydrateImagePreviews(): Promise<void> {
    for (const m of $.msgs) {
      if (m.preview || m.sender_type !== 'ai' || !m.content) continue
      // file_card：content = 文件名（无 /ws/ 前缀——图片扩展名直接尝试）
      const paths = m.msg_type === 'file_card'
        ? (/^[^\s"'()<>，。]+\.(?:png|jpe?g|webp|gif)$/i.test(m.content) ? [m.content] : [])
        : extractImagePaths(m.content)
      if (!paths.length) continue
      // **阶段 1——占位先行**：布局立即含 300×300 占位——单次滚底即真底
      // （图片未就绪不空白等待；ready/error 替换后布局恒定——不追滚）
      setPreview(m.id, { state: 'loading' })
      scrollToBottom()
      const { authorizedGet } = await import('../lib/download.ts')
      let done = false
      for (const p of paths) {
        // /ws/ 是容器视角前缀——文件端点需 ws 相对路径（探针实测 2026-09）
        const rel = p.replace(/^\/ws\//, '')
        // &download=1 必需：无 download 时二进制文件（png）返回 {binary:true} JSON
        // （200）——被当图片 → 破图（agent-browser 实证 naturalWidth=0）
        const res = await authorizedGet(`/api/departments/${deptId}/workspace/file?path=${encodeURIComponent(rel)}&download=1`)
        if (!res.ok) continue
        const ext = (p.match(/\.(\w+)$/)?.[1] ?? 'png').toLowerCase()
        const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
        // decode 校验下沉 Img 组件（placeholder 内部态）——业务只给 src
        setPreview(m.id, { state: 'ready', url: URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime[ext] ?? 'application/octet-stream' })) })
        done = true
        break
      }
      if (!done) setPreview(m.id, { state: 'error' })
    }
  }

  async function loadMessages(merge = false) {
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50`).catch(() => ({ messages: [] }))
    const list = (msgRes.messages ?? []).reverse().map((m: Message) => {
      // B1（2026-08）：ai_step 持久化工具步骤——刷新后恢复工具条（error/done 状态可视）
      const tools = parseStoredTools((m as any).ai_step)
      return { ...m, tools } as ChatMessage
    })
    if (!merge) {
      $.msgs = list
    } else {
      // 重连补拉（A2——2026-08）：断线期间消息合并（id 去重——时间排序收敛）
      const byId = new Map<string, ChatMessage>()
      for (const m of $.msgs) byId.set(m.id, m)
      for (const m of list) byId.set(m.id, m)
      $.msgs = [...byId.values()].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    }
    $.hasMore = list.length >= 50
    void hydrateImagePreviews()
    // 补拉/轮询路径重渲染（merge 改了 $.msgs 但不 rerender——UI 停留在旧帧——
    // A2 纯 HTTP 补拉无 ws 事件兜底——E1 轮询实测消息不上屏根因）
    ctx.render()
  }

  Promise.all([
    loadMessages(),
    // P1：聚合 API（部门+成员+环境状态一次拿）
    // CHAT-INTERACTION 波次 1：404 保留（原 catch(() => ({})) 把部门不存在
    // 吞成空态——「成员（0）暂无 AI 成员」误导——实测踩中）
    ctx.api!.get<WsWorkspaceResponse>(`/api/departments/${deptId}/workspace`).catch((e: unknown) => (e instanceof Error ? e : new Error('加载失败'))),
    ctx.api!.get<{ agents: Agent[] }>('/api/agents?type=user').catch(() => ({ agents: [] })),
  ]).then(([, wsRes, agentRes]) => {
    if (wsRes instanceof Error) {
      $.deptMissing = true
      rerender()
      return
    }
    const agents = agentRes.agents ?? []
    const user = (ctx.auth?.user ?? null) as { id?: string; role?: string } | null
    const mine = agents.find((a: Agent) => a.user_id === user?.id)
    if (mine) $.userAgentId = mine.id
    $.isAdmin = user?.role === 'owner' || user?.role === 'admin'
    $.deptName = wsRes?.department?.name ?? '聊天'
    $.memberCount = (wsRes?.members ?? []).length
    $.membersList = (wsRes?.members ?? []).filter((m: Member) => m.type === 'ai' || m.type === 'knowledge_base' || m.type === 'department')
    $.env = wsRes?.env ?? { status: 'none', label: '' }
    $.subDepts = wsRes?.subDepartments ?? []
    $.wsFiles = wsRes?.files ?? []
    rerender()
  }).catch(() => {})

  async function loadOlder() {
    if ($.loadingMore || !$.hasMore) return
    $.loadingMore = true; rerender()
    const oldest = $.msgs[0]
    const msgRes = await ctx.api!.get<MessageListResponse>(`/api/departments/${deptId}/messages?limit=50&before=${oldest?.id ?? ''}`).catch(() => ({ messages: [] }))
    const older = msgRes.messages ?? []
    if (older.length > 0) {
      // CHAT-UX 波次 2（L3）：与 loadMessages 同源——parseStoredTools（旧消息工具步骤
      // 条恢复——否则翻页加载后 AI 消息工具条消失——首屏/翻页不一致实证）
      const olderParsed = older.reverse().map((m: Message) => ({ ...m, tools: parseStoredTools((m as any).ai_step) })) as ChatMessage[]
      $.msgs = [...olderParsed, ...$.msgs]
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

  // A2 断线补拉（2026-08）：ws 状态翻转 false→true（重连成功）→ 补拉最近消息
  // （断线期间 new_message 未达——onMessage 不补历史）——id 去重合并不重复
  // E1 轮询补偿（2026-08——ROADMAP E——WS 长断线兜底）：断线期间 30s 轮询
  // 补拉（HTTP 通道可达时消息不丢——WS/HTTP 双通道冗余）；重连成功自动停。
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }
  const startPoll = () => {
    if (pollTimer) return
    // 测试覆写钩子（生产默认 30s——场景测试快轮询）
    const ms = Number((globalThis as any).__WF_CHAT_POLL_MS ?? 30_000)
    pollTimer = setInterval(() => { void loadMessages(true) }, ms)
  }
  const unsubStatus = ctx.ws?.onStatusChange((up) => {
    if (up) {
      // 重连成功：停止轮询（WS 主通道恢复）+ 重发订阅（mount 时 subscribe
      // 在 WS 未连时被静默丢弃——不重发则广播永远到不了）+ 补拉断线期间消息
      stopPoll()
      ctx.ws?.send({ type: 'subscribe', room: deptId })
      void loadMessages(true)
    } else {
      // 断线：启动轮询补偿（HTTP 兜底——WS 长断线期间消息不丢）
      startPoll()
    }
  })
  ctx.ui.onUnmount?.(() => { unsubStatus?.(); stopPoll() })

  /** **AI 消息占位自愈（2027-09）**：wf:* 事件消息未在 $.msgs（首事件
   * 可能是 wf:step tool——无 llm 前置 push）——创建占位（内容空——
   * 后续 token 累积）——否则 wf:token/done idx=-1 全 skip——前端零消息 */
  /** wf 协议应用（2027-09——纯函数状态机 ui/lib/wf-events.ts——
   *  占位自愈/工具累积/状态推进——应用层只做 setAiWorking 与引用替换） */
  const applyWf = (event: any) => {
    const r = applyWfEvent($.msgs, event)
    $.msgs = r.msgs
    for (const w of r.working) setAiWorking(w.agentId, w.on)
  }

  const unsub: (() => void) | undefined = ctx.ws?.onMessage((event: any) => {
    switch (event.type) {
      case 'new_message':
        if (!$.msgs.some((m: ChatMessage) => m.id === event.message.id)) {
          // CHAT-UX 波次 1（C4）：sender_name 空串兜底（服务端已补 sender_name——旧事件面兼容）
          $.msgs.push({ id: event.message.id, sender_id: event.message.sender_id, sender_name: event.message.sender_name || '未知', sender_type: event.message.sender_type ?? 'user', content: event.message.content, msg_type: 'text', created_at: event.message.created_at ?? new Date().toISOString(), status: 'idle', tools: [] as MessageTool[] })
        }
        ; break
      case 'ai_draft':
        if (!$.msgs.some((m: ChatMessage) => m.id === event.message.id)) {
          $.msgs.push({ id: event.message.id, sender_id: event.agentId, sender_name: event.agentName ?? 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'idle', tools: [] as MessageTool[], ai_draft: event.draft, ai_approved: null })
        }
        ; break
      case 'wf:step': {
        // 框架协议：stepType 'llm'（开始思考）/ 'tool'（工具调用）——占位自愈/
        // 状态推进/tools 累积在纯函数 applyWfEvent（ui/lib/wf-events.ts——单测锁定）
        applyWf(event)
        ; break
      }
      case 'wf:token': {
        applyWf(event)
        ; break
      }
      case 'wf:tool_result': {
        applyWf(event)
        ; break
      }
      case 'wf:done': {
        applyWf(event)
        void hydrateImagePreviews()
        ; break
      }
      case 'wf:error': {
        applyWf(event)
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
        // 新建对象（原地改 msg.content → vdom3 audit + MessageItem 剪枝显示旧内容）
        $.msgs = $.msgs.map((m: ChatMessage) => m.id === event.messageId ? { ...m, content: event.content } : m)
        ; break
      }
      case 'message_deleted': {
        $.msgs = $.msgs.filter((m: ChatMessage) => m.id !== event.messageId); break
      }
    }
    rerender()
    // **流式滚动跟随（2027-09——滑动条不滑底实证）**：wf:token 期间
    // msgsLen 不变（同消息累积）——render 阶段仅 msgsLen 变化才滚——
    // 内容增长无滚动——事件处理后统一请求渲染后落底（rAF——scrollHeight
    // 已更新；isUserScrolledUp 守卫在 scrollToBottom 内）
    if ($.bodyEl && !$.isUserScrolledUp) requestAnimationFrame(() => scrollToBottom(true))
  })
  $.unsubWs = unsub ?? null

  ctx.ws?.send({ type: 'subscribe', room: deptId })

  const timer = setInterval(() => {
    // CHAT-UX 波次 3（D3）：timeVersion 死状态删除（无消费方——相对时间已改绝对 HH:mm）
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
  let prevMsgsRef: ChatMessage[] | null = null

  function scrollToBottom(force = false) {
    const body = $.bodyEl
    if (!body || ($.isUserScrolledUp && !force)) return
    requestAnimationFrame(() => { if ($.bodyEl) $.bodyEl.scrollTop = $.bodyEl.scrollHeight })
  }

  function isOwn(msg: ChatMessage) { return !!( $.userAgentId && msg.sender_id === $.userAgentId) }

  // CHAT-UX 波次 4（E2）：草稿 sessionStorage（按部门隔离 key——切会话/刷新不丢）
  const draftKey = `wf-draft-${deptId}`
  function saveDraft(v: string) {
    try { if (v) sessionStorage.setItem(draftKey, v); else sessionStorage.removeItem(draftKey) } catch { /* 隐私模式忽略 */ }
  }

  // CHAT-UX 波次 3（D2）：日期分隔线（今天/昨天/M月D日——本地时区日界）
  function dayKey(iso: string): string {
    try { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` } catch { return '' }
  }
  function dayLabel(iso: string): string {
    try {
      const d = new Date(iso)
      const now = new Date()
      const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
      if (same(d, now)) return '今天'
      if (same(d, yesterday)) return '昨天'
      return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    } catch { return '' }
  }
  function canEdit(msg: ChatMessage) { return isOwn(msg) && Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000 }

  // CHAT-INTERACTION 波次 2：快捷确认 chip 仅对「消息流中最后一条消息且为带选项的 AI 消息」渲染——
  // 用户回复后最后一条变成 user 消息 → chip 自动消失（已答不可重复答——确定性规则，无状态跟踪）
  function showQuickReplies(msg: ChatMessage): boolean {
    const last = $.msgs[$.msgs.length - 1]
    return last?.id === msg.id && msg.sender_type === 'ai' && (msg.quick_replies ?? []).length > 0
  }

  function handleQuickReply(msg: ChatMessage, text: string) {
    // 即时反馈：本地清掉该消息选项（chip 消失）——再走 sendText（复用发送链：草稿/附件/@解析全同）
    $.msgs = $.msgs.map((x) => (x.id === msg.id ? { ...x, quick_replies: null } : x))
    rerender()
    void sendText(text)
  }

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
      // 三端事件流（阶段 2）：requestId 跨端贯通——一次用户操作精确因果——
      // 前端生成 → POST → AI 事件 → （沙盒 exec）——全链路同一 requestId
      const requestId = crypto.randomUUID?.() ?? `r${Date.now().toString(36)}`
      // ROLES-OPTIMIZATION 波次 3：错误保留（原 .catch(() => null) 吞掉服务端
      // 403/409 语义——errMsg 透出「只读成员无权执行此操作」等原因）
      const data = await ctx.api!.post<{ message: Message }>(`/api/departments/${deptId}/messages`, {
        content: trimmed,
        reply_to: replyId,
        request_id: requestId,
        attachments: savedFiles.map((f) => ({ name: f.name, data: f.data, size: f.size })),
      }).catch((e: unknown) => (e instanceof Error ? e : new Error('服务无响应')))
      if (data && !(data instanceof Error)) {
        track('first_message')
        if (data.message && !$.msgs.some((m: ChatMessage) => m.id === data.message.id)) {
          $.msgs.push({
            id: data.message.id,
            sender_id: data.message.sender_id ?? '',
            sender_name: data.message.sender_name || '我', // CHAT-UX 波次 1（C4）：空串也兜底（?? 不拦 ''——头像「?」实证）
            sender_type: 'user',
            content: data.message.content ?? trimmed,
            msg_type: 'text',
            created_at: data.message.created_at ?? new Date().toISOString(),
            status: 'idle',
            tools: [] as MessageTool[],
            attachments: (data.message.attachments as ChatMessage['attachments']) ?? null,
          })
        }
      } else {
        $.input = saved; saveDraft(saved)
        ctx.toast!(`发送失败：${errMsg(data as unknown, '服务无响应')}`, 'error')
      }
    } catch { $.input = saved; saveDraft(saved); ctx.toast!('网络错误', 'error') }
    finally { $.sending = false; rerender() }
  }

  async function continueMessage(fromMsgId: string) {
    // C1 断点续跑：从中断处继续（后端注入已执行步骤，不重做）
    ctx.ws?.send({ type: 'subscribe', room: deptId })
    try {
      const d = await ctx.api!.post<{ resumed: boolean; doneSteps: number; totalSteps: number }>(`/api/messages/${fromMsgId}/continue`).catch(() => null)
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
    // CHAT-UX 波次 4（E4）：透传 reply_to（引用上下文不丢）；attachments 不透传——
    // 历史消息只有 name/size 元数据（无 data base64——重传是垃圾数据——降级注释）
    await ctx.api!.post(`/api/departments/${deptId}/messages`, { content: lastUser.content, reply_to: lastUser.reply_to ?? null }).catch(() => {})
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
      // 新建对象（原地改 msg.feedback → vdom3 audit + MessageItem 剪枝点赞态不更新）
      $.msgs = $.msgs.map((m: ChatMessage) => m.id === msg.id ? { ...m, feedback: fb } : m)
      rerender()
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

  /** 拖拽上传（2027-09——拖文件入消息区即入列——现代 IM 标配）：
   *  - dragenter/dragover 高亮（直接 DOM outline——零渲染——不扰渲染管线）
   *  - drop → addFiles（与按钮共享链）——非文件拖入忽略（dataTransfer.files 空）
   *  - 监听挂载时一次（el 引用防重——卸载时机清理） */
  let dropBoundEl: HTMLElement | null = null
  const dragDepth = { n: 0 }
  const onDragEnter = (e: DragEvent) => { e.preventDefault(); dragDepth.n++; if (dragDepth.n === 1) { (e.currentTarget as HTMLElement).style.outline = '2px dashed var(--wf-color-primary)' } }
  const onDragOver = (e: DragEvent) => { e.preventDefault() }
  const onDragLeave = () => { dragDepth.n = Math.max(0, dragDepth.n - 1); if (dragDepth.n === 0 && $.bodyEl) $.bodyEl.style.outline = '' }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.n = 0
    if ($.bodyEl) $.bodyEl.style.outline = ''
    const files = [...(e.dataTransfer?.files ?? [])]
    if (files.length > 0) addFiles(files)
  }
  const bindDrop = (el: HTMLElement | null) => {
    if (el === dropBoundEl) return
    if (dropBoundEl) {
      dropBoundEl.removeEventListener('dragenter', onDragEnter as any)
      dropBoundEl.removeEventListener('dragover', onDragOver as any)
      dropBoundEl.removeEventListener('dragleave', onDragLeave as any)
      dropBoundEl.removeEventListener('drop', onDrop as any)
      dropBoundEl = null
    }
    if (el) {
      el.addEventListener('dragenter', onDragEnter as any)
      el.addEventListener('dragover', onDragOver as any)
      el.addEventListener('dragleave', onDragLeave as any)
      el.addEventListener('drop', onDrop as any)
      dropBoundEl = el
    }
  }
  const chatBodyRef = (el: HTMLElement | null) => {
    bindDrop(el)
    if (el) { $.bodyEl = el; scrollToBottom(true) }
    if (!el && $.bodyEl) {
      $.bodyEl = null
      if ($.unsubWs) { try { $.unsubWs() } catch {}; $.unsubWs = null }
      if ($.streamTimer) { clearInterval($.streamTimer); $.streamTimer = null }
    }
  }

  function fmtTime(iso: string) {
    // CHAT-UX 波次 3（D3）：与 MessageItem.fmtTime 同步改 HH:mm（本副本当前无调用方——保留同语义防漂移）
    try {
      const d = new Date(iso)
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

  return (props: {}) => {
    const msgsLen = $.msgs.length
    if (msgsLen > prevLen) { scrollToBottom(); prevLen = msgsLen }
    // 2026-08（打字卡顿·渲染开销）：reduce 遍历全部消息改为增量——
    // 消息数组引用变化时才重算总长（每次按键 rerender——消息未变——
    // 跳过重算 + 跳过 reduce 循环——O(n) → O(1)
    if (msgsLen > 0 && $.msgs !== prevMsgsRef) {
      const totalLen = $.msgs.reduce((s: number, m: ChatMessage) => s + (m.content?.length ?? 0), 0)
      if (totalLen > prevContentLen && prevContentLen > 0) { scrollToBottom() }
      prevContentLen = totalLen
      prevMsgsRef = $.msgs
    }

    // ROLES-OPTIMIZATION 波次 2：viewer 输入框前置禁用（走查 P0——此前打完字才
    // 「发送失败」；禁用 + placeholder 引导——API requireDeptMember/requireWriter 兜底）
    const viewerBlocked = !canWrite()
    const inputDisabled = $.editingId !== '' || viewerBlocked
    if (viewerBlocked && $.chatLabels.placeholder.indexOf('只读成员') !== 0) {
      $.chatLabels = { placeholder: '只读成员无法发言——可查看消息与下载交付物' }
    }
  const isNarrow = bp() === 'mobile'

    // CHAT-INTERACTION 波次 1：404 → 显式错误态（空态文案保留给真空部门）
    if ($.deptMissing) {
      return (
        <div class="wf-fill wf-col wf-items-center wf-justify-center wf-gap-md wf-padding-lg">
          <EmptyState icon="🔍" text="部门不存在或无权访问"
            hint="会话可能已被删除，或链接不完整——从会话列表重新进入">
            <Button variant="primary" onClick={() => ctx.app?.navigate('/chat/new')}>返回会话列表</Button>
          </EmptyState>
        </div>
      )
    }

    return (
    <div class="wf-row wf-height-full wf-gap-none">
      {/* 左栏：成员 + 工作环境 + 交付物（2026-08 合并——用户建议：成员与交付物
          放同一侧——右栏删除——消息区更宽——窄屏隐藏） */}
      {/* CHAT-UX 波次 2（L1）：wf-self-stretch——wf-row 默认 align center，aside
          无高度被垂直居中悬浮（顶差 121px 实测）——拉伸满高贴顶 */}
      <aside class={`wf-col wf-self-stretch ap-panel-drawer${panelOpen ? ' ap-drawer--open' : ''} wf-bg-secondary wf-border-right wf-padding-sm wf-stack wf-gap-sm`} style="width: 300px; min-width: 300px">
        <div class="wf-font-xs wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">成员（{$.memberCount}）</div>
        {$.membersList.length === 0 && <div class="wf-font-xs wf-text-tertiary">暂无 AI 成员——聊天中 @ 不到人时去「管理 → Agent」添加</div>}
        {$.membersList.map((m: Member) => (
          <div key={m.id} class="wf-row wf-gap-sm wf-items-center wf-padding-y-xs">
            {/* P2-1：AI 干活中呼吸灯（wf:step/wf:done 驱动 aiStatus store） */}
            <div class="wf-relative">
              <Ava name={m.name} type={m.type ?? 'ai'} small />
              {m.type !== 'knowledge_base' && (
                <span style={`position:absolute;right:-2px;bottom:-2px;width:8px;height:8px;border-radius:50%;background:${aiStatusOf(m.id) === 'working' ? 'var(--wf-color-primary)' : 'var(--wf-color-success)'};border:1px solid var(--wf-color-bg);${aiStatusOf(m.id) === 'working' ? 'animation:wf-breathe 1.2s ease-in-out infinite' : ''}`} />
              )}
            </div>
            <div class="wf-fill wf-stack wf-gap-none wf-min-width-0">
              <span class="wf-font-sm wf-medium wf-truncate">{m.name}</span>
              <span class="wf-font-xs wf-text-tertiary wf-truncate">
                {m.type === 'department'
                  ? `代表 ${$.subDepts.find(sd => sd.managerId === m.id)?.name ?? '本部门'}`
                  : aiStatusOf(m.id) === 'working' ? '干活中…' : (m.role_label || '空闲')}
              </span>
            </div>
            {m.type === 'knowledge_base' && <span class="wf-font-xs wf-text-tertiary">KB</span>}
          </div>
        ))}
        {$.membersList.length > 0 && (
          <a class="wf-font-xs wf-text-primary wf-margin-top-xs" style="cursor:pointer"
            onClick={() => ctx.app?.navigate('/departments/' + deptId)}>＋ 添加 AI 能力</a>
        )}
        <div class="wf-border-top wf-padding-top-sm wf-margin-top-sm">
          <div class="wf-font-xs wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">工作环境</div>
          {$.env.label ? (
            <div class="wf-font-xs wf-text-tertiary wf-margin-top-xs">{$.env.label}</div>
          ) : (
            <div class="wf-font-xs wf-text-tertiary wf-margin-top-xs">首次干活时自动创建</div>
          )}
        </div>

        {/* 交付物（共享目录）——2026-08 并入左栏（用户建议：成员与交付物一侧——
           消息区更宽——右栏删除） */}
        <div class="wf-border-top wf-padding-top-sm wf-margin-top-sm">
          <div class="wf-font-xs wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-sm">交付物（共享目录）</div>
          <FilesSection key="ws-files" departmentId={deptId} initialFiles={$.wsFiles} />

          {/* 组织层级：下级部门交付物（只读可见——上级看下属成果） */}
          {$.subDepts.length > 0 && (
            <div class="wf-margin-top-md">
              <div class="wf-font-xs wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-xs">下级部门（{$.subDepts.length}）</div>
              {$.subDepts.map((sd) => (
                <div key={sd.id} class="wf-bg-tertiary wf-radius wf-padding-sm wf-margin-bottom-sm">
                  <div class="wf-row wf-gap-xs wf-items-center wf-margin-bottom-xs">
                    <Icon name="users" size={12} />
                    <span class="wf-font-sm wf-medium wf-truncate">{sd.name}</span>
                    <span class="wf-font-xs wf-text-tertiary">{sd.memberCount} 人</span>
                  </div>
                  <div class="wf-font-xs wf-text-tertiary wf-margin-bottom-xs">经理：{sd.managerName}</div>
                  {sd.files.length === 0 ? (
                    <div class="wf-font-xs wf-text-tertiary">暂无交付物</div>
                  ) : (
                    <div class="wf-stack wf-gap-none">
                      {sd.files.map((f) => (
                        <div key={f.name} class="wf-row wf-gap-xs wf-padding-y-xs wf-items-center">
                          <Icon name={f.type === 'dir' ? 'folder' : 'file-text'} size={12} />
                          <span class="wf-font-xs wf-medium wf-truncate wf-fill">{f.name}{f.type === 'dir' ? '/' : ''}</span>
                          <span class="wf-font-xs wf-text-tertiary wf-nums">{f.type === 'file' && f.size > 1024 ? (f.size / 1024).toFixed(1) + 'KB' : f.size + 'B'}</span>
                          {f.type === 'file' && (
                            <button type="button" class="wf-text-primary" title="下载（子部门交付物）"
                              onClick={() => { void downloadSubFile(sd.id, f.name) }}>
                              <Icon name="arrow-down" size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 左栏抽屉遮罩（移动端开启时——点击关闭） */}
      {panelOpen && <div class="ap-panel-overlay" onClick={closePanel} />}

      {/* 中栏：聊天流 */}
      <main class="wf-col wf-fill wf-stack wf-height-full wf-min-width-0">
      <div class="wf-stack wf-height-full">
      <div class="wf-row wf-gap-sm wf-padding-sm wf-bg-secondary wf-border-bottom">
        <Button size="sm" variant="ghost" title="成员与交付物" aria-label="打开成员与交付物面板"
          class="wf-flex wf-hidden@lg"
          onClick={() => { panelOpen = true; rerender() }}>
          <Icon name="users" size={16} />
        </Button>
        <a href="/chat/new" class="wf-text-primary"
          onClick={(e: Event) => { e.preventDefault(); ctx.app?.navigate('/chat/new') }}>
          <Icon name="arrow-left" size={16} />
        </a>
        <div class="wf-fill wf-stack wf-gap-none">
          <div class="wf-font-base wf-semibold">{$.deptName}</div>
          <div class="wf-font-xs wf-text-tertiary">{$.memberCount} 位成员</div>
        </div>
        {!ctx.ws?.isConnected && <Badge variant="error"><Icon name="warning" size={12} /> 连接断开</Badge>}
        {/* P1：环境状态用户语言（头部可见——颜色语义：ready 绿/error 红/其他灰） */}
        {$.env.label && (
          <Badge variant={$.env.status === 'error' ? 'error' : $.env.status === 'ready' ? 'success' : 'default'}>{$.env.label}</Badge>
        )}
        <Button size="sm" variant="ghost" title="搜索消息（UX-PLAN-2：搜索归位头部——底部不可发现实证）"
          onClick={() => {
            $.searchOpen = !$.searchOpen
            if ($.searchOpen) ctx.afterRender?.(() => { (document.querySelector('input[placeholder="搜索消息..."]') as HTMLInputElement | null)?.focus() })
            rerender()
          }}><Icon name="search" size={14} /></Button>
        <Button size="sm" variant="ghost" onClick={exportChat} title="导出对话为 Markdown"><Icon name="copy" size={14} /> 导出</Button>
        <Button size="sm" variant="ghost" class="wf-hidden wf-flex@sm" onClick={() => ctx.app?.navigate(`/departments/${deptId}`)}>部门详情</Button>
      </div>

        {/* 搜索行（C1 归位头部：头部开关控制——搜索态时保持展开） */}
        {$.searchOpen && (
          <div class="wf-row wf-gap-sm wf-padding-x-sm wf-padding-y-xs wf-bg-secondary wf-border-bottom">
            <div class="wf-fill">
              <Input placeholder="搜索消息..." value={$.searchQ} onInput={onSearchInput}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') { e.preventDefault(); runSearch() }
                  if (e.key === 'Escape') { setSearchQ(''); $.searchOpen = false; rerender() }
                }} />
            </div>
            <Button size="sm" disabled={$.searching} onClick={runSearch}><Icon name="search" size={14} /> 搜索</Button>
            <Button size="sm" variant="ghost" title="关闭搜索" onClick={() => { setSearchQ(''); $.searchOpen = false; rerender() }}><Icon name="close" size={14} /></Button>
          </div>
        )}

      {/* CHAT-UX 波次 4（E1）：回到底部浮钮容器（position 锚——isUserScrolledUp 翻转才重渲染） */}
      <div class="wf-fill wf-stack" style="position: relative; min-height: 0">
      {/* min-height:0——flex 子项默认 min-height:auto 会被内容撑开（溢出滚动失效——波次 4 实测） */}
      <div class="wf-fill wf-overflow-auto wf-stack wf-gap-md wf-padding-md" style="min-height: 0"
        ref={chatBodyRef}
        onScroll={() => {
          if (!$.bodyEl) return
          const threshold = 80
          const up = ($.bodyEl.scrollHeight - $.bodyEl.scrollTop - $.bodyEl.clientHeight) > threshold
          if (up !== $.isUserScrolledUp) { $.isUserScrolledUp = up; rerender() } // 翻转才渲染——非每帧
          // 顶部接近时自动加载更早
          if ($.bodyEl.scrollTop < 40 && $.hasMore && !$.loadingMore) { loadOlder() }
        }}>
        <div class="wf-row wf-gap-sm">
          {$.hasMore && (
            <Button size="sm" variant="ghost" disabled={$.loadingMore} onClick={loadOlder}>
              {$.loadingMore ? '加载中...' : '↑ 加载更早消息'}
            </Button>
          )}
          {$.searchQ && <Badge variant="primary">搜索："{$.searchQ}" <a class="wf-text-primary wf-margin-left-xs" style="cursor:pointer" onClick={() => { setSearchQ(''); runSearch() }}><Icon name="close" size={12} /> 清除</a></Badge>}
        </div>

        {$.msgs.length === 0 && (
          <EmptyState icon={<Icon name="message" />} text={$.searchQ ? '没有匹配的消息' : '暂无消息'}
            hint={$.searchQ ? '换个关键词试试'
              // CHAT-UX 波次 2（L2）：指路修正——交付物 2026-08 已并入左栏（旧文案「右侧」漂移实证）
              : isNarrow ? '三步开始：点头部 👥 打开面板上传资料 → 发送消息 @AI 成员 → 面板里拿成果'
              : '三步开始：上传资料到左侧交付物 → 发送消息 @AI 成员 → 交付物里拿成果'} />
        )}

        {/* CHAT-UX 波次 3（D2）：日期分隔线——相邻消息跨日时插入（今天/昨天/M月D日） */}
        {(() => {
          let lastDay = ''
          return $.msgs.flatMap((msg: ChatMessage) => {
            const day = dayKey(msg.created_at)
            const showDay = day !== '' && day !== lastDay
            lastDay = day
            return [
              ...(showDay ? [<div key={`day-${msg.id}`} class="wf-center"><span class="wf-pill wf-bg-tertiary wf-text-tertiary wf-padding-x-sm wf-padding-y-xs wf-font-xs">{dayLabel(msg.created_at)}</span></div>] : []),
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
            showQuickReplies={showQuickReplies(msg)}
            onQuickReply={handleQuickReply}
              />,
            ]
          })
        })()}

        {/* CHAT-UX 波次 4（E1）：回到底部浮钮——改为框架 BackTop（direction=bottom）
        ——2026-09：手写按钮替换（组件库浮钮：IO 阈值显示/平滑滚动/aria 内置）
        ——key=backtop：数组子项身份稳定——无 key 组件项触发 detectMissingKey warn */}
        <BackTop key="backtop" direction="bottom" target={() => $.bodyEl} visibilityHeight={80} fixed={false} smooth={false} />
      </div>
      </div>

      <div class="wf-border-top wf-padding-sm">
        {$.atMenuOpen && (
          <div class="wf-stack wf-gap-none wf-padding-sm wf-radius wf-surface wf-margin-bottom-sm wf-shadow" style="position: relative; z-index: 10">
            <div class="wf-font-xs wf-text-tertiary wf-padding-x-sm wf-padding-bottom-xs">@ 选择成员（可多选——@all 全员）</div>
            <button type="button" class="wf-row wf-gap-sm wf-padding-x-sm wf-padding-y-xs wf-text-left" style={{ border: 'none', cursor: 'pointer', borderRadius: '6px', color: 'var(--wf-color-primary)', background: $.atMenuIndex === 0 ? 'var(--wf-color-bg-primary, #eef1ff)' : 'none' }}
              onClick={() => { const v = $.input.replace(/@([\u4e00-\u9fa5\w]*)$/, '@all '); $.input = v; chatControl.current?.setKeyword(v); $.atMenuOpen = false; rerender() }}>
              <span class="wf-font-base">@所有人（全部 AI）</span>
            </button>
            {$.atMenu.length === 0 && (
              <div class="wf-font-xs wf-text-tertiary wf-padding-x-sm wf-padding-y-xs">暂无其他成员可选——可 @所有人 或去「管理 → Agent」添加</div>
            )}
            {$.atMenu.map((m: Member, i: number) => (
              <button type="button" key={m.id} class="wf-row wf-gap-sm wf-padding-x-sm wf-padding-y-xs wf-text-left" style={{ border: 'none', cursor: 'pointer', borderRadius: '6px', background: $.atMenuIndex === i + 1 ? 'var(--wf-color-bg-primary, #eef1ff)' : 'none' }}
                onClick={() => pickAtMember(m)}>
                <Ava name={m.name} type={m.type ?? 'ai'} small />
                <span class="wf-font-base">{m.name}</span>
              </button>
            ))}
          </div>
        )}
        {$.replyTo && (
          <div class="wf-row wf-gap-sm wf-bg-tertiary wf-padding-x-sm wf-padding-y-xs wf-radius wf-margin-bottom-sm">
            <Icon name="message" size={14} />
            <span class="wf-font-sm wf-text-secondary wf-truncate wf-fill">回复 {$.replyTo.sender}：{String($.replyTo.content).slice(0, 40)}</span>
            <Button size="sm" variant="ghost" onClick={() => { $.replyTo = null; rerender() }}><Icon name="close" size={12} /></Button>
          </div>
        )}
        {$.files.length > 0 && (
          <div class="wf-row wf-gap-sm wf-margin-bottom-sm">
            {$.files.map((f, i) => (
              <span key={i} class="wf-bg-tertiary wf-radius wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-row wf-gap-xs">
                📎 {f.name}（{f.size >= 1024 ? Math.round(f.size / 1024) + 'KB' : f.size + 'B'}）
                <button class="wf-bg-none wf-border-none wf-pointer wf-text-tertiary" onClick={() => { $.files = $.files.filter((_, j) => j !== i); rerender() }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div class="wf-row wf-gap-sm">
          <div class="wf-fill">
            <ChatInput
              value={$.input}
              onControl={onControl}
              onChange={onInputChange}
              onSend={handleSend}
              onKeyInterceptFn={onChatKeyDown}
              disabled={inputDisabled}
              labels={$.chatLabels}
            />
          </div>
          <Button variant="ghost" onClick={pickFile} title="上传附件（csv/xlsx/pdf/docx/pptx/txt/md/json/log/png/jpg，≤20MB）"><Icon name="paperclip" size={15} /></Button>
          <input ref={fileInputRef} type="file" hidden onChange={(e: Event) => { onFilePick(e as Event) }} />
        </div>
      </div>
      </div>
      </main>


    </div>
    )
  }
}
