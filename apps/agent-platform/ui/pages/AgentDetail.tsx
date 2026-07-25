import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, TypeBadge, Loading } from '../components/ui'

const MODELS = [
  { value: '', label: '默认 (环境变量 DEEPSEEK_MODEL)' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
]

export function AgentDetail(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  const agentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

  if (!ctx.ui.ready) {
    $.agent = null; $.loading = true; $.saving = false; $.notFound = false
    $.error = ''; $.ok = ''

    // 表单字段
    $.name = ''; $.description = ''; $.systemPrompt = ''
    $.aiModel = ''; $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'
    $.aiHITL = false; $.webhookUrl = ''; $.webhookSecret = ''
    $.webhookRetryCount = '3'; $.secretVisible = false
    $.allowFileTools = false; $.allowCommandExec = false

    // 技能管理
    $.boundSkills = []; $.availableSkills = []; $.showSkillPicker = false

    // 执行日志
    $.logs = []; $.logsLoading = false

    Promise.all([
      fetch(`/api/agents/${agentId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/agents/${agentId}/skills`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({ skills: [] })),
      fetch('/api/skills/available', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({ skills: [] })),
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

      // 知识库文档
      $.docs = []; $.docsLoading = false; $.newDocFilename = ''; $.newDocContent = ''
      $.uploading = false; $.expandedDoc = null; $.docChunks = []; $.loadingChunks = false
      $.showBatch = false

      // Webhook 日志
      $.whLogs = []; $.whLogsLoading = false

      if (a.type === 'knowledge_base') {
        fetch(`/api/agents/${agentId}/knowledge`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then(d => { $.docs = d.documents ?? [] }).catch(() => {})
      }

      $.loading = false
    }).catch(() => { $.loading = false })
  }

  if ($.loading) return <div class="page"><Loading /></div>
  if ($.notFound) return <div class="page"><div class="empty" style={{ paddingTop: '20vh' }}><div class="empty-ico">🧭</div><div class="empty-txt">Agent 不存在</div></div></div>
  const a = $.agent ?? {}

  async function handleSubmit(e: Event) {
    e.preventDefault()
    $.saving = true; $.error = ''; $.ok = ''
    const body: Record<string, any> = { name: $.name, description: $.description }
    if (a.type === 'ai') {
      body.system_prompt = $.systemPrompt; body.model = $.aiModel || null
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
    }
    if (a.type === 'webhook') {
      body.webhook_url = $.webhookUrl; body.webhook_secret = $.webhookSecret
      body.webhook_retry_count = parseInt($.webhookRetryCount) || 3
    }
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '保存失败'; $.saving = false; return }
      $.ok = '保存成功'; $.saving = false
    } catch { $.error = '网络错误'; $.saving = false }
  }

  async function bindSkill(slug: string) {
    await fetch(`/api/agents/${agentId}/skills`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ skill_slug: slug }),
    })
    const d = await fetch(`/api/agents/${agentId}/skills`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    $.boundSkills = d.skills ?? []
  }

  async function unbindSkill(slug: string) {
    await fetch(`/api/agents/${agentId}/skills/${slug}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const d = await fetch(`/api/agents/${agentId}/skills`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    $.boundSkills = d.skills ?? []
  }

  async function loadLogs() {
    $.logsLoading = true
    const d = await fetch(`/api/agents/${agentId}/logs?limit=20`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    $.logs = d.logs ?? []; $.logsLoading = false
  }

  async function loadWebhookLogs() {
    $.whLogsLoading = true
    const d = await fetch(`/api/stats/agents/${agentId}/webhook-logs`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    $.whLogs = d.logs ?? []; $.whLogsLoading = false
  }

  async function toggleExpandDoc(docId: string) {
    if ($.expandedDoc === docId) { $.expandedDoc = null; $.docChunks = []; return }
    $.expandedDoc = docId; $.loadingChunks = true
    try {
      const res = await fetch(`/api/knowledge/${docId}?chunks=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); $.docChunks = d.chunks ?? [] }
    } catch {}
    $.loadingChunks = false
  }

  async function uploadDoc(e: Event) {
    e.preventDefault()
    if (!$.newDocFilename.trim() || !$.newDocContent.trim()) return
    $.uploading = true
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: $.newDocFilename.trim(), content: $.newDocContent }),
      })
      if (res.ok) {
        $.newDocFilename = ''; $.newDocContent = ''
        const d = await fetch(`/api/agents/${agentId}/knowledge`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        $.docs = d.documents ?? []
      }
    } catch {}
    $.uploading = false
  }

  async function deleteDoc(docId: string) {
    await fetch(`/api/knowledge/${docId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const d = await fetch(`/api/agents/${agentId}/knowledge`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    $.docs = d.documents ?? []
  }

  return (
    <div class="page page-narrow">
      <a class="back-link" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>

      <div class="card card-pad detail-hero" style={{ marginBottom: '16px' }}>
        <div class={`ava ava-${a.type ?? 'ai'}`}>{(a.name ?? '?')[0]}</div>
        <div class="detail-hero-info">
          <div class="detail-hero-name">{a.name ?? '未命名'} <TypeBadge type={a.type ?? 'ai'} /></div>
          <div class="detail-hero-sub">{a.description ?? ''} · 模型: {a.model ?? '-'}</div>
        </div>
      </div>

      {$.error && <div class="alert alert-err">{$.error}</div>}
      {$.ok && <div class="alert alert-ok">{$.ok}</div>}

      <form class="card card-pad" onSubmit={handleSubmit}>
        <div class="sect-title" style={{ marginBottom: '16px' }}>基本设置</div>

        <div class="field"><label class="field-label">名称</label>
          <input class="input" value={$.name} onInput={(e: any) => { $.name = e.target.value }} /></div>
        <div class="field"><label class="field-label">描述</label>
          <textarea class="textarea" value={$.description} onInput={(e: any) => { $.description = e.target.value }} /></div>

        {/* AI 配置 */}
        {a.type === 'ai' && (
          <>
            <div class="field"><label class="field-label">系统提示词</label>
              <textarea class="textarea" rows={5} value={$.systemPrompt} onInput={(e: any) => { $.systemPrompt = e.target.value }} /></div>
            <div class="form-row">
              <div class="field"><label class="field-label">模型</label>
                <select class="select" value={$.aiModel} onChange={(e: any) => { $.aiModel = e.target.value }}>
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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

            <div class="sect-title" style={{ marginTop: '20px', marginBottom: '12px' }}>📁 工作空间</div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '10px', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px' }}>
              Agent 专用目录: <code style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}>data/workspaces/{'{agent_id}'}/</code>
              <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--text-3)' }}>首次运行时自动创建</span>
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

        {/* Webhook 配置 */}
        {a.type === 'webhook' && (
          <>
            <div class="field"><label class="field-label">Webhook URL</label>
              <input class="input" type="url" value={$.webhookUrl} onInput={(e: any) => { $.webhookUrl = e.target.value }} />
              <div class="field-hint">消息将以 POST JSON 推送到该地址</div></div>
            <div class="form-row">
              <div class="field"><label class="field-label">Webhook Secret</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input class="input" type={$.secretVisible ? 'text' : 'password'} placeholder="留空不验证签名"
                    value={$.webhookSecret} onInput={(e: any) => { $.webhookSecret = e.target.value }} />
                  <button type="button" class="btn btn-ghost btn-sm" onClick={() => { $.secretVisible = !$.secretVisible }}
                    style={{ flex: 'none', padding: '9px 12px' }}>{$.secretVisible ? '🙈' : '👁'}</button>
                </div>
                <div class="field-hint">设置后，请求必须携带 X-Signature: HMAC-SHA256(body) 头</div></div>
              <div class="field"><label class="field-label">重试次数</label>
                <input class="input" type="number" min="0" max="5" value={$.webhookRetryCount}
                  onInput={(e: any) => { $.webhookRetryCount = e.target.value }} />
                <div class="field-hint">失败后指数退避重试（默认 3 次）</div></div>
            </div>
          </>
        )}

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app?.navigate('/agents')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={$.saving}>
            {$.saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </form>

      {/* 技能管理 */}
      {a.type === 'ai' && (
        <div class="card card-pad mt-24">
          <div class="sect-title" style={{ marginBottom: '12px' }}>🔧 技能管理</div>
          {$.boundSkills.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-3)', padding: '12px 0' }}>暂无绑定技能</div>}
          {$.boundSkills.map((s: any) => (
            <div key={s.slug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '13px' }}>{s.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{s.description ?? ''}</div>
              </div>
              <button class="btn btn-danger btn-sm" onClick={() => unbindSkill(s.slug)}>解绑</button>
            </div>
          ))}
          {$.availableSkills.length > 0 && (
            <button class="btn btn-ghost btn-sm" style={{ marginTop: '10px' }}
              onClick={() => { $.showSkillPicker = !$.showSkillPicker }}>
              {$.showSkillPicker ? '收起' : '+ 绑定技能'}
            </button>
          )}
          {$.showSkillPicker && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {$.availableSkills.filter((as: any) => !$.boundSkills.some((bs: any) => bs.slug === as.slug)).map((s: any) => (
                <div key={s.slug} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px' }}>{s.name}</span>
                  <button class="btn btn-primary btn-sm" onClick={() => bindSkill(s.slug)}>绑定</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 执行日志 */}
      {a.type === 'ai' && (
        <div class="card card-pad mt-24">
          <div class="sect-title" style={{ marginBottom: '8px' }}>
            📋 执行日志
            <button class="btn btn-ghost btn-sm" style={{ marginLeft: '8px' }} onClick={loadLogs}>刷新</button>
          </div>
          {$.logsLoading && <Loading />}
          {!$.logsLoading && $.logs.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-3)', padding: '12px 0' }}>暂无执行日志</div>}
          {$.logs.map((log: any) => (
            <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>{log.type === 'ai:response' ? '🤖 AI 回复' : log.type === 'tool:call' ? '🔧 工具调用' : '📝 ' + (log.type ?? '日志')}</span>
                <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>{log.status ?? ''}</span>
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '12px' }}>{log.summary ?? (log.content ?? '').slice(0, 100)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Webhook 日志 */}
      {a.type === 'webhook' && (
        <div class="card card-pad mt-24">
          <div class="sect-title" style={{ marginBottom: '12px' }}>
            📋 Webhook 请求日志
            <button class="btn btn-ghost btn-sm" style={{ marginLeft: '8px' }} onClick={loadWebhookLogs}>刷新</button>
          </div>
          {$.whLogsLoading && <Loading />}
          {!$.whLogsLoading && $.whLogs.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'center', padding: '24px' }}>暂无请求记录</div>}
          {$.whLogs.map((log: any) => (
            <div key={log.id} class="check-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{log.success ? '✅' : '❌'} HTTP {log.response_status ?? '?'}</div>
                <div class="muted" style={{ fontSize: '11px' }}>{log.created_at ? new Date(log.created_at).toLocaleString() : ''} · {log.elapsed_ms}ms</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 知识库文档 */}
      {a.type === 'knowledge_base' && (
        <div class="card card-pad mt-24">
          <div class="sect-title" style={{ marginBottom: '16px' }}>
            📚 知识库文档
            <span class="muted" style={{ fontWeight: 400, fontSize: '12px', marginLeft: '8px' }}>{$.docs.length} 个文档</span>
          </div>

          {$.docs.length > 0 && (
            <div class="check-list" style={{ marginBottom: '18px' }}>
              {$.docs.map((d: any) => (
                <div key={d.id}>
                  <div class="check-item" onClick={() => toggleExpandDoc(d.id)} style={{ cursor: 'pointer' }}>
                    <span>{$.expandedDoc === d.id ? '📂' : '📄'}</span>
                    <span style={{ flex: 1 }}>{d.filename}</span>
                    <span class="muted" style={{ fontSize: '12px', marginRight: '8px' }}>{d.chunk_count ?? 0} 块</span>
                    <button class="btn btn-danger btn-sm" onClick={(e: any) => { e.stopPropagation(); deleteDoc(d.id) }}>删除</button>
                  </div>
                  {$.expandedDoc === d.id && (
                    <div style={{ padding: '12px 16px 12px 44px', borderTop: '1px solid #f3f4f6', background: '#fafbfc', fontSize: '13px' }}>
                      {$.loadingChunks && <div class="muted" style={{ padding: '8px 0' }}>加载中...</div>}
                      {!$.loadingChunks && $.docChunks.length === 0 && <div class="muted" style={{ padding: '8px 0' }}>无分块数据</div>}
                      {$.docChunks.map((ch: any, i: number) => (
                        <div key={i} style={{ padding: '8px 10px', borderRadius: '6px', background: '#fff', border: '1px solid #e5e7eb', fontSize: '12px', lineHeight: '1.6', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>块 #{ch.chunk_index + 1}</span><br />
                          {(ch.content ?? '').slice(0, 300)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={uploadDoc}>
            <div class="field"><label class="field-label">文件名</label>
              <input class="input" type="text" placeholder="如：产品手册.txt" value={$.newDocFilename}
                onInput={(e: any) => { $.newDocFilename = e.target.value }} /></div>
            <div class="field"><label class="field-label">文档内容</label>
              <textarea class="textarea" rows={5} placeholder="粘贴文档内容..." value={$.newDocContent}
                onInput={(e: any) => { $.newDocContent = e.target.value }} /></div>
            <button type="submit" class="btn btn-primary" disabled={$.uploading}>
              {$.uploading ? '上传中...' : '上传文档'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
