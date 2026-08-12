import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, TypeBadge, Loading, errMsg } from '../components/ui'
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, Select, Slider, Textarea, Timeline } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import type { Agent, AgentLog, AvailableSkill, BoundSkill, KbChunk, KbDocument, WebhookLog } from '../lib/types'

const MODELS = [
  { value: '', label: '默认 (环境变量 DEEPSEEK_MODEL)' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
]

interface AgentDetailState {
  agent: Agent | null
  loading: boolean; saving: boolean; notFound: boolean
  error: string; ok: string
  name: string; description: string; systemPrompt: string
  aiModel: string; aiTemperature: string; aiMaxTokens: string
  aiHITL: boolean; webhookUrl: string; webhookSecret: string
  webhookRetryCount: string; secretVisible: boolean
  kbChunkSize: string; kbChunkOverlap: string
  kbOptions: Array<{ id: string; name: string }>; kbId: string
  kbQuery: string; kbResults: Array<{ filename: string; content: string; similarity: number }>
  kbSearching: boolean; reindexing: boolean
  previewQuery: string; previewText: string; previewing: boolean
  allowFileTools: boolean; allowCommandExec: boolean
  boundSkills: BoundSkill[]; availableSkills: AvailableSkill[]; showSkillPicker: boolean
  logs: AgentLog[]; logsLoading: boolean
  docs: KbDocument[]; docsLoading: boolean
  newDocFilename: string; newDocContent: string
  uploading: boolean; expandedDoc: string | null
  docChunks: KbChunk[]; loadingChunks: boolean
  showBatch: boolean
  whLogs: WebhookLog[]; whLogsLoading: boolean
  whTesting: boolean; whTestResult: string
}

export const AgentDetail: Component = async (_props, ctx) => {
  const $ = {} as AgentDetailState
  const rerender = () => ctx.ui.render()
  const agentId = ctx.route?.params?.id ?? ''

    $.agent = null; $.loading = true; $.saving = false; $.notFound = false
    $.error = ''; $.ok = ''

    $.name = ''; $.description = ''; $.systemPrompt = ''
    $.aiModel = ''; $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'
    $.aiHITL = false; $.webhookUrl = ''; $.webhookSecret = ''
    $.webhookRetryCount = '3'; $.secretVisible = false
    $.kbChunkSize = '500'; $.kbChunkOverlap = '50'
    $.kbQuery = ''; $.kbResults = []; $.kbSearching = false
    $.previewQuery = ''; $.previewText = ''; $.previewing = false
    $.allowFileTools = false; $.allowCommandExec = false

    $.boundSkills = []; $.availableSkills = []; $.showSkillPicker = false

    $.logs = []; $.logsLoading = false

    Promise.all([
      ctx.api!.get(`/api/agents/${agentId}`),
      ctx.api!.get(`/api/agents/${agentId}/skills`).catch(() => ({ skills: [] })),
      ctx.api!.get('/api/skills/available').catch(() => ({ skills: [] })),
      ctx.api!.get('/api/agents?type=knowledge_base').catch(() => ({ agents: [] })),
    ]).then(([agentRes, skillRes, availRes, kbRes]) => {
      const a = agentRes.agent ?? agentRes
      if (!a?.id) { $.notFound = true; $.loading = false; rerender(); return }
      $.agent = a; $.name = a.name ?? ''; $.description = a.description ?? ''
      $.systemPrompt = a.system_prompt ?? ''; $.aiModel = a.model ?? ''
      $.aiTemperature = String(a.temperature ?? 0.7)
      $.aiMaxTokens = String(a.max_tokens ?? 2048)
      $.aiHITL = !!a.human_in_the_loop
      $.webhookUrl = a.webhook_url ?? ''; $.webhookSecret = a.webhook_secret ?? ''
      $.webhookRetryCount = String(a.webhook_retry_count ?? 3)
      $.kbChunkSize = String(a.chunk_size ?? 500)
      $.kbChunkOverlap = String(a.chunk_overlap ?? 50)
      $.kbId = a.kb_id ?? ''
      $.allowFileTools = a.allow_file_tools ?? false
      $.allowCommandExec = a.allow_command_exec ?? false
      $.kbOptions = (kbRes.agents ?? []).map((k: { id: string; name: string }) => ({ id: k.id, name: k.name }))
      $.boundSkills = skillRes.skills ?? []
      $.availableSkills = availRes.skills ?? []

      $.docs = []; $.docsLoading = false; $.newDocFilename = ''; $.newDocContent = ''
      $.uploading = false; $.expandedDoc = null; $.docChunks = []; $.loadingChunks = false
      $.showBatch = false

      $.whLogs = []; $.whLogsLoading = false

      if (a.type === 'knowledge_base') {
        ctx.api!.get<{ documents: KbDocument[] }>(`/api/agents/${agentId}/knowledge`)
          .then(d => { $.docs = d.documents ?? []; $.docsLoading = false; rerender() }).catch(() => { $.docsLoading = false; rerender() })
      }

      $.loading = false
      rerender()
    }).catch(() => { $.loading = false; rerender() })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    $.saving = true; $.error = ''; $.ok = ''
    const body: Record<string, unknown> = { name: $.name, description: $.description }
    if ($.agent?.type === 'ai') {
      body.system_prompt = $.systemPrompt; body.model = $.aiModel || null
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
      body.kb_id = $.kbId || null
    }
    if ($.agent?.type === 'webhook') {
      body.webhook_url = $.webhookUrl; body.webhook_secret = $.webhookSecret
      body.webhook_retry_count = parseInt($.webhookRetryCount) || 3
    }
    if ($.agent?.type === 'knowledge_base') {
      body.chunk_size = parseInt($.kbChunkSize) || 500
      body.chunk_overlap = parseInt($.kbChunkOverlap) || 50
    }
    try {
      await ctx.api!.put(`/api/agents/${agentId}`, body)
      $.ok = '保存成功'; $.saving = false
      rerender()
    } catch (e) { $.error = errMsg(e, '保存失败'); $.saving = false; rerender() }
  }

  async function bindSkill(skill: AvailableSkill) {
    // 后端契约：POST /api/agents/:id/skills 需要 { skill_name, skill_dir }
    const skillName = skill.meta?.name ?? skill.name ?? skill.slug
    const skillDir = skill.dir ?? skill.skill_dir
    if (!skillName || !skillDir) return
    await ctx.api!.post(`/api/agents/${agentId}/skills`, { skill_name: skillName, skill_dir: skillDir })
    const d = await ctx.api!.get(`/api/agents/${agentId}/skills`)
    $.boundSkills = d.skills ?? []
    rerender()
  }

  async function unbindSkill(id: string) {
    // 后端契约：DELETE /api/agents/:id/skills/:skillId 需要 agent_skills.id（UUID）
    await ctx.api!.delete(`/api/agents/${agentId}/skills/${id}`)
    const d = await ctx.api!.get(`/api/agents/${agentId}/skills`)
    $.boundSkills = d.skills ?? []
    rerender()
  }

  async function loadLogs() {
    $.logsLoading = true
    try {
      const d = await ctx.api!.get(`/api/stats/agents/${agentId}/logs`)
      $.logs = d.logs ?? []; $.logsLoading = false
      rerender()
    } catch { $.logsLoading = false; rerender() }
  }

  async function loadWebhookLogs() {
    $.whLogsLoading = true
    try {
      const d = await ctx.api!.get(`/api/stats/agents/${agentId}/webhook-logs`)
      $.whLogs = d.logs ?? []; $.whLogsLoading = false
      rerender()
    } catch { $.whLogsLoading = false; rerender() }
  }

  async function kbSearch() {
    if (!$.kbQuery.trim()) return
    $.kbSearching = true; rerender()
    try {
      const d = await ctx.api!.post(`/api/agents/${agentId}/knowledge/search`, { query: $.kbQuery, top_k: 3 })
      $.kbResults = d.results ?? []
    } catch (e) { $.kbResults = []; ctx.toast!('检索失败：' + errMsg(e, ''), 'error') }
    $.kbSearching = false; rerender()
  }

  async function previewSend() {
    if (!$.previewQuery.trim()) return
    $.previewing = true; $.previewText = ''; rerender()
    try {
      const token = localStorage.getItem('agent_platform_token') ?? ''
      const res = await fetch(`/api/agents/${agentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: $.previewQuery }),
      })
      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      if (reader) {
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value)
          for (const line of buf.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const d = JSON.parse(line.slice(6))
                if (d.text) { $.previewText += d.text; rerender() }
                if (d.content) { $.previewText = d.content; rerender() }
              } catch { /* 非 JSON 行跳过 */ }
            }
          }
        }
      }
    } catch (e) { $.previewText = '预览失败：' + errMsg(e, '') }
    $.previewing = false; rerender()
  }

  async function reindexDocs() {
    $.reindexing = true; rerender()
    try {
      const d = await ctx.api!.post(`/api/agents/${agentId}/knowledge/reindex`)
      ctx.toast!(`已重新向量化 ${(d as any).reindexed ?? 0} 个文档`, 'success')
      const rd = await ctx.api!.get(`/api/agents/${agentId}/knowledge`)
      $.docs = rd.documents ?? []
    } catch (e) { ctx.toast!('向量化失败：' + errMsg(e, ''), 'error') }
    $.reindexing = false; rerender()
  }

  async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function testWebhook() {    $.whTesting = true; rerender()
    try {
      const body = JSON.stringify({ content: '测试消息：验证 Webhook 机器人可用' })
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if ($.webhookSecret) {
        const ts = String(Date.now())
        const nonce = crypto.randomUUID()
        headers['X-Signature'] = await hmacSha256Hex($.webhookSecret, `${ts}.${body}`)
        headers['X-Timestamp'] = ts
        headers['X-Nonce'] = nonce
      }
      const res = await fetch(`/api/webhook/${agentId}`, { method: 'POST', headers, body })
      const d = await res.json().catch(() => ({}))
      $.whTestResult = (d as any).reply ?? (res.ok ? '调用成功（无回复）' : (d as any).error ?? `HTTP ${res.status}`)
      await loadWebhookLogs()
    } catch (e) {
      $.whTestResult = '调用失败：' + errMsg(e, '')
    }
    $.whTesting = false; rerender()
  }

  async function toggleExpandDoc(docId: string) {
    if ($.expandedDoc === docId) { $.expandedDoc = null; $.docChunks = []; rerender(); return }
    $.expandedDoc = docId; $.loadingChunks = true
    rerender()
    try {
      const d = await ctx.api!.get(`/api/knowledge/${docId}?chunks=true`).catch(() => null)
      if (d) $.docChunks = d.chunks ?? []
    } catch {}
    $.loadingChunks = false
    rerender()
  }

  async function uploadDoc(e: Event) {
    e.preventDefault()
    if (!$.newDocFilename.trim() || !$.newDocContent.trim()) return
    $.uploading = true
    rerender()
    try {
      await ctx.api!.post(`/api/agents/${agentId}/knowledge`, { filename: $.newDocFilename.trim(), content: $.newDocContent })
      {
        $.newDocFilename = ''; $.newDocContent = ''
        rerender()
        const d = await ctx.api!.get<{ documents: KbDocument[] }>(`/api/agents/${agentId}/knowledge`)
        $.docs = d.documents ?? []
        rerender()
      }
    } catch {}
    $.uploading = false
    rerender()
  }

  async function deleteDoc(docId: string) {
    await ctx.api!.delete(`/api/knowledge/${docId}`)
    const d = await ctx.api!.get(`/api/agents/${agentId}/knowledge`)
    $.docs = d.documents ?? []
    rerender()
  }

  return async (props) => {
    if ($.loading) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><Loading /></div>
    if ($.notFound) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="🧭" text="Agent 不存在" /></div>

    const a = $.agent ?? ({} as Partial<Agent>)
    const typeColor: Record<string, string> = { ai: '#8b5cf6', webhook: '#f59e0b', knowledge_base: '#22c55e', user: '#4f6ef7' }

    return (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <a class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>

      <Card>
        <div class="wf-row wf-gap-md">
          <Avatar name={a.name} color={typeColor[a.type ?? 'ai'] ?? '#64748b'} />
          <div class="wf-fill wf-stack wf-gap-xs">
            <div class="wf-text-lg wf-text-semibold">{a.name ?? '未命名'} <TypeBadge type={a.type ?? 'ai'} /></div>
            <div class="wf-text-sm wf-text-secondary">{a.description ?? ''} · 模型: {a.model ?? '-'}</div>
          </div>
        </div>
      </Card>

      <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>
      <div class="wf-mb-md">{$.ok && <Alert variant="success">{$.ok}</Alert>}</div>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md">基本设置</div>
        <form class="wf-stack wf-gap-md" onSubmit={handleSubmit}>
          <Field label="名称">
            <Input value={$.name} onInput={(e: Event) => { $.name = inputValue(e); rerender() }} />
          </Field>
          <Field label="描述">
            <Textarea value={$.description} onInput={(e: Event) => { $.description = inputValue(e); rerender() }} />
          </Field>

          {a.type === 'ai' && (
            <>
              <Field label="系统提示词">
                <Textarea rows={5} value={$.systemPrompt} onInput={(e: Event) => { $.systemPrompt = inputValue(e); rerender() }} />
              </Field>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="模型">
                    <Select value={$.aiModel} onChange={(v) => { $.aiModel = v as string; rerender() }}
                      options={MODELS.map(m => ({ value: m.value, label: m.label }))} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="温度">
                    <div class="wf-row wf-gap-sm">
                      <Slider min={0} max={2} step={0.1} value={$.aiTemperature}
                        onChange={(v) => { $.aiTemperature = String(v); rerender() }} />
                      <span class="wf-text-sm wf-text-semibold" style="min-width: 30px; text-align: center">{$.aiTemperature}</span>
                    </div>
                  </Field>
                </div>
              </div>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="最大 Token 数">
                    <Input type="number" min="64" max="8192" step="64" value={$.aiMaxTokens}
                      onInput={(e: Event) => { $.aiMaxTokens = inputValue(e); rerender() }} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="人工审批 (HITL)">
                    <Checkbox label="开启后 AI 回复需人工批准后才发送" checked={$.aiHITL}
                      onChange={(v: boolean) => { $.aiHITL = v; rerender() }} />
                  </Field>
                </div>
              </div>

              <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="folder" size={14} /> 工作空间</div>
              <Field label="绑定知识库" hint="search_knowledge_base 工具优先检索绑定知识库（未绑定 → 检索全部）">
                <Select value={$.kbId}
                  onChange={(v) => { $.kbId = v as string; rerender() }}
                  options={[{ value: '', label: '不绑定（检索全部）' }, ...$.kbOptions.map(k => ({ value: k.id, label: k.name }))]} />
              </Field>
              <div class="wf-bg-tertiary wf-p-md wf-rounded wf-text-sm wf-text-secondary">
                Agent 专用目录: <code>data/workspaces/{'{agent_id}'}/</code>
                <span class="wf-block wf-text-xs wf-text-tertiary wf-mt-xs">首次运行时自动创建</span>
              </div>
              <div class="wf-row wf-gap-lg">
                <Checkbox label="📄 启用文件工具 (read/write/edit/grep)" checked={$.allowFileTools}
                  onChange={(v: boolean) => { $.allowFileTools = v; rerender() }} />
                <Checkbox label="⚡ 启用命令执行 (bash)" checked={$.allowCommandExec}
                  onChange={(v: boolean) => { $.allowCommandExec = v; rerender() }} />
              </div>
            </>
          )}

          {a.type === 'webhook' && (
            <>
              <Field label="入站端点" hint="外部系统 POST JSON 到该地址即可触发 AI 应答（若设置 Secret，须带 X-Signature/X-Timestamp/X-Nonce 头）">
                <div class="wf-row wf-gap-xs">
                  <Input readonly value={`/api/webhook/${agentId}`} />
                  <Button type="button" variant="ghost" onClick={() => { void ctx.browser?.copyText(`/api/webhook/${agentId}`); ctx.toast!('已复制', 'success') }}><Icon name="copy" size={14} /></Button>
                </div>
              </Field>
              <Field label="Webhook URL" hint="预留出站回调地址——当前版本仅支持入站 API，可留空">
                <Input type="url" value={$.webhookUrl} onInput={(e: Event) => { $.webhookUrl = inputValue(e); rerender() }} />
              </Field>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="Webhook Secret" hint="设置后，请求必须携带 X-Signature: HMAC-SHA256(body) 头">
                    <div class="wf-row wf-gap-xs">
                      <Input type={$.secretVisible ? 'text' : 'password'} placeholder="留空不验证签名"
                        value={$.webhookSecret} onInput={(e: Event) => { $.webhookSecret = inputValue(e); rerender() }} />
                      <Button type="button" variant="ghost" onClick={() => { $.secretVisible = !$.secretVisible; rerender() }}>
                        {$.secretVisible ? '🙈' : '👁'}
                      </Button>
                    </div>
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="重试次数" hint="失败后指数退避重试（默认 3 次）">
                    <Input type="number" min="0" max="5" value={$.webhookRetryCount}
                      onInput={(e: Event) => { $.webhookRetryCount = inputValue(e); rerender() }} />
                  </Field>
                </div>
              </div>
            </>
          )}

          <div class="wf-right wf-gap-sm">
            <Button type="button" variant="ghost" onClick={() => ctx.app?.navigate('/agents')}>取消</Button>
            <Button type="submit" variant="primary" disabled={$.saving}>
              {$.saving ? '保存中...' : '保存修改'}
            </Button>
          </div>
        </form>
      </Card>

      {a.type === 'user' && (
        <Card>
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="user" size={14} /> 绑定账号</div>
          <div class="wf-split wf-py-sm wf-border-b">
            <span class="wf-text-sm wf-text-secondary">平台用户</span>
            <span class="wf-text-sm wf-text-medium wf-nums">{a.bound_user_name ?? '—'}</span>
          </div>
          <div class="wf-split wf-py-sm wf-border-b">
            <span class="wf-text-sm wf-text-secondary">登录邮箱</span>
            <span class="wf-text-sm wf-text-medium wf-nums">{a.bound_email ?? '—'}</span>
          </div>
          <div class="wf-py-sm">
            <div class="wf-text-sm wf-text-tertiary">该 Agent 对应平台注册用户，由注册流程自动创建；其发言以该用户身份发送。</div>
          </div>
        </Card>
      )}

      {a.type === 'ai' && (
        <Card>
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="settings" size={14} /> 技能管理</div>
          {$.boundSkills.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无绑定技能</div>}
          {$.boundSkills.map((s: BoundSkill) => (
            <div key={s.slug} class="wf-split wf-py-sm wf-border-b">
              <div class="wf-stack wf-gap-none">
                <span class="wf-text-sm wf-text-medium">{s.name}</span>
                <span class="wf-text-xs wf-text-tertiary">{s.description ?? ''}</span>
              </div>
              <Button size="sm" variant="danger" onClick={() => unbindSkill(s.id)}>解绑</Button>
            </div>
          ))}
          {$.availableSkills.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { $.showSkillPicker = !$.showSkillPicker; rerender() }}>
              {$.showSkillPicker ? '收起' : '+ 绑定技能'}
            </Button>
          )}
          {$.showSkillPicker && (
            <div class="wf-stack wf-gap-xs wf-mt-sm">
              {$.availableSkills.filter((as: AvailableSkill) => {
                const name = as.meta?.name ?? as.name ?? as.slug
                return !$.boundSkills.some((bs: BoundSkill) => bs.skill_name === name)
              }).map((s: AvailableSkill) => (
                <div key={s.dir ?? s.slug ?? s.id} class="wf-split wf-py-xs">
                  <span class="wf-text-sm">{s.meta?.name ?? s.name}</span>
                  <span class="wf-text-xs wf-text-tertiary">{s.meta?.description ?? s.description ?? ''}</span>
                  <Button size="sm" variant="primary" onClick={() => bindSkill(s)}>绑定</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {a.type === 'ai' && (
        <Card>
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="message" size={14} /> 测试对话</div>
          <div class="wf-row wf-gap-xs">
            <div class="wf-fill">
              <Input placeholder="输入消息测试提示词（如：介绍一下你自己）" value={$.previewQuery}
                onInput={(e: Event) => { $.previewQuery = inputValue(e); rerender() }} />
            </div>
            <Button size="sm" variant="primary" disabled={$.previewing} onClick={previewSend}>
              {$.previewing ? '回复中...' : '发送'}
            </Button>
          </div>
          {$.previewText && <pre class="wf-bg-secondary wf-rounded wf-p-sm wf-mt-sm wf-text-sm" style="white-space: pre-wrap; line-height: 1.6">{$.previewText}</pre>}
        </Card>
      )}

      {a.type === 'ai' && (
        <Card>
          <div class="wf-split wf-mb-sm">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="list" size={14} /> 执行日志</div>
            <Button size="sm" variant="ghost" onClick={loadLogs}>刷新</Button>
          </div>
          {$.logsLoading && <Loading />}
          {!$.logsLoading && $.logs.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无执行日志</div>}
          {!$.logsLoading && $.logs.length > 0 && (
            <Timeline items={$.logs.map((log: AgentLog) => ({
              key: log.id,
              title: '🤖 AI 执行',
              time: log.created_at ? new Date(log.created_at).toLocaleTimeString() : undefined,
              status: log.success === false ? 'error' : 'success',
              content: `${log.messages_count ?? 0} 条消息 · ${log.tokens_total ?? 0} tokens · ${log.elapsed_ms ?? 0}ms`,
            }))} />
          )}
        </Card>
      )}

      {a.type === 'webhook' && (
        <Card>
          <div class="wf-split wf-mb-sm">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="globe" size={14} /> Webhook 请求日志</div>
            <div class="wf-row wf-gap-xs">
              <Button size="sm" variant="primary" disabled={$.whTesting} onClick={testWebhook}>
                {$.whTesting ? '测试中...' : '发送测试请求'}
              </Button>
              <Button size="sm" variant="ghost" onClick={loadWebhookLogs}>刷新</Button>
            </div>
          </div>
          {$.whTestResult && <div class="wf-text-sm wf-text-medium wf-bg-secondary wf-rounded wf-p-sm wf-mb-sm">应答：{$.whTestResult}</div>}
          {$.whLogsLoading && <Loading />}
          {!$.whLogsLoading && $.whLogs.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-text-center wf-p-lg">暂无请求记录</div>}
          {$.whLogs.map((log: WebhookLog) => (
            <div key={log.id} class="wf-py-sm wf-border-b">
              <div class="wf-text-sm wf-text-medium"><Icon name={log.success ? 'check' : 'close'} size={14} /> HTTP {log.response_status ?? '?'}</div>
              <div class="wf-text-xs wf-text-tertiary">{log.created_at ? new Date(log.created_at).toLocaleString() : ''} · {log.elapsed_ms}ms</div>
            </div>
          ))}
        </Card>
      )}

      {a.type === 'knowledge_base' && (
        <Card>
          <div class="wf-split wf-mb-md">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📚 知识库文档</div>
            <span class="wf-text-xs wf-text-tertiary">{$.docs.length} 个文档</span>
            <Button size="sm" variant="ghost" disabled={$.reindexing} onClick={reindexDocs}>
              {$.reindexing ? '向量化中...' : '重新向量化'}
            </Button>
          </div>

          <div class="wf-row wf-gap-lg wf-mb-md">
            <div class="wf-fill">
              <Field label="分块大小">
                <Input type="number" min="100" max="2000" step="50" value={$.kbChunkSize}
                  onInput={(e: Event) => { $.kbChunkSize = inputValue(e); rerender() }} />
              </Field>
            </div>
            <div class="wf-fill">
              <Field label="分块重叠" hint="保存后新上传文档按新配置分块">
                <Input type="number" min="0" max="400" step="10" value={$.kbChunkOverlap}
                  onInput={(e: Event) => { $.kbChunkOverlap = inputValue(e); rerender() }} />
              </Field>
            </div>
          </div>

          <Card outlined>
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm">🔍 检索测试</div>
            <div class="wf-row wf-gap-xs">
              <div class="wf-fill">
                <Input placeholder="输入问题测试检索（如：退款政策是什么？）" value={$.kbQuery}
                  onInput={(e: Event) => { $.kbQuery = inputValue(e); rerender() }} />
              </div>
              <Button size="sm" variant="primary" disabled={$.kbSearching} onClick={kbSearch}>
                {$.kbSearching ? '检索中...' : '检索'}
              </Button>
            </div>
            {$.kbResults.length > 0 && (
              <div class="wf-stack wf-gap-sm wf-mt-sm">
                {$.kbResults.map((r: { filename: string; content: string; similarity: number }, i: number) => (
                  <div key={i} class="wf-bg-secondary wf-p-sm wf-rounded-sm wf-text-xs" style="line-height: 1.6">
                    <span class="wf-text-xs wf-text-medium">{r.filename} · 相似度 {(r.similarity ?? 0).toFixed(3)}</span><br />
                    {(r.content ?? '').slice(0, 200)}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {$.docs.length > 0 && (
            <div class="wf-stack wf-gap-none wf-mb-md">
              {$.docs.map((d: KbDocument) => (
                <div key={d.id}>
                  <div class="wf-row wf-gap-sm wf-py-sm wf-border-b" style="cursor: pointer" onClick={() => toggleExpandDoc(d.id)}>
                    <span>{$.expandedDoc === d.id ? <Icon name="folder" size={14} /> : <Icon name="file" size={14} />}</span>
                    <span class="wf-fill wf-text-sm wf-truncate">{d.filename}</span>
                    <span class="wf-text-xs wf-text-tertiary">{d.chunk_count ?? 0} 块</span>
                    <Button size="sm" variant="danger" onClick={(e: Event) => { e.stopPropagation(); deleteDoc(d.id) }}>删除</Button>
                  </div>
                  {$.expandedDoc === d.id && (
                    <div class="wf-bg-secondary wf-p-md wf-text-sm wf-stack wf-gap-sm">
                      {$.loadingChunks && <div class="wf-text-xs wf-text-tertiary">加载中...</div>}
                      {!$.loadingChunks && $.docChunks.length === 0 && <div class="wf-text-xs wf-text-tertiary">无分块数据</div>}
                      {$.docChunks.map((ch: KbChunk, i: number) => (
                        <div key={i} class="wf-surface wf-p-sm wf-rounded-sm wf-text-xs" style="line-height: 1.6">
                          <span class="wf-text-xs wf-text-tertiary">块 #{(ch.chunk_index ?? 0) + 1}</span><br />
                          {(ch.content ?? '').slice(0, 300)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form class="wf-stack wf-gap-md" onSubmit={uploadDoc}>
            <Field label="文件名">
              <Input type="text" placeholder="如：产品手册.txt" value={$.newDocFilename}
                onInput={(e: Event) => { $.newDocFilename = inputValue(e); rerender() }} />
            </Field>
            <Field label="文档内容">
              <Textarea rows={5} placeholder="粘贴文档内容..." value={$.newDocContent}
                onInput={(e: Event) => { $.newDocContent = inputValue(e); rerender() }} />
            </Field>
            <div class="wf-right">
              <Button type="submit" variant="primary" disabled={$.uploading}>
                {$.uploading ? '上传中...' : '上传文档'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
    )
  }
}
