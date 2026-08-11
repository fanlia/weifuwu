import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, TypeBadge, Loading, errMsg } from '../components/ui'
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Slider, Textarea, Timeline } from 'weifuwu/components'

const MODELS = [
  { value: '', label: '默认 (环境变量 DEEPSEEK_MODEL)' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
]

export const AgentDetail: Component = async (_props, ctx) => {
  const $ = ctx.ui.$()
  const agentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

    $.agent = null; $.loading = true; $.saving = false; $.notFound = false
    $.error = ''; $.ok = ''

    $.name = ''; $.description = ''; $.systemPrompt = ''
    $.aiModel = ''; $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'
    $.aiHITL = false; $.webhookUrl = ''; $.webhookSecret = ''
    $.webhookRetryCount = '3'; $.secretVisible = false
    $.allowFileTools = false; $.allowCommandExec = false

    $.boundSkills = []; $.availableSkills = []; $.showSkillPicker = false

    $.logs = []; $.logsLoading = false

    Promise.all([
      ctx.api!.get(`/api/agents/${agentId}`),
      ctx.api!.get(`/api/agents/${agentId}/skills`).catch(() => ({ skills: [] })),
      ctx.api!.get('/api/skills/available').catch(() => ({ skills: [] })),
    ]).then(([agentRes, skillRes, availRes]) => {
      const a = agentRes.agent ?? agentRes
      if (!a?.id) { $.notFound = true; $.loading = false; return }
      $.agent = a; $.name = a.name ?? ''; $.description = a.description ?? ''
      $.systemPrompt = a.system_prompt ?? ''; $.aiModel = a.model ?? ''
      $.aiTemperature = String(a.temperature ?? 0.7)
      $.aiMaxTokens = String(a.max_tokens ?? 2048)
      $.aiHITL = !!a.human_in_the_loop
      $.webhookUrl = a.webhook_url ?? ''; $.webhookSecret = a.webhook_secret ?? ''
      $.webhookRetryCount = String(a.webhook_retry_count ?? 3)
      $.allowFileTools = a.allow_file_tools ?? false
      $.allowCommandExec = a.allow_command_exec ?? false
      $.boundSkills = skillRes.skills ?? []
      $.availableSkills = availRes.skills ?? []

      $.docs = []; $.docsLoading = false; $.newDocFilename = ''; $.newDocContent = ''
      $.uploading = false; $.expandedDoc = null; $.docChunks = []; $.loadingChunks = false
      $.showBatch = false

      $.whLogs = []; $.whLogsLoading = false

      if (a.type === 'knowledge_base') {
        ctx.api!.get(`/api/agents/${agentId}/knowledge`)
          .then(d => { $.docs = d.documents ?? [] }).catch(() => {})
      }

      $.loading = false
    }).catch(() => { $.loading = false })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    $.saving = true; $.error = ''; $.ok = ''
    const body: Record<string, any> = { name: $.name, description: $.description }
    if ($.agent?.type === 'ai') {
      body.system_prompt = $.systemPrompt; body.model = $.aiModel || null
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
    }
    if ($.agent?.type === 'webhook') {
      body.webhook_url = $.webhookUrl; body.webhook_secret = $.webhookSecret
      body.webhook_retry_count = parseInt($.webhookRetryCount) || 3
    }
    try {
      await ctx.api!.put(`/api/agents/${agentId}`, body)
      $.ok = '保存成功'; $.saving = false
    } catch (e) { $.error = errMsg(e, '保存失败'); $.saving = false }
  }

  async function bindSkill(skill: any) {
    // 后端契约：POST /api/agents/:id/skills 需要 { skill_name, skill_dir }
    const skillName = skill.meta?.name ?? skill.name ?? skill.slug
    const skillDir = skill.dir ?? skill.skill_dir
    if (!skillName || !skillDir) return
    await ctx.api!.post(`/api/agents/${agentId}/skills`, { skill_name: skillName, skill_dir: skillDir })
    const d = await ctx.api!.get(`/api/agents/${agentId}/skills`)
    $.boundSkills = d.skills ?? []
  }

  async function unbindSkill(id: string) {
    // 后端契约：DELETE /api/agents/:id/skills/:skillId 需要 agent_skills.id（UUID）
    await ctx.api!.delete(`/api/agents/${agentId}/skills/${id}`)
    const d = await ctx.api!.get(`/api/agents/${agentId}/skills`)
    $.boundSkills = d.skills ?? []
  }

  async function loadLogs() {
    $.logsLoading = true
    try {
      const d = await ctx.api!.get(`/api/stats/agents/${agentId}/logs`)
      $.logs = d.logs ?? []; $.logsLoading = false
    } catch { $.logsLoading = false }
  }

  async function loadWebhookLogs() {
    $.whLogsLoading = true
    try {
      const d = await ctx.api!.get(`/api/stats/agents/${agentId}/webhook-logs`)
      $.whLogs = d.logs ?? []; $.whLogsLoading = false
    } catch { $.whLogsLoading = false }
  }

  async function toggleExpandDoc(docId: string) {
    if ($.expandedDoc === docId) { $.expandedDoc = null; $.docChunks = []; return }
    $.expandedDoc = docId; $.loadingChunks = true
    try {
      const d = await ctx.api!.get(`/api/knowledge/${docId}?chunks=true`).catch(() => null)
      if (d) $.docChunks = d.chunks ?? []
    } catch {}
    $.loadingChunks = false
  }

  async function uploadDoc(e: Event) {
    e.preventDefault()
    if (!$.newDocFilename.trim() || !$.newDocContent.trim()) return
    $.uploading = true
    try {
      await ctx.api!.post(`/api/agents/${agentId}/knowledge`, { filename: $.newDocFilename.trim(), content: $.newDocContent })
      {
        $.newDocFilename = ''; $.newDocContent = ''
        const d = await ctx.api!.get(`/api/agents/${agentId}/knowledge`)
        $.docs = d.documents ?? []
      }
    } catch {}
    $.uploading = false
  }

  async function deleteDoc(docId: string) {
    await ctx.api!.delete(`/api/knowledge/${docId}`)
    const d = await ctx.api!.get(`/api/agents/${agentId}/knowledge`)
    $.docs = d.documents ?? []
  }

  return (props) => {
    if ($.loading) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><Loading /></div>
    if ($.notFound) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="🧭" text="Agent 不存在" /></div>

    const a = $.agent ?? {}
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
            <Input value={$.name} onInput={(e: any) => { $.name = e.target.value }} />
          </Field>
          <Field label="描述">
            <Textarea value={$.description} onInput={(e: any) => { $.description = e.target.value }} />
          </Field>

          {a.type === 'ai' && (
            <>
              <Field label="系统提示词">
                <Textarea rows={5} value={$.systemPrompt} onInput={(e: any) => { $.systemPrompt = e.target.value }} />
              </Field>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="模型">
                    <Select value={$.aiModel} onChange={(v) => { $.aiModel = v as string }}
                      options={MODELS.map(m => ({ value: m.value, label: m.label }))} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="温度">
                    <div class="wf-row wf-gap-sm">
                      <Slider min={0} max={2} step={0.1} value={$.aiTemperature}
                        onChange={(v) => { $.aiTemperature = v }} />
                      <span class="wf-text-sm wf-text-semibold" style="min-width: 30px; text-align: center">{$.aiTemperature}</span>
                    </div>
                  </Field>
                </div>
              </div>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="最大 Token 数">
                    <Input type="number" min="64" max="8192" step="64" value={$.aiMaxTokens}
                      onInput={(e: any) => { $.aiMaxTokens = e.target.value }} />
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="人工审批 (HITL)">
                    <Checkbox label="开启后 AI 回复需人工批准后才发送" checked={$.aiHITL}
                      onChange={(v: boolean) => { $.aiHITL = v }} />
                  </Field>
                </div>
              </div>

              <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📁 工作空间</div>
              <div class="wf-bg-tertiary wf-p-md wf-rounded wf-text-sm wf-text-secondary">
                Agent 专用目录: <code>data/workspaces/{'{agent_id}'}/</code>
                <span class="wf-block wf-text-xs wf-text-tertiary wf-mt-xs">首次运行时自动创建</span>
              </div>
              <div class="wf-row wf-gap-lg">
                <Checkbox label="📄 启用文件工具 (read/write/edit/grep)" checked={$.allowFileTools}
                  onChange={(v: boolean) => { $.allowFileTools = v }} />
                <Checkbox label="⚡ 启用命令执行 (bash)" checked={$.allowCommandExec}
                  onChange={(v: boolean) => { $.allowCommandExec = v }} />
              </div>
            </>
          )}

          {a.type === 'webhook' && (
            <>
              <Field label="Webhook URL" hint="消息将以 POST JSON 推送到该地址">
                <Input type="url" value={$.webhookUrl} onInput={(e: any) => { $.webhookUrl = e.target.value }} />
              </Field>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="Webhook Secret" hint="设置后，请求必须携带 X-Signature: HMAC-SHA256(body) 头">
                    <div class="wf-row wf-gap-xs">
                      <Input type={$.secretVisible ? 'text' : 'password'} placeholder="留空不验证签名"
                        value={$.webhookSecret} onInput={(e: any) => { $.webhookSecret = e.target.value }} />
                      <Button type="button" variant="ghost" onClick={() => { $.secretVisible = !$.secretVisible }}>
                        {$.secretVisible ? '🙈' : '👁'}
                      </Button>
                    </div>
                  </Field>
                </div>
                <div class="wf-fill">
                  <Field label="重试次数" hint="失败后指数退避重试（默认 3 次）">
                    <Input type="number" min="0" max="5" value={$.webhookRetryCount}
                      onInput={(e: any) => { $.webhookRetryCount = e.target.value }} />
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

      {a.type === 'ai' && (
        <Card>
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm">🔧 技能管理</div>
          {$.boundSkills.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无绑定技能</div>}
          {$.boundSkills.map((s: any) => (
            <div key={s.slug} class="wf-split wf-py-sm wf-border-b">
              <div class="wf-stack wf-gap-none">
                <span class="wf-text-sm wf-text-medium">{s.name}</span>
                <span class="wf-text-xs wf-text-tertiary">{s.description ?? ''}</span>
              </div>
              <Button size="sm" variant="danger" onClick={() => unbindSkill(s.id)}>解绑</Button>
            </div>
          ))}
          {$.availableSkills.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { $.showSkillPicker = !$.showSkillPicker }}>
              {$.showSkillPicker ? '收起' : '+ 绑定技能'}
            </Button>
          )}
          {$.showSkillPicker && (
            <div class="wf-stack wf-gap-xs wf-mt-sm">
              {$.availableSkills.filter((as: any) => {
                const name = as.meta?.name ?? as.name ?? as.slug
                return !$.boundSkills.some((bs: any) => bs.skill_name === name)
              }).map((s: any) => (
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
          <div class="wf-split wf-mb-sm">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📋 执行日志</div>
            <Button size="sm" variant="ghost" onClick={loadLogs}>刷新</Button>
          </div>
          {$.logsLoading && <Loading />}
          {!$.logsLoading && $.logs.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无执行日志</div>}
          {!$.logsLoading && $.logs.length > 0 && (
            <Timeline items={$.logs.map((log: any) => ({
              key: log.id,
              title: '🤖 AI 执行' + (log.type && log.type !== 'execution' ? ` · ${log.type}` : ''),
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
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📋 Webhook 请求日志</div>
            <Button size="sm" variant="ghost" onClick={loadWebhookLogs}>刷新</Button>
          </div>
          {$.whLogsLoading && <Loading />}
          {!$.whLogsLoading && $.whLogs.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-text-center wf-p-lg">暂无请求记录</div>}
          {$.whLogs.map((log: any) => (
            <div key={log.id} class="wf-py-sm wf-border-b">
              <div class="wf-text-sm wf-text-medium">{log.success ? '✅' : '❌'} HTTP {log.response_status ?? '?'}</div>
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
          </div>

          {$.docs.length > 0 && (
            <div class="wf-stack wf-gap-none wf-mb-md">
              {$.docs.map((d: any) => (
                <div key={d.id}>
                  <div class="wf-row wf-gap-sm wf-py-sm wf-border-b" style="cursor: pointer" onClick={() => toggleExpandDoc(d.id)}>
                    <span>{$.expandedDoc === d.id ? '📂' : '📄'}</span>
                    <span class="wf-fill wf-text-sm wf-truncate">{d.filename}</span>
                    <span class="wf-text-xs wf-text-tertiary">{d.chunk_count ?? 0} 块</span>
                    <Button size="sm" variant="danger" onClick={(e: any) => { e.stopPropagation(); deleteDoc(d.id) }}>删除</Button>
                  </div>
                  {$.expandedDoc === d.id && (
                    <div class="wf-bg-secondary wf-p-md wf-text-sm wf-stack wf-gap-sm">
                      {$.loadingChunks && <div class="wf-text-xs wf-text-tertiary">加载中...</div>}
                      {!$.loadingChunks && $.docChunks.length === 0 && <div class="wf-text-xs wf-text-tertiary">无分块数据</div>}
                      {$.docChunks.map((ch: any, i: number) => (
                        <div key={i} class="wf-surface wf-p-sm wf-rounded-sm wf-text-xs" style="line-height: 1.6">
                          <span class="wf-text-xs wf-text-tertiary">块 #{ch.chunk_index + 1}</span><br />
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
                onInput={(e: any) => { $.newDocFilename = e.target.value }} />
            </Field>
            <Field label="文档内容">
              <Textarea rows={5} placeholder="粘贴文档内容..." value={$.newDocContent}
                onInput={(e: any) => { $.newDocContent = e.target.value }} />
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
