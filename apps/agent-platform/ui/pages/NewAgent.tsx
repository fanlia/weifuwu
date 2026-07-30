import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

interface RoleTemplate {
  slug: string; name: string; icon: string; category: string; description: string
  default_system_prompt: string; default_model: string | null
  default_temperature: number; default_max_tokens: number
  default_allow_file_tools: boolean; default_allow_command_exec: boolean
  default_workspace_hint: string | null; default_skills: string[]
}

const AGENT_TYPES = [
  { value: 'ai', label: '🤖 AI 机器人', desc: 'DeepSeek 驱动，支持工具调用与人工审批' },
  { value: 'webhook', label: '🔗 Webhook', desc: '通过 HTTP Webhook 收发消息' },
  { value: 'knowledge_base', label: '📚 知识库', desc: 'PGVector 文档语义检索' },
  { value: 'user', label: '👤 真实用户', desc: '绑定到平台用户账号' },
]

const CAT_LABELS: Record<string, string> = {
  engineering: '👨‍💻 工程研发', support: '🎧 客服支持', product: '📋 产品管理',
  data: '📊 数据分析', operations: '🏢 运营人事', business: '📈 业务销售',
  management: '👔 管理决策', general: '🤖 通用',
}

export const NewAgent: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

  $.step = 'template'; $.selectedTemplate = null
  $.type = 'ai'; $.name = ''; $.description = ''; $.systemPrompt = ''
  $.webhookUrl = ''; $.chunkSize = '500'; $.aiModel = ''
  $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'; $.aiHITL = false
  $.allowFileTools = false; $.allowCommandExec = false
  $.submitting = false; $.error = ''
  $.roleTemplates = []; $.loading = true

  fetch('/api/role-templates', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json()).then(d => { $.roleTemplates = d.templates ?? []; $.loading = false })
    .catch(() => { $.loading = false })

  // 模板按类别分组
  // 注意：isAI/isWebhook/isKB/hasAIConfig 需在 render 函数内计算
  // 它们在 mount 阶段捕获会因 $ 响应式更新而过时
  function buildCategories() {
    const cats = new Map<string, { label: string; templates: RoleTemplate[] }>()
    for (const t of $.roleTemplates) {
      const cl = t.category || 'general'
      if (!cats.has(cl)) cats.set(cl, { label: CAT_LABELS[cl] ?? cl, templates: [] })
      cats.get(cl)!.templates.push(t)
    }
    return [...cats.entries()]
  }

  function selectTemplate(t: RoleTemplate) {
    $.selectedTemplate = t; $.name = ''; $.description = t.description ?? ''
    $.systemPrompt = t.default_system_prompt ?? ''; $.aiModel = t.default_model ?? ''
    $.aiTemperature = String(t.default_temperature ?? 0.7)
    $.aiMaxTokens = String(t.default_max_tokens ?? 2048)
    $.allowFileTools = t.default_allow_file_tools ?? false
    $.allowCommandExec = t.default_allow_command_exec ?? false
    $.step = 'configure'
  }

  function startDirect() {
    $.selectedTemplate = null; $.systemPrompt = ''; $.aiModel = ''
    $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'; $.aiHITL = false
    $.allowFileTools = false; $.allowCommandExec = false
    $.step = 'direct'
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.error = '请输入名称'; return }
    $.submitting = true; $.error = ''

    const body: Record<string, unknown> = { type: $.type, name: $.name.trim() }

    if ($.selectedTemplate) {
      body.template_slug = $.selectedTemplate.slug
      body.description = $.description || undefined
      body.system_prompt = $.systemPrompt || undefined
      body.model = $.aiModel || undefined
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
      try {
        const res = await fetch('/api/agents/from-template', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) { $.error = data.error || '创建失败'; $.submitting = false; return }
        ctx.app?.navigate(`/agents/${data.agent.id}`)
      } catch { $.error = '网络错误'; $.submitting = false }
      return
    }

    // 直接创建
    if ($.type === 'ai') {
      body.system_prompt = $.systemPrompt || undefined
      body.model = $.aiModel || undefined
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
    }
    if ($.type === 'webhook') body.webhook_url = $.webhookUrl || undefined
    if ($.type === 'knowledge_base') body.chunk_size = parseInt($.chunkSize) || 500

    try {
      const res = await fetch('/api/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '创建失败'; $.submitting = false; return }
      ctx.app?.navigate(`/agents/${data.agent.id}`)
    } catch { $.error = '网络错误'; $.submitting = false }
  }

  // ══════════ 步骤 1: 选择模板 ══════════
  if ($.step === 'template') {
    return (props: {}) => {
      if ($.loading) return <div class="page page-narrow"><div class="empty"><div class="spinner"></div></div></div>
      return (
      <div class="page page-narrow">
        <a class="back-link" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>
        <PageHeader title="创建 Agent" sub="选择一个角色模板快速开始，或跳过自行配置" />

        {buildCategories().map(([key, cat]) => (
          <div key={key} style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '12px', paddingLeft: '4px' }}>{cat.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              {cat.templates.map((t: RoleTemplate) => (
                <div key={t.slug} class="type-opt" onClick={() => selectTemplate(t)} style={{ cursor: 'pointer', padding: '16px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{t.icon}</div>
                  <div class="type-opt-t">{t.name}</div>
                  <div class="type-opt-d" style={{ fontSize: '12px', lineHeight: '1.5', marginTop: '4px' }}>{t.description}</div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {t.default_allow_file_tools && <span class="badge badge-blue" style={{ fontSize: '11px', padding: '2px 6px' }}>📁 文件工具</span>}
                    {t.default_allow_command_exec && <span class="badge badge-orange" style={{ fontSize: '11px', padding: '2px 6px' }}>⚡ 命令执行</span>}
                    {t.default_skills?.map((s: string) => (
                      <span key={s} class="badge badge-gray" style={{ fontSize: '11px', padding: '2px 6px' }}>🔧 {s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: '16px', padding: '16px', borderTop: '1px solid var(--border)' }}>
          <button class="btn btn-ghost" onClick={startDirect}>跳过模板，直接创建 →</button>
        </div>
      </div>
      )
    }
  }

  // ══════════ 步骤 2: 配置 ══════════
  return (props: {}) => {
    const isAI = !$.selectedTemplate && $.type === 'ai'
    const isWebhook = !$.selectedTemplate && $.type === 'webhook'
    const isKB = !$.selectedTemplate && $.type === 'knowledge_base'
    const hasAIConfig = isAI || $.selectedTemplate !== null

    return (
    <div class="page page-narrow">
      <a class="back-link" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>

      {$.selectedTemplate && (
        <div class="card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{$.selectedTemplate.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{$.selectedTemplate.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{$.selectedTemplate.description}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onClick={() => { $.step = 'template' }}>切换模板</button>
        </div>
      )}

      <PageHeader title={$.selectedTemplate ? `创建 ${$.selectedTemplate.name}` : '创建 Agent'}
        sub="模板已预填默认值，可根据需要修改" />

      {$.error && <div class="alert alert-err">{$.error}</div>}

      <form class="card card-pad" onSubmit={handleSubmit}>
        {/* 类型选择（仅直接创建） */}
        {!$.selectedTemplate && (
          <div class="field">
            <label class="field-label">类型</label>
            <div class="type-grid">
              {AGENT_TYPES.map(t => (
                <div key={t.value} class={`type-opt${$.type === t.value ? ' on' : ''}`}
                  onClick={() => { $.type = t.value; $.error = '' }}>
                  <div class="type-opt-t">{t.label}</div>
                  <div class="type-opt-d">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div class="field"><label class="field-label">名称 <span class="req">*</span></label>
          <input class="input" type="text" placeholder="输入 Agent 名称" value={$.name}
            onInput={(e: any) => { $.name = e.target.value }} /></div>

        <div class="field"><label class="field-label">描述</label>
          <input class="input" type="text" placeholder="简短描述此 Agent 的用途" value={$.description}
            onInput={(e: any) => { $.description = e.target.value }} /></div>

        {/* System Prompt */}
        {hasAIConfig && (
          <div class="field"><label class="field-label">系统提示词（System Prompt）</label>
            <textarea class="textarea" rows={5} placeholder="设定 AI 的角色与行为指令..." value={$.systemPrompt}
              onInput={(e: any) => { $.systemPrompt = e.target.value }} />
            <div class="field-hint">留空则使用默认助手人格</div></div>
        )}

        {/* AI 配置 */}
        {hasAIConfig && (
          <>
            <div class="form-row">
              <div class="field"><label class="field-label">模型</label>
                <select class="select" value={$.aiModel} onChange={(e: any) => { $.aiModel = e.target.value }}>
                  <option value="">默认 (deepseek-v4-flash)</option>
                  <option value="deepseek-v4-flash">DeepSeek Chat</option>
                  <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                </select></div>
              <div class="field"><label class="field-label">温度</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="range" min="0" max="2" step="0.1" value={$.aiTemperature}
                    onInput={(e: any) => { $.aiTemperature = e.target.value }} style={{ flex: 1 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '30px', textAlign: 'center' }}>{$.aiTemperature}</span>
                </div></div>
            </div>
            <div class="form-row">
              <div class="field"><label class="field-label">最大 Token 数</label>
                <input class="input" type="number" min="64" max="8192" step="64" value={$.aiMaxTokens}
                  onInput={(e: any) => { $.aiMaxTokens = e.target.value }} /></div>
              <div class="field"><label class="field-label">人工审批 (HITL)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '9px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={$.aiHITL}
                      onChange={(e: any) => { $.aiHITL = e.target.checked }} />
                    <span>开启后 AI 回复需人工批准后才发送</span>
                  </label>
                </div></div>
            </div>
          </>
        )}

        {/* 工作空间配置 */}
        {hasAIConfig && (
          <>
            <div class="sect-title" style={{ marginTop: '16px', marginBottom: '12px' }}>📁 工作空间</div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '10px', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px' }}>
              Agent 将在 <code style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}>data/workspaces/{'{agent_id}'}/</code> 下工作
            </div>
            <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={$.allowFileTools}
                  onChange={(e: any) => { $.allowFileTools = e.target.checked }} />
                <span>📄 启用文件工具 (read/write/edit/grep)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={$.allowCommandExec}
                  onChange={(e: any) => { $.allowCommandExec = e.target.checked }} />
                <span>⚡ 启用命令执行 (bash)</span>
              </label>
            </div>
          </>
        )}

        {/* Webhook/KB 配置 */}
        {!$.selectedTemplate && isWebhook && (
          <div class="field"><label class="field-label">Webhook URL</label>
            <input class="input" type="url" placeholder="https://example.com/webhook" value={$.webhookUrl}
              onInput={(e: any) => { $.webhookUrl = e.target.value }} /></div>
        )}
        {!$.selectedTemplate && isKB && (
          <div class="field"><label class="field-label">分块大小</label>
            <input class="input" type="number" value={$.chunkSize}
              onInput={(e: any) => { $.chunkSize = e.target.value }} /></div>
        )}

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app?.navigate('/agents')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={$.submitting}>
            {$.submitting ? '创建中...' : `创建 ${$.selectedTemplate?.name ?? 'Agent'}`}
          </button>
        </div>
      </form>
    </div>
    )
  }
}
