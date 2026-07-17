/**
 * Org 前端 SPA — Enterprise AI Collaboration Platform
 *
 * 路由结构：
 *   /                                                   — 登录/注册
 *   /                                                   — 租户列表（首页，已登录）
 *   /tenant/:tenantId                                   — 公司列表
 *   /tenant/:tenantId/company/:companyId                — 部门列表
 *   /tenant/:tenantId/company/:companyId/dept/:deptId   — 部门聊天室（支持 @AI Agent）
 */

import { signal, computed, Show, For, createApp, api, auth, ws, router, RouteView, createStyles, onMount, onCleanup } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

interface Tenant { id: string; name: string; slug: string; created_at: string }
interface Company { id: string; tenant_id: string; name: string; created_at: string }
interface Department { id: string; company_id: string; name: string; description?: string | null; conversation_id?: string | null; agent_count?: number }
interface Agent { id: string; kind: 'ai' | 'user' | 'webhook' | 'knowledge'; name: string; avatar?: string | null; ai_config?: Record<string, unknown> | null }
interface ChatMessage { id: string; sender_id: string; sender_name?: string; body: string; created_at: string; is_ai?: boolean; conversation_id?: string }

function formatDate(d: string) { return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }

// ═══════════════════════════════════════════════════════════════
// 设计系统 — 通用组件
// ═══════════════════════════════════════════════════════════════

// ── Button ──

function Button({ onClick, children, variant = 'primary', size = 'md', disabled, className }: {
  onClick?: () => void
  children: any
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg cursor-pointer transition-colors select-none'
  const variants: Record<string, string> = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300',
    danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
    ghost: 'text-gray-500 hover:bg-gray-100 active:bg-gray-200',
  }
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
  }
  const disabledStyle = disabled ? 'opacity-50 cursor-not-allowed' : ''
  return (
    <button class={`${base} ${variants[variant]} ${sizes[size]} ${disabledStyle} ${className || ''}`}
      onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Input ──

function Input(props: { value: any; onInput?: (e: any) => void; placeholder?: string; type?: string; className?: string; onKeyDown?: (e: any) => void }) {
  return (
    <input class={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all ${props.className || ''}`}
      value={props.value} onInput={props.onInput} placeholder={props.placeholder}
      type={props.type || 'text'} onKeyDown={props.onKeyDown} />
  )
}

// ── Card ──

function Card({ children, onClick, className }: { children: any; onClick?: () => void; className?: string }) {
  return (
    <div class={`bg-white rounded-xl shadow-sm border border-gray-100 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className || ''}`}
      onClick={onClick}>
      {children}
    </div>
  )
}

// ── Modal ──

function Modal({ show, onClose, title, children }: { show: boolean; onClose: () => void; title: string; children: any }) {
  return (
    <Show when={show}>
      <div class="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div class="fixed inset-0 bg-black/30 anim-fade-in" />
        <div class="relative bg-white rounded-xl shadow-modal p-6 w-full max-w-md mx-4 anim-slide-in" onClick={e => e.stopPropagation()}>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">{title}</h2>
            <button class="text-gray-400 hover:text-gray-600 text-lg cursor-pointer" onClick={onClose}>✕</button>
          </div>
          {children}
        </div>
      </div>
    </Show>
  )
}

// ── Badge ──

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span class={`bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium ${className || ''}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
// LoginPage — 登录/注册
// ═══════════════════════════════════════════════════════════════

function LoginPage(_props: {}, ctx: WfuiContext) {
  const email = signal(''); const password = signal(''); const name = signal('')
  const isRegister = signal(false); const error = signal(''); const loading = signal(false)
  const emailError = signal(''); const passwordError = signal('')

  const validate = (): boolean => {
    emailError.value = ''
    passwordError.value = ''
    if (!email.value.trim()) { emailError.value = '请输入邮箱'; return false }
    if (!email.value.includes('@')) { emailError.value = '邮箱格式不正确'; return false }
    if (password.value.length < 3) { passwordError.value = '密码至少 3 个字符'; return false }
    return true
  }

  const submit = async () => {
    if (!validate()) return
    error.value = ''
    loading.value = true
    try {
      if (isRegister.value) {
        if (!name.value.trim()) { error.value = '请输入昵称'; loading.value = false; return }
        await ctx.register?.({ email: email.value.trim(), name: name.value.trim(), password: password.value })
      } else {
        await ctx.login?.(email.value.trim(), password.value)
      }
    } catch (e: any) { error.value = e?.message || '操作失败' }
    finally { loading.value = false }
  }

  const s = createStyles({
    page: 'flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100',
    card: 'bg-white rounded-xl p-8 shadow-elevated w-full max-w-sm anim-slide-in',
    logo: 'text-3xl text-center mb-1',
    title: 'text-2xl font-bold text-center mb-1',
    subtitle: 'text-gray-400 text-sm text-center mb-6',
    input: 'w-full px-3 py-2.5 border rounded-lg text-sm mb-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all',
    inputError: 'w-full px-3 py-2.5 border rounded-lg text-sm mb-1 focus:outline-none border-red-400 focus:border-red-500 focus:ring-red-100',
    fieldError: 'text-red-500 text-xs mb-2 ml-1',
    errorBox: 'bg-red-50 text-red-600 text-xs rounded-lg p-3 mb-3 anim-slide-in',
    btn: 'w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 active:bg-blue-700 transition-colors mb-3 disabled:opacity-50 disabled:cursor-not-allowed',
    switchLink: 'text-center text-xs text-gray-400 cursor-pointer hover:text-blue-500 transition-colors',
    footer: 'text-center text-xs text-gray-300 mt-6',
  })

  return (
    <div class={s.page}>
      <div class={s.card}>
        <div class={s.logo}>🏢</div>
        <h1 class={s.title}>Org</h1>
        <p class={s.subtitle}>Enterprise AI Collaboration Platform</p>

        {/* 昵称（注册时显示）*/}
        <Show when={isRegister}>
          <input class={s.input} value={name} onInput={(e: any) => name.value = e.target.value} placeholder="昵称" />
        </Show>

        {/* 邮箱 */}
        <input class={emailError.value ? s.inputError : s.input}
          value={email} onInput={(e: any) => { email.value = e.target.value; emailError.value = '' }}
          placeholder="邮箱" type="email" />
        <Show when={emailError.value}><p class={s.fieldError}>{emailError.value}</p></Show>

        {/* 密码 */}
        <input class={passwordError.value ? s.inputError : s.input}
          value={password} onInput={(e: any) => { password.value = e.target.value; passwordError.value = '' }}
          placeholder="密码" type="password" onKeyDown={(e: any) => e.key === 'Enter' && submit()} />
        <Show when={passwordError.value}><p class={s.fieldError}>{passwordError.value}</p></Show>

        {/* 错误提示 */}
        <Show when={error.value}>
          <div class={s.errorBox}>⚠ {error.value}</div>
        </Show>

        {/* 提交按钮 */}
        <button class={s.btn} onClick={submit} disabled={loading.value}>
          {loading.value ? '⏳ 处理中...' : (isRegister.value ? '注册' : '登录')}
        </button>

        {/* 切换登录/注册 */}
        <p class={s.switchLink}
          onClick={() => { isRegister.value = !isRegister.value; error.value = ''; emailError.value = ''; passwordError.value = '' }}>
          {computed(() => isRegister.value ? '已有账号？登录 →' : '没有账号？注册 →')}
        </p>

        <p class={s.footer}>Powered by weifuwu</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DepartmentChat — 部门聊天（支持 @AI Agent）
// ═══════════════════════════════════════════════════════════════

function DepartmentChat({ conversationId, agents }: { conversationId: string; agents: Agent[] }, ctx: WfuiContext) {
  const messages = signal<ChatMessage[]>([])
  const input = signal('')
  const loading = signal(true)
  const showAgentPicker = signal(false)
  const agentFilter = signal('')
  const aiStreaming = signal(false)
  const streamingText = signal('')
  const streamingAgentName = signal('')

  // 加载消息
  onMount(() => {
    ctx.api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`).then((msgs) => {
      messages.value = Array.isArray(msgs) ? msgs.slice().reverse() : []
      loading.value = false
    }).catch(() => loading.value = false)
  })

  // WebSocket 实时消息
  const unsub = ctx.ws.onMessage((raw: unknown) => {
    const data = raw as ChatMessage & { conversation_id?: string }
    if (data.conversation_id === conversationId && data.id) {
      messages.value = [...messages.value, data]
    }
  })
  onCleanup(() => unsub())

  // 过滤可 @ 的 AI Agent
  const aiAgents = agents.filter(a => a.kind === 'ai')

  // 检测输入中的 @
  const onInput = (e: any) => {
    const val = e.target.value
    input.value = val
    const lastAt = val.lastIndexOf('@')
    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === ' ')) {
      const after = val.slice(lastAt + 1)
      if (!after.includes(' ')) {
        showAgentPicker.value = true
        agentFilter.value = after
        return
      }
    }
    showAgentPicker.value = false
  }

  // @匹配的 Agent 列表
  const matchedAgents = computed(() => aiAgents.filter(a => a.name.toLowerCase().includes(agentFilter.value.toLowerCase())))

  const selectAgent = (agent: Agent) => {
    const val = input.value
    const lastAt = val.lastIndexOf('@')
    const before = val.slice(0, lastAt)
    input.value = before + '@' + agent.name + ' '
    showAgentPicker.value = false
  }

  const send = async () => {
    const text = input.value.trim()
    if (!text || aiStreaming.value) return
    input.value = ''
    showAgentPicker.value = false

    // 发送消息（服务端会通过 WebSocket 广播给所有在线成员）
    const msg = await ctx.api.post<ChatMessage>('/messages', { conversationId, body: text })
    messages.value = [...messages.value, msg]

    // 检测 @AI Agent
    const matchedAgent = aiAgents.find((a: Agent) => text.includes(`@${a.name}`))
    if (matchedAgent) {
      // 创建 AI 消息占位
      const placeholderId = 'ai-' + Date.now()
      const placeholder: ChatMessage = {
        id: placeholderId, sender_id: matchedAgent.id, sender_name: matchedAgent.name,
        body: '...', created_at: new Date().toISOString(), is_ai: true,
      }
      messages.value = [...messages.value, placeholder]

      aiStreaming.value = true
      streamingText.value = ''
      streamingAgentName.value = matchedAgent.name

      try {
        const history = messages.value.slice(-20).map(m => ({
          role: m.sender_id === ctx.user?.id ? 'user' : 'assistant',
          content: m.body.replace(/\*\*.*?\*\*:/g, '').trim(),
        }))

        const response = await fetch(`/api/agents/${matchedAgent.id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, messages: history.slice(0, -1) }),
        })

        if (!response.ok) throw new Error('AI request failed')

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No stream reader')

        const decoder = new TextDecoder()
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'text') {
                  fullText += data.content
                  streamingText.value = fullText
                } else if (data.type === 'error') {
                  console.error('AI error:', data.error)
                }
              } catch {}
            }
          }
        }

        // 更新占位消息为最终文本
        messages.value = messages.value.map(m =>
          m.id === placeholderId ? { ...m, body: streamingText.value || fullText } : m
        )
      } catch (e: any) {
        console.error('AI chat error:', e)
        messages.value = messages.value.filter(m => m.id !== placeholderId)
      } finally {
        aiStreaming.value = false
        streamingText.value = ''
      }
    }
  }

  const s = createStyles({
    container: 'flex flex-col h-full',
    msgList: 'flex-1 overflow-y-auto px-4 py-3 space-y-2',
    msgRow: 'flex',
    msgBubble: 'max-w-[70%] px-3 py-2 rounded-lg text-sm leading-relaxed',
    msgMine: 'ml-auto bg-blue-500 text-white rounded-br-sm',
    msgOther: 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm',
    msgAI: 'bg-blue-50 text-gray-800 border border-blue-100 rounded-bl-sm',
    msgName: 'text-xs text-gray-400 mb-0.5',
    inputArea: 'px-4 py-3 border-t border-gray-200 bg-white',
    inputRow: 'flex gap-2',
    input: 'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500',
    sendBtn: 'px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 disabled:opacity-50',
    picker: 'absolute bottom-full left-4 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-32 overflow-y-auto z-10',
    pickerItem: 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-100',
    streamingBar: 'px-4 py-2 bg-blue-50 border-t border-blue-100 text-sm text-blue-600 flex items-center gap-2',
    dot: 'w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse',
  })

  return (
    <div class={s.container}>
      {/* 消息列表 */}
      <div class={s.msgList}>
        <Show when={loading}>
          <p class="text-center text-gray-400 text-sm py-10">加载中...</p>
        </Show>

        <For each={messages}>
          {(msg: ChatMessage) => {
            const isMine = msg.sender_id === ctx.user?.id
            const isAI = msg.is_ai || msg.sender_name?.startsWith('**')
            return (
              <div class={`${s.msgRow} ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div>
                  <Show when={!isMine}>
                    <p class={s.msgName}>{msg.sender_name?.replace(/\*\*/g, '') || '未知'}</p>
                  </Show>
                  <div class={`${s.msgBubble} ${isMine ? s.msgMine : (isAI ? s.msgAI : s.msgOther)}`}>
                    {msg.body === '...' && isAI ? <span class="italic">思考中...</span> : msg.body}
                  </div>
                </div>
              </div>
            )
          }}
        </For>

        {/* AI 流式输出 */}
        <Show when={aiStreaming && streamingText.value}>
          <div class={s.msgRow}>
            <div>
              <p class={s.msgName}>{streamingAgentName.value}</p>
              <div class={`${s.msgBubble} ${s.msgAI}`}>
                {streamingText.value}
                <span class="inline-block w-1.5 h-4 bg-blue-500 ml-1 animate-pulse" style="animation: blink 0.8s infinite" />
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* 流式状态栏 */}
      <Show when={aiStreaming && !streamingText.value}>
        <div class={s.streamingBar}>
          <span class={s.dot} />
          <span>AI 正在思考...</span>
        </div>
      </Show>

      {/* 输入区域 */}
      <div class={s.inputArea} style="position: relative">
        <Show when={showAgentPicker && matchedAgents.value.length > 0}>
          <div class={s.picker}>
            <For each={matchedAgents}>
              {(a: Agent) => (
                <div class={s.pickerItem} onClick={() => selectAgent(a)}>
                  <span>🤖</span>
                  <span>{a.name}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div class={s.inputRow}>
          <input class={s.input}
            value={input} onInput={onInput}
            onKeyDown={(e: any) => e.key === 'Enter' && send()}
            placeholder="输入消息，@AI机器人对话..." />
          <button class={s.sendBtn} onClick={send} disabled={aiStreaming}>
            {aiStreaming ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// HomePage — 租户列表
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Skeleton — 加载骨架屏
// ═══════════════════════════════════════════════════════════════

function Skeleton({ lines = 3 }: { lines?: number }) {
  const arr = Array.from({ length: lines })
  return (
    <div class="space-y-3 p-4">
      <For each={arr}>{() => (
        <div class="h-4 bg-gray-200 rounded-md animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
      )}</For>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Toast — 全局通知
// ═══════════════════════════════════════════════════════════════

const toasts = signal<Array<{ id: number; msg: string; type: 'success' | 'error' | 'info' }>>([])
let toastId = 0

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  const id = ++toastId
  toasts.value = [...toasts.value, { id, msg, type }]
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 3000)
}

function ToastContainer() {
  const s = createStyles({
    container: 'fixed top-4 right-4 z-50 space-y-2',
    toast: 'px-4 py-2.5 rounded-lg shadow-lg text-sm text-white transition-all duration-300',
  })
  return (
    <div class={s.container}>
      <For each={toasts}>
        {(t: any) => (
          <div class={`${s.toast} ${
            t.type === 'success' ? 'bg-green-500' :
            t.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}>{t.msg}</div>
        )}
      </For>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// OnboardingWizard — 新手引导
// ═══════════════════════════════════════════════════════════════

function OnboardingWizard({ onDone }: { onDone: () => void }, _ctx: WfuiContext) {
  const step = signal(1)
  const newName = signal(''); const newSlug = signal('')
  const creating = signal(false)

  const s = createStyles({
    wrap: 'max-w-lg mx-auto mt-12 text-center',
    icon: 'text-6xl mb-4',
    title: 'text-xl font-bold mb-2',
    desc: 'text-gray-500 text-sm mb-6',
    input: 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:border-blue-500',
    btn: 'px-5 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 mx-1',
    skip: 'px-5 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-pointer hover:bg-gray-200 mx-1',
    dot: 'inline-block w-2 h-2 rounded-full mx-1',
    dotActive: 'inline-block w-2 h-2 rounded-full mx-1 bg-blue-500',
  })

  const createAndGo = async () => {
    creating.value = true
    try {
      const t = await ctx.api.post<any>('/tenants', { name: newName.value || '我的团队', slug: newSlug.value || 'my-team' })
      showToast('🎉 租户创建成功！', 'success')
      onDone()
      setTimeout(() => ctx.app.navigate(`/tenant/${t.id}`), 300)
    } catch (e: any) {
      showToast('创建失败: ' + (e?.message || '未知错误'), 'error')
    } finally {
      creating.value = false
    }
  }

  return (
    <div class={s.wrap}>
      <Show when={step.value === 1}>
        <div class={s.icon}>👋</div>
        <h2 class={s.title}>欢迎使用 Org</h2>
        <p class={s.desc}>企业级 AI 协作平台。人和 AI Agent 在同一个组织架构下协同工作。</p>
        <div class="flex gap-2 justify-center">
          <button class={s.btn} onClick={() => step.value = 2}>快速开始</button>
          <button class={s.skip} onClick={onDone}>稍后设置</button>
        </div>
      </Show>

      <Show when={step.value === 2}>
        <div class={s.icon}>🏢</div>
        <h2 class={s.title}>创建你的第一个租户</h2>
        <p class={s.desc}>租户是组织的最高层级，包含公司、部门和成员。</p>
        <input class={s.input} value={newName} onInput={(e: any) => newName.value = e.target.value} placeholder="租户名称（如：我的公司）" />
        <input class={s.input} value={newSlug} onInput={(e: any) => newSlug.value = e.target.value} placeholder="标识（如：my-company）" />
        <button class={s.btn} onClick={createAndGo} disabled={creating.value}>
          {creating.value ? '创建中...' : '🚀 创建并开始'}
        </button>
      </Show>

      <div class="mt-6">
        <span class={step.value === 1 ? s.dotActive : s.dot} />
        <span class={step.value === 2 ? s.dotActive : s.dot} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// HomePage — 租户列表（带新手引导）
// ═══════════════════════════════════════════════════════════════

function HomePage(_props: {}, ctx: WfuiContext) {
  const tenants = signal<Tenant[]>([]); const loading = signal(true); const showCreate = signal(false)
  const newName = signal(''); const newSlug = signal(''); const showOnboarding = signal(false)
  const loadError = signal('')

  onMount(() => {
    ctx.api.get<Tenant[]>('/tenants').then(list => {
      tenants.value = list
      loading.value = false
      if (list.length === 0) showOnboarding.value = true
    }).catch((e: any) => {
      loading.value = false
      loadError.value = e?.message || '加载失败'
    })
  })

  const createTenant = async () => {
    try {
      const t = await ctx.api.post<Tenant>('/tenants', { name: newName.value, slug: newSlug.value })
      tenants.value = [...tenants.value, t]; showCreate.value = false; newName.value = ''; newSlug.value = ''
      showToast('租户创建成功！', 'success')
    } catch (e: any) {
      showToast('创建失败: ' + (e?.message || '未知错误'), 'error')
    }
  }

  const s = createStyles({
    page: 'p-8',
    header: 'flex items-center justify-between mb-6',
    title: 'text-2xl font-bold',
    subtitle: 'text-gray-500 text-sm',
    card: 'bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow',
  })

  return (
    <div class={s.page}>
      {/* 新手引导 — 用 Show 响应式切换 */}
      <Show when={showOnboarding}>
        <OnboardingWizard onDone={() => { showOnboarding.value = false }} ctx={ctx} />
      </Show>

      {/* 主视图 — 当不在引导模式时显示 */}
      <Show when={computed(() => !showOnboarding.value)}>
        <div class={s.header}>
          <div>
            <h1 class={s.title}>Org</h1>
            <p class={s.subtitle}>Enterprise AI Collaboration Platform</p>
          </div>
          <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600"
            onClick={() => showCreate.value = true}>+ 创建租户</button>
        </div>

        {/* 加载态 */}
        <Show when={loading}><Skeleton lines={4} /></Show>

        {/* 错误提示 */}
        <Show when={loadError}>
          <div class="bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm">
            加载失败: {loadError}
            <button class="ml-2 underline cursor-pointer" onClick={() => { loading.value = true; loadError.value = ''; ctx.api.get('/tenants').then(l => { tenants.value = l; loading.value = false; if (l.length === 0) showOnboarding.value = true }).catch(e => { loading.value = false; loadError.value = e.message }) }}>重试</button>
          </div>
        </Show>

        {/* 创建租户弹窗 */}
        <Modal show={showCreate.value} onClose={() => showCreate.value = false} title="创建租户">
          <label class="text-xs text-gray-500 block mb-1">名称</label>
          <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:border-blue-500"
            value={newName} onInput={(e: any) => newName.value = e.target.value} placeholder="例如: 我的公司" />
          <label class="text-xs text-gray-500 block mb-1">标识（slug）</label>
          <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:border-blue-500"
            value={newSlug} onInput={(e: any) => newSlug.value = e.target.value} placeholder="例如: my-company" />
          <div class="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => showCreate.value = false}>取消</Button>
            <Button onClick={createTenant}>创建</Button>
          </div>
        </Modal>

        {/* 租户列表 */}
        <div class="grid gap-4">
          <For each={tenants}>
            {(t: Tenant) => (
              <div class={s.card} onClick={() => ctx.app.navigate(`/tenant/${t.id}`)}>
                <h3 class="font-semibold text-lg">{t.name}</h3>
                <p class="text-gray-400 text-sm mt-1">/{t.slug}</p>
                <p class="text-gray-300 text-xs mt-2">创建于 {formatDate(t.created_at)}</p>
              </div>
            )}
          </For>
        </div>

        {/* 空态 */}
        <Show when={computed(() => !loading.value && tenants.value.length === 0)}>
          <div class="text-center py-16 text-gray-400">
            <p class="text-5xl mb-3">🏢</p>
            <p class="mb-4">还没有租户，开始创建第一个</p>
            <button class="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600"
              onClick={() => showCreate.value = true}>+ 创建租户</button>
          </div>
        </Show>
      </Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TenantPage — 公司列表
// ═══════════════════════════════════════════════════════════════

function TenantPage(_props: {}, ctx: WfuiContext) {
  const { tenantId } = ctx.route.params
  const tenant = signal<Tenant | null>(null); const companies = signal<Company[]>([]); const loading = signal(true)
  const showCreate = signal(false); const newName = signal('')

  onMount(() => {
    Promise.all([
      ctx.api.get<Tenant>(`/tenants/${tenantId}`).then(t => tenant.value = t),
      ctx.api.get<Company[]>(`/tenants/${tenantId}/companies`).then(list => companies.value = list),
    ]).finally(() => loading.value = false)
  })

  const createCompany = async () => {
    try {
      const c = await ctx.api.post<Company>(`/tenants/${tenantId}/companies`, { name: newName.value })
      companies.value = [...companies.value, c]; showCreate.value = false; newName.value = ''
      showToast('公司创建成功！', 'success')
    } catch (e: any) { showToast('创建失败: ' + (e?.message || '未知错误'), 'error') }
  }

  return (
    <div class="p-8">
      <div class="mb-6">
        <p class="text-sm text-blue-500 cursor-pointer mb-1" onClick={() => ctx.app.navigate('/')}>← 返回</p>
        <div class="flex items-center justify-between">
          <div><h1 class="text-2xl font-bold">{computed(() => tenant.value?.name || '加载中...')}</h1></div>
          <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600"
            onClick={() => showCreate.value = true}>+ 创建公司</button>
        </div>
      </div>
      <Show when={loading}><p class="text-gray-400 text-center py-10">加载中...</p></Show>
      {/* 创建公司弹窗 */}
      <Modal show={showCreate.value} onClose={() => showCreate.value = false} title="创建公司">
        <label class="text-xs text-gray-500 block mb-1">公司名称</label>
        <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" value={newName}
          onInput={(e: any) => newName.value = e.target.value} placeholder="例如: Engineering" />
        <div class="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => showCreate.value = false}>取消</Button>
          <Button onClick={createCompany}>创建</Button>
        </div>
      </Modal>
      <For each={companies}>
        {(c: Company) => (
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow mb-4"
            onClick={() => ctx.app.navigate(`/tenant/${tenantId}/company/${c.id}`)}>
            <h3 class="font-semibold text-lg">{c.name}</h3>
          </div>
        )}
      </For>
      <Show when={!loading && companies.value.length === 0}>
        <div class="text-center py-16 text-gray-400"><p class="text-5xl mb-3">🏗️</p><p>还没有公司</p></div>
      </Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CompanyPage — 部门列表
// ═══════════════════════════════════════════════════════════════

function CompanyPage(_props: {}, ctx: WfuiContext) {
  const { tenantId, companyId } = ctx.route.params
  const company = signal<Company | null>(null); const departments = signal<Department[]>([]); const loading = signal(true)
  const showCreate = signal(false); const newName = signal(''); const newDesc = signal('')

  onMount(() => {
    Promise.all([
      ctx.api.get<Company>(`/companies/${companyId}`).then(c => company.value = c),
      ctx.api.get<Department[]>(`/companies/${companyId}/departments`).then(list => departments.value = list),
    ]).finally(() => loading.value = false)
  })

  const createDepartment = async () => {
    try {
      const d = await ctx.api.post<Department>(`/companies/${companyId}/departments`, { name: newName.value, description: newDesc.value || undefined })
      departments.value = [...departments.value, d]; showCreate.value = false; newName.value = ''; newDesc.value = ''
      showToast('部门创建成功！已自动创建聊天会话。', 'success')
    } catch (e: any) { showToast('创建失败: ' + (e?.message || '未知错误'), 'error') }
  }

  return (
    <div class="p-8">
      <div class="mb-6">
        <p class="text-sm text-blue-500 cursor-pointer mb-1" onClick={() => ctx.app.navigate(`/tenant/${tenantId}`)}>← 返回</p>
        <div class="flex items-center justify-between">
          <div><h1 class="text-2xl font-bold">{computed(() => company.value?.name || '加载中...')}</h1></div>
          <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600"
            onClick={() => showCreate.value = true}>+ 创建部门</button>
        </div>
      </div>
      <Show when={loading}><p class="text-gray-400 text-center py-10">加载中...</p></Show>
      {/* 创建部门弹窗 */}
      <Modal show={showCreate.value} onClose={() => showCreate.value = false} title="创建部门">
        <label class="text-xs text-gray-500 block mb-1">部门名称</label>
        <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" value={newName}
          onInput={(e: any) => newName.value = e.target.value} placeholder="例如: AI Team" />
        <label class="text-xs text-gray-500 block mb-1">描述（可选）</label>
        <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4" value={newDesc}
          onInput={(e: any) => newDesc.value = e.target.value} placeholder="部门的职责" />
        <div class="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => showCreate.value = false}>取消</Button>
          <Button onClick={createDepartment}>创建</Button>
        </div>
      </Modal>
      <For each={departments}>
        {(d: Department) => (
          <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow mb-4"
            onClick={() => ctx.app.navigate(`/tenant/${tenantId}/company/${companyId}/dept/${d.id}`)}>
            <div class="flex items-center justify-between">
              <div><h3 class="font-semibold text-lg">{d.name}</h3>
                <Show when={d.description}><p class="text-gray-400 text-sm mt-1">{d.description}</p></Show></div>
              <Show when={d.agent_count !== undefined}><span class="text-sm text-gray-300">{d.agent_count} 成员</span></Show>
            </div>
          </div>
        )}
      </For>
      <Show when={!loading && departments.value.length === 0}>
        <div class="text-center py-16 text-gray-400"><p class="text-5xl mb-3">💬</p><p>还没有部门</p></div>
      </Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DepartmentPage — 聊天 + Agent 管理
// ═══════════════════════════════════════════════════════════════

interface KBDoc { id: string; title: string; source: string | null; chunk_count: number; created_at: string }

type SideTab = 'members' | 'kb' | null

function DepartmentPage(_props: {}, ctx: WfuiContext) {
  const { tenantId, companyId, deptId } = ctx.route.params
  const dept = signal<Department | null>(null); const agents = signal<Agent[]>([])
  const activeTab = signal<SideTab>(null); const showAddAgent = signal(false)
  const allAgents = signal<Agent[]>([]); const selectedAgentId = signal('')

  // 知识库状态
  const kbDocs = signal<KBDoc[]>([]); const kbLoading = signal(false)
  const importTitle = signal(''); const importContent = signal(''); const importSource = signal('')
  const searchQuery = signal(''); const searchResults = signal<any[]>([])

  onMount(async () => {
    const [d, ag] = await Promise.all([
      ctx.api.get<Department>(`/departments/${deptId}`),
      ctx.api.get<Agent[]>(`/departments/${deptId}/agents`),
    ])
    dept.value = d; agents.value = ag
  })

  // ── Agent 管理 ──

  const openAddAgent = async () => {
    showAddAgent.value = true
    allAgents.value = await ctx.api.get<Agent[]>('/agents')
  }

  const addAgent = async () => {
    if (!selectedAgentId.value) return
    try {
      await ctx.api.post(`/departments/${deptId}/agents`, { agentId: selectedAgentId.value, role: 'member' })
      agents.value = await ctx.api.get<Agent[]>(`/departments/${deptId}/agents`)
      showAddAgent.value = false; selectedAgentId.value = ''
      showToast('Agent 已加入部门', 'success')
    } catch (e: any) { showToast('添加失败: ' + (e?.message || '未知错误'), 'error') }
  }

  // ── 知识库 ──

  const loadKBDocs = async () => {
    kbLoading.value = true
    kbDocs.value = await ctx.api.get<KBDoc[]>(`/departments/${deptId}/kb/documents`)
    kbLoading.value = false
  }

  const importDoc = async () => {
    if (!importTitle.value || !importContent.value) return
    try {
      await ctx.api.post(`/departments/${deptId}/kb/import`, {
        title: importTitle.value,
        content: importContent.value,
        source: importSource.value || undefined,
      })
      importTitle.value = ''; importContent.value = ''; importSource.value = ''
      await loadKBDocs()
      showToast('文档已导入知识库 ✓', 'success')
    } catch (e: any) { showToast('导入失败: ' + (e?.message || '未知错误'), 'error') }
  }

  const searchKB = async () => {
    if (!searchQuery.value) return
    searchResults.value = await ctx.api.post<any[]>(`/departments/${deptId}/kb/search`, { query: searchQuery.value })
  }

  const setTab = (tab: SideTab) => {
    activeTab.value = activeTab.value === tab ? null : tab
    if (tab === 'kb' && kbDocs.value.length === 0) loadKBDocs()
  }

  const tabs: Array<{ key: SideTab; label: string; icon: string }> = [
    { key: 'members', label: `成员 (${agents.value.length})`, icon: '👥' },
    { key: 'kb', label: '知识库', icon: '📚' },
  ]

  const s = createStyles({
    container: 'flex flex-col h-full',
    header: 'px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-white shrink-0',
    body: 'flex-1 flex overflow-hidden',
    panel: 'w-72 border-l border-gray-200 bg-gray-50 overflow-y-auto shrink-0 flex flex-col',
    tabBar: 'flex border-b border-gray-200 shrink-0',
    tab: 'flex-1 px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer text-center hover:bg-gray-100 transition-colors',
    tabActive: 'flex-1 px-3 py-2 text-xs font-medium text-blue-600 cursor-pointer text-center bg-white border-b-2 border-blue-500 transition-colors',
    panelBody: 'flex-1 overflow-y-auto',
    panelSection: 'p-3 border-b border-gray-200',
    panelTitle: 'text-xs font-semibold text-gray-500 uppercase mb-2',
    agentItem: 'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-200 cursor-pointer',
    kbItem: 'px-2 py-2 border-b border-gray-100 text-sm',
    input: 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2 focus:outline-none focus:border-blue-500',
    textarea: 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2 h-16 focus:outline-none focus:border-blue-500',
    btnPrimary: 'px-3 py-1.5 bg-blue-500 text-white rounded text-xs cursor-pointer hover:bg-blue-600',
    searchResult: 'px-2 py-2 border-b border-blue-100 text-xs text-gray-600',
  })

  return (
    <div class={s.container}>
      {/* 头部 */}
      <div class={s.header}>
        <div>
          <p class="text-xs text-blue-500 cursor-pointer mb-1"
            onClick={() => ctx.app.navigate(`/tenant/${tenantId}/company/${companyId}`)}>← 返回公司</p>
          <h1 class="font-semibold text-base">{computed(() => dept.value?.name || '加载中...')}</h1>
        </div>
        <div class="flex gap-1">
          <For each={tabs}>
            {(tab: typeof tabs[0]) => (
              <button class={activeTab.value === tab.key ? s.tabActive : s.tab}
                onClick={() => setTab(tab.key)}>
                {tab.icon} {tab.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class={s.body}>
        {/* 聊天区域 */}
        <div class="flex-1 flex flex-col min-w-0">
          <Show when={dept.value?.conversation_id} fallback={
            <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">部门还没有聊天会话</div>
          }>
            <DepartmentChat conversationId={dept.value!.conversation_id!} agents={agents.value} />
          </Show>
        </div>

        {/* 右侧面板（Tab 切换）*/}
        <Show when={activeTab.value}>
          <div class={s.panel}>
            {/* Tab 栏 */}
            <div class={s.tabBar}>
              <For each={tabs}>
                {(tab: typeof tabs[0]) => (
                  <div class={activeTab.value === tab.key ? s.tabActive : s.tab}
                    onClick={() => setTab(tab.key)}>
                    {tab.icon} {tab.label}
                  </div>
                )}
              </For>
            </div>

            {/* Tab: 成员 */}
            <Show when={activeTab.value === 'members'}>
              <div class={s.panelBody}>
                <div class={s.panelSection}>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class={s.panelTitle}>部门成员</h3>
                    <button class="text-xs text-blue-500 cursor-pointer hover:text-blue-700" onClick={openAddAgent}>+ 添加</button>
                  </div>
                  <For each={agents}>
                    {(a: Agent) => (
                      <div class={s.agentItem}>
                        <span>{a.kind === 'ai' ? '🤖' : a.kind === 'user' ? '👤' : a.kind === 'webhook' ? '🔗' : '📚'}</span>
                        <span>{a.name}</span>
                        <span class="text-xs text-gray-400 ml-auto">{a.kind}</span>
                      </div>
                    )}
                  </For>
                  <Show when={agents.value.length === 0}><p class="text-xs text-gray-400 text-center py-4">暂无成员</p></Show>
                </div>
                <Show when={showAddAgent}>
                  <div class={s.panelSection}>
                    <select class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2"
                      value={selectedAgentId} onChange={(e: any) => selectedAgentId.value = e.target.value}>
                      <option value="">选择 Agent...</option>
                      <For each={allAgents}>{(a: Agent) => <option value={a.id}>{a.name} ({a.kind})</option>}</For>
                    </select>
                    <div class="flex gap-2">
                      <button class="flex-1 px-2 py-1 bg-blue-500 text-white rounded text-xs cursor-pointer hover:bg-blue-600" onClick={addAgent}>添加</button>
                      <button class="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs cursor-pointer" onClick={() => showAddAgent.value = false}>取消</button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Tab: 知识库 */}
            <Show when={activeTab.value === 'kb'}>
              <div class={s.panelBody}>
                <div class={s.panelSection}>
                  <h3 class={s.panelTitle}>导入知识</h3>
                  <input class={s.input} value={importTitle} onInput={(e: any) => importTitle.value = e.target.value} placeholder="标题" />
                  <textarea class={s.textarea} value={importContent} onInput={(e: any) => importContent.value = e.target.value} placeholder="粘贴文档内容..." />
                  <input class={s.input} value={importSource} onInput={(e: any) => importSource.value = e.target.value} placeholder="来源（可选）" />
                  <button class={s.btnPrimary} onClick={importDoc}>导入</button>
                </div>
                <div class={s.panelSection}>
                  <h3 class={s.panelTitle}>检索测试</h3>
                  <div class="flex gap-1 mb-2">
                    <input class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                      value={searchQuery} onInput={(e: any) => searchQuery.value = e.target.value}
                      placeholder="输入查询..." onKeyDown={(e: any) => e.key === 'Enter' && searchKB()} />
                    <button class={s.btnPrimary} onClick={searchKB}>搜索</button>
                  </div>
                  <For each={searchResults}>
                    {(r: any) => <div class={s.searchResult}><strong>{r.title || '片段'}</strong> ({Math.round(r.score * 100)}%): {r.content.slice(0, 80)}...</div>}
                  </For>
                </div>
                <div class={s.panelSection}>
                  <h3 class={s.panelTitle}>{computed(() => `文档 (${kbDocs.value.length})`)}</h3>
                  <Show when={kbLoading}><p class="text-xs text-gray-400 text-center py-2">加载中...</p></Show>
                  <For each={kbDocs}>
                    {(doc: KBDoc) => (
                      <div class={s.kbItem}>
                        <p class="font-medium">{doc.title}</p>
                        <p class="text-gray-400">{doc.chunk_count} 段 · {doc.source || '无来源'}</p>
                      </div>
                    )}
                  </For>
                  <Show when={!kbLoading && kbDocs.value.length === 0}>
                    <p class="text-xs text-gray-400 text-center py-2">暂无文档</p>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NotFound
// ═══════════════════════════════════════════════════════════════

function NotFound(_props: {}, ctx: WfuiContext) {
  return (
    <div class="text-center py-20">
      <h1 class="text-5xl text-gray-300 font-bold">404</h1>
      <p class="my-3 text-gray-400">页面未找到</p>
      <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer" onClick={() => ctx.app.navigate('/')}>回首页</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// OrgTree — 左侧组织树
// ═══════════════════════════════════════════════════════════════

function OrgTree(_props: {}, ctx: WfuiContext) {
  const tenants = signal<Tenant[]>([]); const expanded = signal<Record<string, boolean>>({})
  const companiesMap = signal<Record<string, Company[]>>({}); const departmentsMap = signal<Record<string, Department[]>>({})
  const loading = signal(true)
  const error = signal('')

  onMount(async () => {
    try {
      const list = await ctx.api.get<Tenant[]>('/tenants')
      tenants.value = list; loading.value = false
      if (list.length > 0) { expanded.value = { ...expanded.value, [list[0].id]: true }; await loadCompanies(list[0].id) }
    } catch (e: any) {
      loading.value = false
      error.value = e?.message || '加载失败'
    }
  })

  const loadCompanies = async (id: string) => {
    if (companiesMap.value[id]) return
    companiesMap.value = { ...companiesMap.value, [id]: await ctx.api.get<Company[]>(`/tenants/${id}/companies`) }
  }
  const loadDepartments = async (id: string) => {
    if (departmentsMap.value[id]) return
    departmentsMap.value = { ...departmentsMap.value, [id]: await ctx.api.get<Department[]>(`/companies/${id}/departments`) }
  }

  const toggleTenant = async (id: string) => {
    expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
    if (expanded.value[id]) await loadCompanies(id)
  }
  const toggleCompany = async (tid: string, cid: string) => {
    const k = `c:${cid}`; expanded.value = { ...expanded.value, [k]: !expanded.value[k] }
    if (expanded.value[k]) await loadDepartments(cid)
    ctx.app.navigate(`/tenant/${tid}/company/${cid}`)
  }

  const active = (p: string) => window.location.hash.includes(p)

  const s = createStyles({
    tree: 'flex-1 overflow-y-auto p-2',
    th: 'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer',
    thA: 'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium text-blue-600 cursor-pointer bg-blue-50',
    ci: 'flex items-center gap-1.5 px-2 py-1 ml-4 rounded-md text-sm text-gray-600 cursor-pointer hover:bg-gray-200',
    ciA: 'flex items-center gap-1.5 px-2 py-1 ml-4 rounded-md text-sm text-blue-600 cursor-pointer bg-blue-50',
    di: 'flex items-center gap-1.5 px-2 py-1 ml-8 rounded-md text-sm text-gray-500 cursor-pointer hover:bg-gray-200',
    diA: 'flex items-center gap-1.5 px-2 py-1 ml-8 rounded-md text-sm text-blue-500 cursor-pointer bg-blue-50',
  })

  return (
    <div class={s.tree}>
      <Show when={loading}><p class="text-xs text-gray-400 text-center py-4">加载中...</p></Show>
      <Show when={error}><p class="text-xs text-red-400 text-center py-4">{error}</p></Show>
      <For each={tenants}>
        {(t: Tenant) => (
          <div class="mb-2">
            <div class={active(`/tenant/${t.id}`) && !active('/company/') ? s.thA : `${s.th} text-gray-700 hover:bg-gray-200`}
              onClick={() => { toggleTenant(t.id); ctx.app.navigate(`/tenant/${t.id}`) }}>
              <span>{expanded.value[t.id] ? '▼' : '▶'}</span><span>🏢</span><span>{t.name}</span>
            </div>
            <Show when={expanded.value[t.id] && companiesMap.value[t.id]}>
              <For each={companiesMap.value[t.id] || []}>
                {(c: Company) => (
                  <div>
                    <div class={active(`/company/${c.id}`) ? s.ciA : s.ci}
                      onClick={() => toggleCompany(t.id, c.id)}>
                      <span>{expanded.value[`c:${c.id}`] ? '▼' : '▶'}</span><span>🏗️</span><span>{c.name}</span>
                    </div>
                    <Show when={expanded.value[`c:${c.id}`] && departmentsMap.value[c.id]}>
                      <For each={departmentsMap.value[c.id] || []}>
                        {(d: Department) => (
                          <div class={active(`/dept/${d.id}`) ? s.diA : s.di}
                            onClick={() => ctx.app.navigate(`/tenant/${t.id}/company/${c.id}/dept/${d.id}`)}>
                            <span>💬</span><span>{d.name}</span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        )}
      </For>
      <Show when={!loading && tenants.value.length === 0}>
        <p class="text-xs text-gray-400 text-center py-4">还没有租户</p>
      </Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AppShell — 全局布局
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Layout — 布局组件
// ═══════════════════════════════════════════════════════════════

// ── Sidebar — 通用左侧面板 ──

function Sidebar(_props: {}, ctx: WfuiContext) {
  const searchQuery = signal('')
  const recentConvs = signal<EnrichedConversation[]>([])
  const showOrgTree = signal(true)

  onMount(() => {
    ctx.api.get<EnrichedConversation[]>('/conversations').then(list => {
      recentConvs.value = list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5)
    }).catch(() => {})
  })

  const s = createStyles({
    wrap: 'w-[220px] border-r border-gray-200 bg-[#fafafa] flex flex-col overflow-hidden shrink-0',
    header: 'px-3 py-2.5 border-b border-gray-200 flex items-center justify-between shrink-0',
    title: 'font-bold text-sm text-blue-600 cursor-pointer',
    userName: 'text-xs text-gray-400 max-w-[100px] truncate',
    searchBox: 'mx-2 my-2 px-2.5 py-1.5 bg-gray-100 rounded-md text-xs text-gray-400 cursor-text focus:outline-none focus:bg-white focus:border focus:border-blue-300',
    section: 'mb-1',
    sectionHeader: 'px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-700',
    recentItem: 'flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-md mx-2 cursor-pointer truncate',
    recentItemActive: 'flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 rounded-md mx-2 cursor-pointer truncate',
    recentBadge: 'ml-auto bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px]',
    status: 'px-3 py-2 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between shrink-0',
    logout: 'cursor-pointer hover:text-red-500',
  })

  return (
    <div class={s.wrap}>
      {/* 头部 */}
      <div class={s.header}>
        <span class={s.title} onClick={() => ctx.app.navigate('/')}>Org</span>
        <span class={s.userName}>{computed(() => ctx.user?.name || '')}</span>
      </div>

      {/* 搜索框 */}
      <div class={s.searchBox} onClick={() => {/* 后续实现搜索 */}}>
        🔍 搜索租户/部门/消息...
      </div>

      {/* 最近会话 */}
      <Show when={recentConvs.value.length > 0}>
        <div class={s.section}>
          <div class={s.sectionHeader}>
            <span>最近</span>
          </div>
          <For each={recentConvs}>
            {(c: EnrichedConversation) => {
              const isActive = ctx.route.path.includes(c.department?.id || '')
              return (
                <div class={isActive ? s.recentItemActive : s.recentItem}
                  onClick={() => {
                    if (c.department) {
                      // 找到对应的 tenant 和 company
                      ctx.app.navigate(`/tenant/${ctx.route.params.tenantId || ''}/company/${ctx.route.params.companyId || ''}/dept/${c.department.id}`)
                    }
                  }}>
                  <span>{c.unread > 0 ? '💬' : '💭'}</span>
                  <span class="flex-1 truncate">{c.department?.name || c.title}</span>
                  <Show when={c.unread > 0}>
                    <span class={s.recentBadge}>{c.unread > 99 ? '99+' : c.unread}</span>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      {/* 组织树（可折叠）*/}
      <div class={s.section}>
        <div class={s.sectionHeader} onClick={() => showOrgTree.value = !showOrgTree.value}>
          <span>{showOrgTree.value ? '▼' : '▶'} 组织</span>
        </div>
        <Show when={showOrgTree}>
          <OrgTree _props={{}} ctx={ctx} />
        </Show>
      </div>

      <div class="flex-1" />
      <div class={s.status}>
        <span>v0.1</span>
        <span class={s.logout} onClick={() => ctx.logout()}>退出</span>
      </div>
    </div>
  )
}

// ── BrowseLayout — 侧栏 + 内容 ──

function BrowseLayout(_props: {}, ctx: WfuiContext) {
  return (
    <div class="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar _props={{}} ctx={ctx} />
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <RouteView />
      </div>
    </div>
  )
}

// ── ConversationList — 中间会话列表栏 ──

interface EnrichedConversation {
  id: string
  title: string | null
  department: { id: string; name: string } | null
  last_message?: { body: string; created_at: string } | null
  unread: number
  updated_at: string
}

function ConversationList(_props: {}, ctx: WfuiContext) {
  const convs = signal<EnrichedConversation[]>([])
  const loading = signal(true)
  const currentDeptId = computed(() => ctx.route.params.deptId || '')

  onMount(() => {
    ctx.api.get<EnrichedConversation[]>('/conversations').then(list => {
      convs.value = list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      loading.value = false
    }).catch(() => loading.value = false)
  })

  const s = createStyles({
    wrap: 'w-[240px] border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0',
    header: 'px-4 py-3 border-b border-gray-100 shrink-0',
    title: 'text-xs font-semibold text-gray-500 uppercase',
    list: 'flex-1 overflow-y-auto',
    item: 'flex items-center gap-2 px-4 py-2.5 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors',
    itemActive: 'flex items-center gap-2 px-4 py-2.5 cursor-pointer border-b border-gray-50 bg-blue-50 border-l-2 border-l-blue-500 transition-colors',
    deptName: 'text-sm font-medium truncate',
    deptNameActive: 'text-sm font-medium truncate text-blue-700',
    preview: 'text-xs text-gray-400 truncate mt-0.5',
    badge: 'ml-auto bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1',
    time: 'text-xs text-gray-300 ml-auto',
    icon: 'text-base shrink-0',
  })

  return (
    <div class={s.wrap}>
      <div class={s.header}>
        <h2 class={s.title}>部门聊天</h2>
      </div>
      <div class={s.list}>
        <Show when={loading}>
          <p class="text-xs text-gray-400 text-center py-8">加载中...</p>
        </Show>
        <For each={convs}>
          {(c: EnrichedConversation) => {
            const isActive = c.department?.id === currentDeptId.value
            return (
              <div class={isActive ? s.itemActive : s.item}
                onClick={() => c.department && ctx.app.navigate(`/tenant/${ctx.route.params.tenantId || ''}/company/${ctx.route.params.companyId || ''}/dept/${c.department.id}`)}>
                <span class={s.icon}>{c.unread > 0 ? '💬' : '💭'}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class={isActive ? s.deptNameActive : s.deptName}>{c.department?.name || c.title || '未知'}</span>
                    <span class={s.time}>{c.last_message ? new Date(c.last_message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                  <p class={s.preview}>{c.last_message?.body?.slice(0, 40) || '暂无消息'}</p>
                </div>
                <Show when={c.unread > 0}>
                  <span class={s.badge}>{c.unread > 99 ? '99+' : c.unread}</span>
                </Show>
              </div>
            )
          }}
        </For>
        <Show when={!loading && convs.value.length === 0}>
          <p class="text-xs text-gray-400 text-center py-8">暂无会话</p>
        </Show>
      </div>
    </div>
  )
}

// ── ChatLayout — 侧栏 + 会话列表 + 聊天内容 ──

function ChatLayout(_props: {}, ctx: WfuiContext) {
  return (
    <div class="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar _props={{}} ctx={ctx} />
      <ConversationList _props={{}} ctx={ctx} />
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <RouteView />
      </div>
    </div>
  )
}

// ── AppShell — 登录态 + 布局选择器 ──

function AppShell(_props: {}, ctx: WfuiContext) {
  const user = computed(() => ctx.user)
  const isLoggedIn = computed(() => !!user.value)
  const isChat = computed(() => ctx.route.path.includes('/dept/'))

  return (
    <div>
      <ToastContainer />
      <Show when={isLoggedIn} fallback={<LoginPage _props={{}} ctx={ctx} />}>
        <Show when={isChat} fallback={<BrowseLayout _props={{}} ctx={ctx} />}>
          <ChatLayout _props={{}} ctx={ctx} />
        </Show>
      </Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 路由 + 启动
// ═══════════════════════════════════════════════════════════════

const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: 'Org 首页' },
  { path: '/tenant/:tenantId', component: TenantPage, title: '租户' },
  { path: '/tenant/:tenantId/company/:companyId', component: CompanyPage, title: '公司' },
  { path: '/tenant/:tenantId/company/:companyId/dept/:deptId', component: DepartmentPage, title: '部门' },
]

const app = createApp()
app.use(api())
app.use(auth({ loginPath: '/login', registerPath: '/register', mePath: '/me' }))
app.use(ws())
app.use(router({ routes, notFound: NotFound, mode: 'hash', transition: 'page' }))

app.mount('#root', AppShell)
