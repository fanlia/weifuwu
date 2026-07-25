/**
 * 新建 Agent 页面 — 角色模板向导
 *
 * 步骤 1: 选择角色模板（从预置模板列表）
 * 步骤 2: 填写配置（模板已预填默认值，可自定义）
 */

import { signal, computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

interface RoleTemplate {
  slug: string
  name: string
  icon: string
  category: string
  description: string
  default_system_prompt: string
  default_model: string | null
  default_temperature: number
  default_max_tokens: number
  default_allow_file_tools: boolean
  default_allow_command_exec: boolean
  default_workspace_hint: string | null
  default_skills: string[]
}

// ── 备选：没有模板时的直接创建模式 ──
const AGENT_TYPES = [
  { value: 'ai', label: '🤖 AI 机器人', desc: 'DeepSeek 驱动，支持工具调用与人工审批' },
  { value: 'webhook', label: '🔗 Webhook', desc: '通过 HTTP Webhook 收发消息' },
  { value: 'knowledge_base', label: '📚 知识库', desc: 'PGVector 文档语义检索' },
  { value: 'user', label: '👤 真实用户', desc: '绑定到平台用户账号' },
]

export function NewAgent(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  // ── 获取角色模板 ──
  const [templates] = createResource<RoleTemplate[]>(
    () => fetch('/api/role-templates').then(r => r.json()).then(d => d.templates ?? []),
    { initialValue: [] },
  )

  // ── 步骤控制 ──
  const step = signal<'template' | 'configure' | 'direct'>('template')
  const selectedTemplate = signal<RoleTemplate | null>(null)

  // ── 表单字段（从模板预填，或手动模式默认） ──
  const type = signal('ai')
  const name = signal('')
  const description = signal('')
  const systemPrompt = signal('')
  const webhookUrl = signal('')
  const chunkSize = signal('500')
  const workspacePath = signal('')
  const aiModel = signal('')
  const aiTemperature = signal('0.7')
  const aiMaxTokens = signal('2048')
  const aiHITL = signal(false)
  const allowFileTools = signal(false)
  const allowCommandExec = signal(false)
  const submitting = signal(false)
  const error = signal('')

  const hasError = computed(() => error.value !== '')
  const isAI = computed(() => type.value === 'ai')
  const isWebhook = computed(() => type.value === 'webhook')
  const isKB = computed(() => type.value === 'knowledge_base')

  // ── 选择模板 ──
  function selectTemplate(t: RoleTemplate) {
    selectedTemplate.value = t
    name.value = ''
    description.value = t.description ?? ''
    systemPrompt.value = t.default_system_prompt ?? ''
    aiModel.value = t.default_model ?? ''
    aiTemperature.value = String(t.default_temperature ?? 0.7)
    aiMaxTokens.value = String(t.default_max_tokens ?? 2048)
    workspacePath.value = t.default_workspace_hint ?? ''
    allowFileTools.value = t.default_allow_file_tools ?? false
    allowCommandExec.value = t.default_allow_command_exec ?? false
    step.value = 'configure'
  }

  // ── 直接创建（不选模板） ──
  function startDirect() {
    selectedTemplate.value = null
    systemPrompt.value = ''
    workspacePath.value = ''
    allowFileTools.value = false
    allowCommandExec.value = false
    aiModel.value = ''
    aiTemperature.value = '0.7'
    aiMaxTokens.value = '2048'
    aiHITL.value = false
    step.value = 'direct'
  }

  // ── 按类别分组模板 ──
  const categories = computed(() => {
    const cats = new Map<string, { label: string; templates: RoleTemplate[] }>()
    const catLabels: Record<string, string> = {
      engineering: '👨‍💻 工程研发',
      support: '🎧 客服支持',
      product: '📋 产品管理',
      data: '📊 数据分析',
      operations: '🏢 运营人事',
      business: '📈 业务销售',
      management: '👔 管理决策',
      general: '🤖 通用',
    }
    for (const t of templates.value) {
      const cl = t.category || 'general'
      if (!cats.has(cl)) cats.set(cl, { label: catLabels[cl] ?? cl, templates: [] })
      cats.get(cl)!.templates.push(t)
    }
    return [...cats.entries()]
  })

  // ── 提交 ──
  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!name.value.trim()) { error.value = '请输入名称'; return }
    submitting.value = true
    error.value = ''

    const body: Record<string, unknown> = { type: type.value, name: name.value.trim() }

    if (selectedTemplate.value) {
      // 从模板创建
      body.template_slug = selectedTemplate.value.slug
      body.description = description.value || undefined
      body.system_prompt = systemPrompt.value || undefined
      body.model = aiModel.value || undefined
      body.temperature = parseFloat(aiTemperature.value) || 0.7
      body.max_tokens = parseInt(aiMaxTokens.value) || 2048
      body.allow_file_tools = allowFileTools.value
      body.allow_command_exec = allowCommandExec.value

      try {
        const res = await fetch('/api/agents/from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) { error.value = data.error || '创建失败'; submitting.value = false; return }
        ctx.app.navigate(`/agents/${data.agent.id}`)
      } catch {
        error.value = '网络错误'
        submitting.value = false
      }
      return
    }

    // 直接创建（传统模式）
    if (type.value === 'ai') {
      body.system_prompt = systemPrompt.value || undefined
      body.model = aiModel.value || undefined
      body.temperature = parseFloat(aiTemperature.value) || 0.7
      body.max_tokens = parseInt(aiMaxTokens.value) || 2048
      body.human_in_the_loop = aiHITL.value
      body.allow_file_tools = allowFileTools.value
      body.allow_command_exec = allowCommandExec.value
    }
    if (type.value === 'webhook') body.webhook_url = webhookUrl.value || undefined
    if (type.value === 'knowledge_base') body.chunk_size = parseInt(chunkSize.value) || 500

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '创建失败'; submitting.value = false; return }
      ctx.app.navigate(`/agents/${data.agent.id}`)
    } catch {
      error.value = '网络错误'
      submitting.value = false
    }
  }

  // ══════════════════════════════
  // 步骤 1: 选择模板
  // ══════════════════════════════
  if (step.value === 'template') {
    return (
      <div class="page page-narrow">
        <a href="/agents" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/agents') }}>← 返回 Agent 列表</a>
        <PageHeader title="创建 Agent" sub="选择一个角色模板快速开始，或跳过自行配置" />

        <Show when={computed(() => templates.value.length === 0)}>
          <div class="empty"><div class="spinner"></div></div>
        </Show>

        <For each={categories}>{(cat: any) => (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '12px', paddingLeft: '4px' }}>{cat[1].label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              <For each={cat[1].templates}>{(t: RoleTemplate) => (
                <div
                  class="type-opt"
                  onClick={() => selectTemplate(t)}
                  style={{ cursor: 'pointer', padding: '16px' }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{t.icon}</div>
                  <div class="type-opt-t">{t.name}</div>
                  <div class="type-opt-d" style={{ fontSize: '12px', lineHeight: '1.5', marginTop: '4px' }}>{t.description}</div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <Show when={t.default_allow_file_tools}><span class="badge badge-blue" style={{ fontSize: '11px', padding: '2px 6px' }}>📁 文件工具</span></Show>
                    <Show when={t.default_allow_command_exec}><span class="badge badge-orange" style={{ fontSize: '11px', padding: '2px 6px' }}>⚡ 命令执行</span></Show>
                    <For each={t.default_skills}>{(s: string) => (
                      <span class="badge badge-gray" style={{ fontSize: '11px', padding: '2px 6px' }}>🔧 {s}</span>
                    )}</For>
                  </div>
                </div>
              )}</For>
            </div>
          </div>
        )}</For>

        <div style={{ textAlign: 'center', marginTop: '16px', padding: '16px', borderTop: '1px solid var(--border)' }}>
          <button class="btn btn-ghost" onClick={startDirect}>跳过模板，直接创建 →</button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════
  // 步骤 2: 配置（模板预填或直接创建）
  // ══════════════════════════════
  return (
    <div class="page page-narrow">
      <a href="/agents" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/agents') }}>← 返回 Agent 列表</a>

      <Show when={selectedTemplate.value}>
        {() => {
          const t = selectedTemplate.value!
          return (
            <div class="card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{t.description}</div>
              </div>
              <button class="btn btn-ghost btn-sm" onClick={() => { step.value = 'template' }}>切换模板</button>
            </div>
          )
        }}
      </Show>

      <PageHeader
        title={selectedTemplate.value ? `创建 ${selectedTemplate.value.name}` : '创建 Agent'}
        sub="模板已预填默认值，可根据需要修改"
      />

      <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

      <form class="card card-pad" onSubmit={handleSubmit}>
        {/* ── 类型选择（仅在直接创建模式显示） ── */}
        <Show when={computed(() => !selectedTemplate.value)}>
          <div class="field">
            <label class="field-label">类型</label>
            <div class="type-grid">
              <For each={AGENT_TYPES}>{(t: any) => (
                <div class={computed(() => `type-opt${type.value === t.value ? ' on' : ''}`)}
                  onClick={() => { type.value = t.value; error.value = '' }}>
                  <div class="type-opt-t">{t.label}</div>
                  <div class="type-opt-d">{t.desc}</div>
                </div>
              )}</For>
            </div>
          </div>
        </Show>

        {/* ── 名称 ── */}
        <div class="field">
          <label class="field-label">名称 <span class="req">*</span></label>
          <input class="input" type="text" placeholder="输入 Agent 名称" value={name}
            onInput={(e: any) => { name.value = e.target.value }} />
        </div>

        <div class="field">
          <label class="field-label">描述</label>
          <input class="input" type="text" placeholder="简短描述此 Agent 的用途" value={description}
            onInput={(e: any) => { description.value = e.target.value }} />
        </div>

        {/* ── System Prompt ── */}
        <Show when={computed(() => isAI.value || selectedTemplate.value !== null)}>
          <div class="field">
            <label class="field-label">系统提示词（System Prompt）</label>
            <textarea class="textarea" rows={5} placeholder="设定 AI 的角色与行为指令..."
              value={systemPrompt}
              onInput={(e: any) => { systemPrompt.value = e.target.value }} />
            <div class="field-hint">留空则使用默认助手人格</div>
          </div>
        </Show>

        {/* ── AI 配置 ── */}
        <Show when={computed(() => isAI.value || selectedTemplate.value !== null)}>
          <div class="form-row">
            <div class="field">
              <label class="field-label">模型</label>
              <select class="select" value={aiModel} onChange={(e: any) => { aiModel.value = e.target.value }}>
                <option value="">默认 (deepseek-chat)</option>
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label">温度</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="range" min="0" max="2" step="0.1" value={aiTemperature}
                  onInput={(e: any) => { aiTemperature.value = e.target.value }} style={{ flex: 1 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '30px', textAlign: 'center' }}>{aiTemperature}</span>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label class="field-label">最大 Token 数</label>
              <input class="input" type="number" min="64" max="8192" step="64" value={aiMaxTokens}
                onInput={(e: any) => { aiMaxTokens.value = e.target.value }} />
            </div>
            <div class="field">
              <label class="field-label">人工审批 (HITL)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '9px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={aiHITL}
                    onChange={(e: any) => { aiHITL.value = e.target.checked }} />
                  <span>开启后 AI 回复需人工批准后才发送</span>
                </label>
              </div>
            </div>
          </div>
        </Show>

        {/* ── 工作空间配置 ── */}
        <Show when={computed(() => isAI.value || selectedTemplate.value !== null)}>
          <div class="sect-title" style={{ marginTop: '16px', marginBottom: '12px' }}>📁 工作空间</div>
          <div class="field">
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '10px', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px' }}>
              Agent 将在 <code style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}>data/workspaces/{'{agent_id}'}/</code> 下工作
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked={allowFileTools}
                onChange={(e: any) => { allowFileTools.value = e.target.checked }} />
              <span>📄 启用文件工具 (read/write/edit/grep)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked={allowCommandExec}
                onChange={(e: any) => { allowCommandExec.value = e.target.checked }} />
              <span>⚡ 启用命令执行 (bash)</span>
            </label>
          </div>
        </Show>

        {/* ── Webhook/KB 配置（直接创建模式） ── */}
        <Show when={computed(() => !selectedTemplate.value)}>
          <Show when={isWebhook}>
            <div class="field">
              <label class="field-label">Webhook URL</label>
              <input class="input" type="url" placeholder="https://example.com/webhook" value={webhookUrl}
                onInput={(e: any) => { webhookUrl.value = e.target.value }} />
            </div>
          </Show>
          <Show when={isKB}>
            <div class="field">
              <label class="field-label">分块大小</label>
              <input class="input" type="number" value={chunkSize}
                onInput={(e: any) => { chunkSize.value = e.target.value }} />
            </div>
          </Show>
        </Show>

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/agents')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {computed(() => submitting.value ? '创建中...' : `创建 ${selectedTemplate.value?.name ?? 'Agent'}`)}
          </button>
        </div>
      </form>
    </div>
  )
}
