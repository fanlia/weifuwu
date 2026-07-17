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
// LoginPage — 登录/注册
// ═══════════════════════════════════════════════════════════════

function LoginPage(_props: {}, ctx: WfuiContext) {
  const email = signal(''); const password = signal(''); const name = signal('')
  const isRegister = signal(false); const error = signal('')

  const submit = async () => {
    error.value = ''
    try {
      if (isRegister.value) await ctx.auth.register?.(email.value, password.value, name.value)
      else await ctx.auth.login?.(email.value, password.value)
    } catch (e: any) { error.value = e?.message || '操作失败' }
  }

  return (
    <div class="flex items-center justify-center min-h-screen bg-gray-50">
      <div class="bg-white rounded-xl p-8 shadow-md w-full max-w-sm">
        <h1 class="text-2xl font-bold text-center mb-2">Org</h1>
        <p class="text-gray-400 text-sm text-center mb-6">Enterprise AI Collaboration</p>

        <Show when={isRegister}>
          <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:border-blue-500"
            value={name} onInput={(e: any) => name.value = e.target.value} placeholder="昵称" />
        </Show>
        <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:border-blue-500"
          value={email} onInput={(e: any) => email.value = e.target.value} placeholder="邮箱" type="email" />
        <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4 focus:outline-none focus:border-blue-500"
          value={password} onInput={(e: any) => password.value = e.target.value}
          placeholder="密码" type="password" onKeyDown={(e: any) => e.key === 'Enter' && submit()} />

        <Show when={error}><p class="text-red-500 text-xs mb-3">{error}</p></Show>
        <button class="w-full py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600 mb-3"
          onClick={submit}>{computed(() => isRegister.value ? '注册' : '登录')}</button>
        <p class="text-center text-xs text-gray-400 cursor-pointer hover:text-blue-500"
          onClick={() => { isRegister.value = !isRegister.value; error.value = '' }}>
          {computed(() => isRegister.value ? '已有账号？登录' : '没有账号？注册')}</p>
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
    ctx.api.get<ChatMessage[]>(`/api/conversations/${conversationId}/messages`).then((msgs) => {
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
    const msg = await ctx.api.post<ChatMessage>('/api/messages', { conversationId, body: text })
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
      const t = await ctx.api.post<any>('/api/tenants', { name: newName.value || '我的团队', slug: newSlug.value || 'my-team' })
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

  onMount(() => {
    ctx.api.get<Tenant[]>('/api/tenants').then(list => {
      tenants.value = list
      loading.value = false
      if (list.length === 0) showOnboarding.value = true
    }).catch(() => loading.value = false)
  })

  const createTenant = async () => {
    try {
      const t = await ctx.api.post<Tenant>('/api/tenants', { name: newName.value, slug: newSlug.value })
      tenants.value = [...tenants.value, t]; showCreate.value = false; newName.value = ''; newSlug.value = ''
      showToast('租户创建成功！', 'success')
    } catch (e: any) {
      showToast('创建失败: ' + (e?.message || '未知错误'), 'error')
    }
  }

  // 新手引导模式（没有租户时自动显示）
  if (showOnboarding.value) {
    return <OnboardingWizard onDone={() => { showOnboarding.value = false; loading.value = false }} ctx={ctx} />
  }

  return (
    <div class="p-8">
      <div class="flex items-center justify-between mb-6">
        <div><h1 class="text-2xl font-bold">Org</h1><p class="text-gray-500 text-sm">Enterprise AI Collaboration Platform</p></div>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600"
          onClick={() => showCreate.value = true}>+ 创建租户</button>
      </div>

      <Show when={loading}><Skeleton lines={4} /></Show>

      <Show when={showCreate}>
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 flex gap-3 items-end">
          <div class="flex-1"><label class="text-xs text-gray-500 block mb-1">名称</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
              value={newName} onInput={(e: any) => newName.value = e.target.value} placeholder="例如: 我的公司" /></div>
          <div class="flex-1"><label class="text-xs text-gray-500 block mb-1">标识（slug）</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
              value={newSlug} onInput={(e: any) => newSlug.value = e.target.value} placeholder="例如: my-company" /></div>
          <button class="px-4 py-2 bg-green-500 text-white rounded-md text-sm cursor-pointer hover:bg-green-600" onClick={createTenant}>创建</button>
          <button class="px-4 py-2 bg-gray-200 text-gray-600 rounded-md text-sm cursor-pointer hover:bg-gray-300" onClick={() => showCreate.value = false}>取消</button>
        </div>
      </Show>

      <div class="grid gap-4">
        <For each={tenants}>
          {(t: Tenant) => (
            <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => ctx.app.navigate(`/tenant/${t.id}`)}>
              <h3 class="font-semibold text-lg">{t.name}</h3>
              <p class="text-gray-400 text-sm mt-1">/{t.slug}</p>
              <p class="text-gray-300 text-xs mt-2">创建于 {formatDate(t.created_at)}</p>
            </div>
          )}
        </For>
      </div>

      <Show when={!loading && tenants.value.length === 0 && !showOnboarding.value}>
        <div class="text-center py-16 text-gray-400">
          <p class="text-5xl mb-3">🏢</p>
          <p class="mb-4">还没有租户，开始创建第一个</p>
          <button class="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600"
            onClick={() => showOnboarding.value = true}>📖 开始引导</button>
        </div>
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
      ctx.api.get<Tenant>(`/api/tenants/${tenantId}`).then(t => tenant.value = t),
      ctx.api.get<Company[]>(`/api/tenants/${tenantId}/companies`).then(list => companies.value = list),
    ]).finally(() => loading.value = false)
  })

  const createCompany = async () => {
    try {
      const c = await ctx.api.post<Company>(`/api/tenants/${tenantId}/companies`, { name: newName.value })
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
      <Show when={showCreate}>
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 flex gap-3 items-end">
          <div class="flex-1"><label class="text-xs text-gray-500 block mb-1">公司名称</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" value={newName}
              onInput={(e: any) => newName.value = e.target.value} placeholder="例如: Engineering" /></div>
          <button class="px-4 py-2 bg-green-500 text-white rounded-md text-sm cursor-pointer hover:bg-green-600" onClick={createCompany}>创建</button>
          <button class="px-4 py-2 bg-gray-200 text-gray-600 rounded-md text-sm cursor-pointer hover:bg-gray-300" onClick={() => showCreate.value = false}>取消</button>
        </div>
      </Show>
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
      ctx.api.get<Company>(`/api/companies/${companyId}`).then(c => company.value = c),
      ctx.api.get<Department[]>(`/api/companies/${companyId}/departments`).then(list => departments.value = list),
    ]).finally(() => loading.value = false)
  })

  const createDepartment = async () => {
    try {
      const d = await ctx.api.post<Department>(`/api/companies/${companyId}/departments`, { name: newName.value, description: newDesc.value || undefined })
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
      <Show when={showCreate}>
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4 flex gap-3 items-end">
          <div class="flex-1"><label class="text-xs text-gray-500 block mb-1">部门名称</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" value={newName}
              onInput={(e: any) => newName.value = e.target.value} placeholder="例如: AI Team" /></div>
          <div class="flex-1"><label class="text-xs text-gray-500 block mb-1">描述（可选）</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" value={newDesc}
              onInput={(e: any) => newDesc.value = e.target.value} placeholder="部门的职责" /></div>
          <button class="px-4 py-2 bg-green-500 text-white rounded-md text-sm cursor-pointer hover:bg-green-600" onClick={createDepartment}>创建</button>
          <button class="px-4 py-2 bg-gray-200 text-gray-600 rounded-md text-sm cursor-pointer hover:bg-gray-300" onClick={() => showCreate.value = false}>取消</button>
        </div>
      </Show>
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

function DepartmentPage(_props: {}, ctx: WfuiContext) {
  const { tenantId, companyId, deptId } = ctx.route.params
  const dept = signal<Department | null>(null); const agents = signal<Agent[]>([])
  const showAgents = signal(false); const showKB = signal(false); const showAddAgent = signal(false)
  const allAgents = signal<Agent[]>([]); const selectedAgentId = signal('')

  // 知识库状态
  const kbDocs = signal<KBDoc[]>([]); const kbLoading = signal(false)
  const importTitle = signal(''); const importContent = signal(''); const importSource = signal('')
  const searchQuery = signal(''); const searchResults = signal<any[]>([])

  onMount(async () => {
    const [d, ag] = await Promise.all([
      ctx.api.get<Department>(`/api/departments/${deptId}`),
      ctx.api.get<Agent[]>(`/api/departments/${deptId}/agents`),
    ])
    dept.value = d; agents.value = ag
  })

  // ── Agent 管理 ──

  const openAddAgent = async () => {
    showAddAgent.value = true
    allAgents.value = await ctx.api.get<Agent[]>('/api/agents')
  }

  const addAgent = async () => {
    if (!selectedAgentId.value) return
    try {
      await ctx.api.post(`/api/departments/${deptId}/agents`, { agentId: selectedAgentId.value, role: 'member' })
      agents.value = await ctx.api.get<Agent[]>(`/api/departments/${deptId}/agents`)
      showAddAgent.value = false; selectedAgentId.value = ''
      showToast('Agent 已加入部门', 'success')
    } catch (e: any) { showToast('添加失败: ' + (e?.message || '未知错误'), 'error') }
  }

  const agentIcon = (k: string) => k === 'ai' ? '🤖' : k === 'user' ? '👤' : k === 'webhook' ? '🔗' : '📚'

  // ── 知识库 ──

  const loadKBDocs = async () => {
    kbLoading.value = true
    kbDocs.value = await ctx.api.get<KBDoc[]>(`/api/departments/${deptId}/kb/documents`)
    kbLoading.value = false
  }

  const openKB = () => {
    showKB.value = !showKB.value
    if (showKB.value) loadKBDocs()
  }

  const importDoc = async () => {
    if (!importTitle.value || !importContent.value) return
    try {
      await ctx.api.post(`/api/departments/${deptId}/kb/import`, {
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
    searchResults.value = await ctx.api.post<any[]>(`/api/departments/${deptId}/kb/search`, { query: searchQuery.value })
  }

  const s = createStyles({
    container: 'flex flex-col h-full',
    header: 'px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-white shrink-0',
    headerBtns: 'flex gap-2',
    body: 'flex-1 flex overflow-hidden',
    sidePanel: 'w-72 border-l border-gray-200 bg-gray-50 overflow-y-auto shrink-0',
    panelSection: 'p-3 border-b border-gray-200',
    panelTitle: 'text-xs font-semibold text-gray-500 uppercase mb-2',
    agentItem: 'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-200 cursor-pointer',
    kbItem: 'px-2 py-2 border-b border-gray-100 text-sm',
    input: 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2 focus:outline-none focus:border-blue-500',
    textarea: 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2 h-16 focus:outline-none focus:border-blue-500',
    btn: 'px-3 py-1.5 rounded text-xs cursor-pointer',
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
        <div class={s.headerBtns}>
          <button class="px-3 py-1.5 bg-green-50 text-green-700 rounded-md text-xs cursor-pointer hover:bg-green-100"
            onClick={openKB}>
            {computed(() => showKB.value ? '关闭知识库' : '📚 知识库')}
          </button>
          <button class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs cursor-pointer hover:bg-gray-200"
            onClick={() => showAgents.value = !showAgents.value}>
            {computed(() => showAgents.value ? '隐藏成员' : `成员 (${agents.value.length})`)}
          </button>
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

        {/* 知识库面板 */}
        <Show when={showKB}>
          <div class={s.sidePanel}>
            {/* 导入文档 */}
            <div class={s.panelSection}>
              <h3 class={s.panelTitle}>导入知识</h3>
              <input class={s.input} value={importTitle} onInput={(e: any) => importTitle.value = e.target.value} placeholder="标题" />
              <textarea class={s.textarea} value={importContent} onInput={(e: any) => importContent.value = e.target.value} placeholder="粘贴文档内容..." />
              <input class={s.input} value={importSource} onInput={(e: any) => importSource.value = e.target.value} placeholder="来源（可选）" />
              <button class={s.btnPrimary} onClick={importDoc}>导入</button>
            </div>

            {/* 检索测试 */}
            <div class={s.panelSection}>
              <h3 class={s.panelTitle}>检索测试</h3>
              <div class="flex gap-1 mb-2">
                <input class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                  value={searchQuery} onInput={(e: any) => searchQuery.value = e.target.value}
                  placeholder="输入查询..." onKeyDown={(e: any) => e.key === 'Enter' && searchKB()} />
                <button class={s.btnPrimary} onClick={searchKB}>搜索</button>
              </div>
              <For each={searchResults}>
                {(r: any) => <div class={s.searchResult}><strong>{r.title || '片段'}</strong> ({Math.round(r.score * 100)}%): {r.content.slice(0, 100)}...</div>}
              </For>
            </div>

            {/* 文档列表 */}
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

        {/* 成员面板 */}
        <Show when={showAgents && !showKB}>
          <div class={s.sidePanel}>
            <div class={s.panelSection}>
              <div class="flex items-center justify-between mb-3">
                <h3 class={s.panelTitle}>成员</h3>
                <button class="text-xs text-blue-500 cursor-pointer hover:text-blue-700" onClick={openAddAgent}>+ 添加</button>
              </div>
              <For each={agents}>
                {(a: Agent) => (
                  <div class={s.agentItem}><span>{agentIcon(a.kind)}</span><span>{a.name}</span><span class="text-xs text-gray-400 ml-auto">{a.kind}</span></div>
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

  onMount(async () => {
    const list = await ctx.api.get<Tenant[]>('/api/tenants')
    tenants.value = list; loading.value = false
    if (list.length > 0) { expanded.value = { ...expanded.value, [list[0].id]: true }; await loadCompanies(list[0].id) }
  })

  const loadCompanies = async (id: string) => {
    if (companiesMap.value[id]) return
    companiesMap.value = { ...companiesMap.value, [id]: await ctx.api.get<Company[]>(`/api/tenants/${id}/companies`) }
  }
  const loadDepartments = async (id: string) => {
    if (departmentsMap.value[id]) return
    departmentsMap.value = { ...departmentsMap.value, [id]: await ctx.api.get<Department[]>(`/api/companies/${id}/departments`) }
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

function AppShell(_props: {}, ctx: WfuiContext) {
  const user = computed(() => ctx.user)
  const isLoggedIn = computed(() => !!user.value)

  const s = createStyles({
    layout: 'flex h-screen overflow-hidden bg-gray-50',
    sidebar: 'w-[260px] border-r border-gray-200 bg-[#fafafa] flex flex-col overflow-hidden shrink-0',
    header: 'px-4 py-3 border-b border-gray-200 flex items-center justify-between',
    title: 'font-bold text-base text-blue-600 cursor-pointer',
    user: 'text-xs text-gray-400',
    main: 'flex-1 flex flex-col overflow-hidden min-w-0',
    status: 'px-4 py-2 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between',
  })

  return (
    <div>
      <Show when={isLoggedIn} fallback={<LoginPage _props={{}} ctx={ctx} />}>
        <div class={s.layout}>
          <ToastContainer />
          <div class={s.sidebar}>
            <div class={s.header}>
              <span class={s.title} onClick={() => ctx.app.navigate('/')}>Org</span>
              <span class={s.user}>{computed(() => ctx.user?.name || '')}</span>
            </div>
            <OrgTree _props={{}} ctx={ctx} />
            <div class="flex-1" />
            <div class={s.status}>
              <span>v0.1</span>
              <span class="cursor-pointer hover:text-red-500" onClick={() => ctx.auth.logout?.()}>退出</span>
            </div>
          </div>
          <div class={s.main}>
            <RouteView />
          </div>
        </div>
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
