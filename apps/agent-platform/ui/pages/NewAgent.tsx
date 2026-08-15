import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Badge, Button, Card, Checkbox, Field, Input, InputNumber, Loading, Select, Slider, Textarea } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { track } from '../lib/track'

interface RoleTemplate {
  slug: string; name: string; icon: string; category: string; description: string
  default_system_prompt: string; default_model: string | null
  default_temperature: number; default_max_tokens: number
  default_allow_file_tools: boolean; default_allow_command_exec: boolean; default_allow_network?: boolean
  default_workspace_hint: string | null; default_skills: string[]
  usage_count?: number
}

const AGENT_TYPES = [
  { value: 'ai', label: '🤖 AI 机器人', desc: 'DeepSeek 驱动，支持工具调用与人工审批' },
  { value: 'webhook', label: '🔗 Webhook', desc: '通过 HTTP Webhook 收发消息' },
  { value: 'knowledge_base', label: '📚 知识库', desc: 'PGVector 文档语义检索' },
  { value: 'department', label: '🏢 部门经理', desc: '代表部门对外协作（可加入上级部门形成组织层级）' },
  // user 类型由注册流程自动创建（绑定登录账号）——UI 不提供手动创建（防止 user_id=null 孤儿）
]

const CAT_LABELS: Record<string, string> = {
  engineering: '👨‍💻 工程研发', support: '🎧 客服支持', product: '📋 产品管理',
  data: '📊 数据分析', operations: '🏢 运营人事', business: '📈 业务销售',
  management: '👔 管理决策', general: '🤖 通用',
}

interface NewAgentState {
  step: string
  selectedTemplate: RoleTemplate | null
  type: string; name: string; description: string; roleLabel: string; expertise: string; systemPrompt: string
  webhookSecret: string; chunkSize: string; aiModel: string
  aiTemperature: number; aiMaxTokens: number; aiHITL: boolean
  allowFileTools: boolean; allowCommandExec: boolean; allowNetwork: boolean
  submitting: boolean; error: string
  roleTemplates: RoleTemplate[]; loading: boolean
  /** 组织层级：部门经理绑定的部门 */
  deptId: string; deptOptions: Array<{ id: string; name: string }>
}

export const NewAgent: Component = async (_props, ctx) => {
  const $ = {} as NewAgentState
  const rerender = () => ctx.ui.render()

  $.step = 'template'; $.selectedTemplate = null
  $.type = 'ai'; $.name = ''; $.description = ''; $.roleLabel = ''; $.expertise = ''; $.systemPrompt = ''
  $.webhookSecret = ''; $.chunkSize = '500'; $.aiModel = ''
  $.aiTemperature = 0.7; $.aiMaxTokens = 2048; $.aiHITL = false
  $.allowFileTools = false; $.allowCommandExec = false
  $.submitting = false; $.error = ''
  $.roleTemplates = []; $.loading = true
  $.deptId = ''; $.deptOptions = []

  ctx.api!.get<{ templates: RoleTemplate[] }>('/api/role-templates')
    .then(d => { $.roleTemplates = d.templates ?? []; $.loading = false; rerender() })
    .catch(() => { $.loading = false; rerender() })

  // 组织层级：部门列表（经理绑定用）
  ctx.api!.get<{ departments: Array<{ id: string; name: string; is_dm: boolean }> }>('/api/departments')
    .then(d => { $.deptOptions = (d.departments ?? []).filter((x) => !x.is_dm).map((x) => ({ id: x.id, name: x.name })); rerender() })
    .catch(() => {})

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
    $.selectedTemplate = t; if (!$.name) $.name = t.name; $.description = t.description ?? ''
    $.systemPrompt = t.default_system_prompt ?? ''; $.aiModel = t.default_model ?? ''
    $.aiTemperature = t.default_temperature ?? 0.7
    $.aiMaxTokens = Number(t.default_max_tokens ?? 2048)
    $.allowFileTools = t.default_allow_file_tools ?? false
    $.allowCommandExec = t.default_allow_command_exec ?? false
    $.allowNetwork = t.default_allow_network ?? false
    $.step = 'configure'
    rerender()
  }

  function startDirect() {
    $.selectedTemplate = null; $.systemPrompt = ''; $.aiModel = ''
    $.aiTemperature = 0.7; $.aiMaxTokens = 2048; $.aiHITL = false
    $.allowFileTools = false; $.allowCommandExec = false; $.allowNetwork = false
    $.step = 'direct'
    rerender()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.error = '请输入名称'; rerender(); return }
    $.submitting = true; $.error = ''
    rerender()

    const body: Record<string, unknown> = { type: $.type, name: $.name.trim() }
    if ($.type === 'department') {
      if (!$.deptId) { $.error = '部门经理必须选择代表部门'; $.submitting = false; rerender(); return }
      body.department_id = $.deptId
    }

    if ($.selectedTemplate) {
      body.template_slug = $.selectedTemplate.slug
      body.description = $.description || undefined
      body.role_label = $.roleLabel || undefined
      body.expertise = $.expertise || undefined
      body.system_prompt = $.systemPrompt || undefined
      body.model = $.aiModel || undefined
      body.temperature = $.aiTemperature
      body.max_tokens = $.aiMaxTokens ?? 2048
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
      body.allow_network = $.allowNetwork
      try {
        const data = await ctx.api!.post<{ agent: { id: string } }>('/api/agents/from-template', body)
        track('agent_created')
        ctx.app?.navigate(`/agents/${data.agent.id}`)
      } catch (e) { $.error = errMsg(e, '创建失败'); $.submitting = false }
      return
    }

    if ($.type === 'ai') {
      body.system_prompt = $.systemPrompt || undefined
      body.model = $.aiModel || undefined
      body.temperature = $.aiTemperature
      body.max_tokens = $.aiMaxTokens ?? 2048
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
      body.allow_network = $.allowNetwork
    }
    if ($.type === 'webhook') body.webhook_secret = $.webhookSecret || undefined
    if ($.type === 'knowledge_base') body.chunk_size = parseInt($.chunkSize) || 500

    try {
      const data = await ctx.api!.post<{ agent: { id: string } }>('/api/agents', body)
      track('agent_created')
      ctx.app?.navigate(`/agents/${data.agent.id}`)
    } catch (e) { $.error = errMsg(e, '创建失败'); $.submitting = false; rerender() }
  }

  // render：步骤判断必须在 render 函数内部（mount 只返回一个 render fn，
  // 否则 $.step 变化后视图不会切换——历史 bug：mount 提前 return 导致模板/配置步骤冻结）
  return async (props: {}) => {
    // ── 步骤 1: 选择模板 ──
    if ($.step === 'template') {
      if ($.loading) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><Loading /></div>
      return (
      <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
        <a key="back-link" class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>
        <PageHeader key="tmpl-header" title="创建 Agent" sub="选择一个角色模板快速开始，或跳过自行配置" />

        {buildCategories().map(([key, cat]) => (
          <div key={key} class="wf-stack wf-gap-sm wf-mb-lg">
            <div class="wf-text-sm wf-text-semibold wf-text-secondary wf-px-sm">{cat.label}</div>
            <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(240px, 1fr))">
              {cat.templates.map((t: RoleTemplate) => (
                <Card key={t.slug} outlined hover clickable onClick={() => selectTemplate(t)}>
                  <div class="wf-row wf-gap-sm">
                    <span class="wf-text-3xl">{t.icon}</span>
                    {(t.usage_count ?? 0) > 0 && <Badge variant="warning">🔥 热门 · {t.usage_count ?? 0}</Badge>}
                  </div>
                  <div class="wf-text-base wf-text-semibold">{t.name}</div>
                  <div class="wf-text-xs wf-text-secondary wf-mt-xs">{t.description}</div>
                  <div class="wf-row wf-gap-xs wf-mt-sm">
                    {t.default_allow_file_tools && <Badge variant="primary">📁 文件工具</Badge>}
                    {t.default_allow_command_exec && <Badge variant="warning">⚡ 命令执行</Badge>}
                    {t.default_skills?.map((s: string) => (
                      <Badge key={s} variant="default">🔧 {s}</Badge>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}

        <div class="wf-text-center wf-p-md wf-border-t">
          <Button variant="ghost" onClick={startDirect}>跳过模板，直接创建 →</Button>
        </div>
      </div>
      )
    }

    // ── 步骤 2: 配置 ──
    const isAI = !$.selectedTemplate && $.type === 'ai'
    const isWebhook = !$.selectedTemplate && $.type === 'webhook'
    const isKB = !$.selectedTemplate && $.type === 'knowledge_base'
    const hasAIConfig = isAI || $.selectedTemplate !== null || $.type === 'department'

    return (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <a key="back-link2" class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>

      {$.selectedTemplate && (
        <Card key="selected-tmpl">
          <div class="wf-row wf-gap-sm">
            <span class="wf-text-2xl">{$.selectedTemplate.icon}</span>
            <div class="wf-fill">
              <div class="wf-text-base wf-text-semibold">{$.selectedTemplate.name}</div>
              <div class="wf-text-xs wf-text-tertiary">{$.selectedTemplate.description}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { $.step = 'template'; rerender() }}>切换模板</Button>
          </div>
        </Card>
      )}

      <PageHeader key="form-header" title={$.selectedTemplate ? `创建 ${$.selectedTemplate.name}` : '创建 Agent'}
        sub="模板已预填默认值，可根据需要修改" />

      <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>

      <Card key="form-card">
        <form class="wf-stack wf-gap-md" onSubmit={handleSubmit}>
          {!$.selectedTemplate && (
            <Field label="类型">
              <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(160px, 1fr))">
                {AGENT_TYPES.map(t => (
                  <Card key={t.value} outlined hover active={$.type === t.value}
                    onClick={() => { $.type = t.value; $.error = ''; rerender() }}>
                    <div class="wf-text-base wf-text-semibold">{t.label}</div>
                    <div class="wf-text-xs wf-text-secondary">{t.desc}</div>
                  </Card>
                ))}
              </div>
            </Field>
          )}

          {$.type === 'department' && (
            <Field label="代表部门" required hint="该经理代表此部门对外协作——可把任务分派给部门成员">
              <Select value={$.deptId}
                onChange={(v) => { $.deptId = v as string; rerender() }}
                options={$.deptOptions.map(d => ({ value: d.id, label: d.name }))}
                placeholder="选择要代表的部门"
              />
            </Field>
          )}

          <Field label="名称" required>
            <Input type="text" placeholder="输入 Agent 名称" value={$.name}
              onInput={(e: Event) => { $.name = inputValue(e); rerender() }} />
          </Field>

          <Field label="描述">
            <Input type="text" placeholder="简短描述此 Agent 的用途" value={$.description}
              onInput={(e: Event) => { $.description = inputValue(e); rerender() }} />
          </Field>
          {$.type === 'ai' && (
            <div class="wf-row wf-gap-lg">
              <div class="wf-fill">
                <Field label="角色标签" hint="群里展示的身份，如：财务分析">
                  <Input placeholder="财务分析" value={$.roleLabel}
                    onInput={(e: Event) => { $.roleLabel = inputValue(e); rerender() }} />
                </Field>
              </div>
              <div class="wf-fill">
                <Field label="专长" hint="能干什么，如：Excel/报表/预算">
                  <Input placeholder="Excel/报表/预算" value={$.expertise}
                    onInput={(e: Event) => { $.expertise = inputValue(e); rerender() }} />
                </Field>
              </div>
            </div>
          )}

          {hasAIConfig && (
            <Field label="系统提示词（System Prompt）" hint="留空则使用默认助手人格">
              <Textarea rows={5} placeholder="设定 AI 的角色与行为指令..." value={$.systemPrompt}
                onInput={(e: Event) => { $.systemPrompt = inputValue(e); rerender() }} />
            </Field>
          )}

          {hasAIConfig && (
            <>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="模型">
                    <Select value={$.aiModel} onChange={(v) => { $.aiModel = v as string; rerender() }}
                      options={[
                        { value: '', label: '默认 (deepseek-v4-flash)' },
                        { value: 'deepseek-v4-flash', label: 'DeepSeek Chat' },
                        { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
                      ]} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="温度">
                    <Slider min={0} max={2} step={0.1} value={$.aiTemperature}
                      onChange={(v) => { $.aiTemperature = v; rerender() }} />
                  </Field>
                </div>
              </div>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="最大 Token 数">
                    <InputNumber value={$.aiMaxTokens} min={64} max={8192} step={64}
                      onChange={(v) => { $.aiMaxTokens = v ?? 2048; rerender() }} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="人工审批 (HITL)">
                    <Checkbox label="开启后 AI 回复需人工批准后才发送" checked={$.aiHITL}
                      onChange={(v: boolean) => { $.aiHITL = v; rerender() }} />
                  </Field>
                </div>
              </div>
            </>
          )}

          {hasAIConfig && (
            <>
              <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📁 工作空间</div>
              <div class="wf-bg-tertiary wf-p-md wf-rounded wf-text-sm wf-text-secondary">
                Agent 将在 <code>data/workspaces/{'{agent_id}'}/</code> 下工作
              </div>
              <div class="wf-row wf-gap-lg">
                <Checkbox label="📄 启用文件工具 (read/write/edit/grep)" checked={$.allowFileTools}
                  onChange={(v: boolean) => { $.allowFileTools = v; rerender() }} />
                <Checkbox label="⚡ 启用命令执行 (bash)" checked={$.allowCommandExec}
                  onChange={(v: boolean) => { $.allowCommandExec = v; rerender() }} />
              </div>
              <div class="wf-row wf-gap-lg wf-mt-xs">
                <Checkbox label="🌐 允许网络访问" checked={$.allowNetwork}
                  onChange={(v: boolean) => { $.allowNetwork = v; rerender() }} />
                <span class="wf-text-xs wf-text-tertiary wf-self-center">默认关闭（沙盒 --network none）；开启后容器接入 bridge 网络</span>
              </div>
              <div class="wf-text-xs wf-text-tertiary wf-mt-xs">🧪 工具在 ap-sandbox 沙盒容器内执行（node:24 + python + agent-browser · 网络隔离 · 内存 512MB · 1 CPU · 非 root）</div>
            </>
          )}

          {!$.selectedTemplate && isWebhook && (
            <div class="wf-text-sm wf-text-secondary wf-bg-secondary wf-rounded wf-p-sm">
              📡 出站回调规划中——Webhook Agent 当前为<b>入站 API 机器人</b>（外部系统 POST 到 /api/webhook/&#123;id&#125; 触发 AI 应答），创建后可在详情页查看对接示例。
            </div>
          )}
          {!$.selectedTemplate && isKB && (
            <Field label="分块大小">
              <Input type="number" value={$.chunkSize} onInput={(e: Event) => { $.chunkSize = inputValue(e); rerender() }} />
            </Field>
          )}

          <div class="wf-right wf-gap-sm">
            <Button type="button" variant="ghost" onClick={() => ctx.app?.navigate('/agents')}>取消</Button>
            <Button type="submit" variant="primary" disabled={$.submitting}>
              {$.submitting ? '创建中...' : `创建 ${$.selectedTemplate?.name ?? 'Agent'}`}
            </Button>
          </div>
        </form>
      </Card>
    </div>
    )
  }
}
