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
  aiModel: string; aiTemperature: string; aiMaxTokens: string; aiQuota: string; quotaUsed: number
  versions: any[]; versionNote: string; savingVersion: boolean; rollingBack: string | null
  aiHITL: boolean; webhookUrl: string; webhookSecret: string
  webhookRetryCount: string; secretVisible: boolean
  kbChunkSize: string; kbChunkOverlap: string
  kbOptions: Array<{ id: string; name: string }>; kbId: string
  kbQuery: string; kbResults: Array<{ filename: string; content: string; similarity: number }>
  kbSearching: boolean; reindexing: boolean
  previewQuery: string; previewText: string; previewing: boolean
  allowFileTools: boolean; allowCommandExec: boolean; allowNetwork: boolean
  boundSkills: BoundSkill[]; availableSkills: AvailableSkill[]; showSkillPicker: boolean
  logs: AgentLog[]; logsLoading: boolean
  docs: KbDocument[]; docsLoading: boolean
  newDocFilename: string; newDocContent: string
  uploading: boolean; expandedDoc: string | null
  docChunks: KbChunk[]; loadingChunks: boolean
  showBatch: boolean
  wsEntries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }>
  wsPath: string; wsLoading: boolean
  wsOpenFile: { path: string; content: string; binary: boolean; truncated: boolean; size: number } | null
  wsEditContent: string; wsSaving: boolean
  whLogs: WebhookLog[]; whLogsLoading: boolean
  whTesting: boolean; whTestResult: string
  whTestContent: string; whTestStatus: number | null; whTestElapsed: number | null
  expandedWhLog: string | null; whLogFilter: 'all' | 'success' | 'fail'
  showGuide: boolean; guideTab: 'curl' | 'node'
}

export const AgentDetail: Component = async (_props, ctx) => {
  const $ = {} as AgentDetailState
  const rerender = () => ctx.ui.render()
  const agentId = ctx.route?.params?.id ?? ''

    $.agent = null; $.loading = true; $.saving = false; $.notFound = false
    $.error = ''; $.ok = ''

    $.name = ''; $.description = ''; $.systemPrompt = ''
    $.aiModel = ''; $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'; $.aiQuota = '0'; $.quotaUsed = 0; $.versions = []; $.versionNote = ''; $.savingVersion = false; $.rollingBack = null
    $.aiHITL = false; $.webhookUrl = ''; $.webhookSecret = ''
    $.webhookRetryCount = '3'; $.secretVisible = false
    $.kbChunkSize = '500'; $.kbChunkOverlap = '50'
    $.kbQuery = ''; $.kbResults = []; $.kbSearching = false
    $.previewQuery = ''; $.previewText = ''; $.previewing = false
    $.allowFileTools = false; $.allowCommandExec = false; $.allowNetwork = false

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
      $.aiQuota = String(a.monthly_token_quota ?? 0)
      $.quotaUsed = Number(a.quota_used ?? 0)
      loadVersions()
      if (a.type === 'ai') loadLogs()
      $.aiHITL = !!a.human_in_the_loop
      $.webhookUrl = a.webhook_url ?? ''; $.webhookSecret = a.webhook_secret ?? ''
      $.webhookRetryCount = String(a.webhook_retry_count ?? 3)
      $.kbChunkSize = String(a.chunk_size ?? 500)
      $.kbChunkOverlap = String(a.chunk_overlap ?? 50)
      $.kbId = a.kb_id ?? ''
      $.allowFileTools = a.allow_file_tools ?? false
      $.allowCommandExec = a.allow_command_exec ?? false
      $.allowNetwork = a.allow_network ?? false
      $.kbOptions = (kbRes.agents ?? []).map((k: { id: string; name: string }) => ({ id: k.id, name: k.name }))
      $.boundSkills = skillRes.skills ?? []
      $.availableSkills = availRes.skills ?? []

      $.docs = []; $.docsLoading = false; $.newDocFilename = ''; $.newDocContent = ''
      $.uploading = false; $.expandedDoc = null; $.docChunks = []; $.loadingChunks = false
      $.showBatch = false

      $.whLogs = []; $.whLogsLoading = false; $.whLogFilter = 'all'
    $.whTestContent = ''; $.whTestStatus = null; $.whTestElapsed = null
    $.expandedWhLog = null; $.showGuide = false; $.guideTab = 'curl'
    $.wsEntries = []; $.wsPath = ''; $.wsLoading = false
    $.wsOpenFile = null; $.wsEditContent = ''; $.wsSaving = false

      if (a.type === 'knowledge_base') {
        ctx.api!.get<{ documents: KbDocument[] }>(`/api/agents/${agentId}/knowledge`)
          .then(d => { $.docs = d.documents ?? []; $.docsLoading = false; rerender() }).catch(() => { $.docsLoading = false; rerender() })
      }
      if (a.type === 'ai' && a.allow_file_tools) {
        loadWsList()
      }

      $.loading = false
      rerender()
    }).catch((e) => {
      // 404/无权限 → notFound；其他（网络/500）→ 显示错误信息（不误报“不存在”）
      const msg = errMsg(e, '').toLowerCase()
      if (msg.includes('不存在') || msg.includes('unauthorized') || msg.includes('未授权')) {
        $.notFound = true
      } else {
        $.error = errMsg(e, '加载 Agent 失败')
        $.agent = null
      }
      $.loading = false
      rerender()
    })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    $.saving = true; $.error = ''; $.ok = ''
    const body: Record<string, unknown> = { name: $.name, description: $.description }
    if ($.agent?.type === 'ai') {
      body.system_prompt = $.systemPrompt; body.model = $.aiModel || null
      body.temperature = parseFloat($.aiTemperature) || 0.7
      body.max_tokens = parseInt($.aiMaxTokens) || 2048
      body.monthly_token_quota = parseInt($.aiQuota) || 0
      body.human_in_the_loop = $.aiHITL
      body.allow_file_tools = $.allowFileTools
      body.allow_command_exec = $.allowCommandExec
      body.allow_network = $.allowNetwork
      body.kb_id = $.kbId || null
    }
    if ($.agent?.type === 'webhook') {
      body.webhook_url = $.webhookUrl.trim() || null
      body.webhook_secret = $.webhookSecret
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

  async function loadWsList(path = '') {
    $.wsLoading = true; rerender()
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : ''
      const d = await ctx.api!.get(`/api/agents/${agentId}/workspace/list${q}`)
      $.wsEntries = d.entries ?? []; $.wsPath = d.path ?? '/'
    } catch (e) { ctx.toast!('加载失败：' + errMsg(e, ''), 'error') }
    $.wsLoading = false; rerender()
  }

  async function openWsFile(entry: { name: string; type: string }) {
    if (entry.type === 'dir') {
      await loadWsList($.wsPath === '/' ? entry.name : `${$.wsPath}/${entry.name}`)
      return
    }
    try {
      const rel = $.wsPath === '/' ? entry.name : `${$.wsPath}/${entry.name}`
      const d = await ctx.api!.get(`/api/agents/${agentId}/workspace/file?path=${encodeURIComponent(rel)}`)
      if (d.binary) { ctx.toast!('二进制文件不可预览', 'error'); return }
      $.wsOpenFile = { path: rel, content: d.content ?? '', binary: d.binary, truncated: d.truncated, size: d.size }
      $.wsEditContent = d.content ?? ''
      rerender()
    } catch (e) { ctx.toast!('读取失败：' + errMsg(e, ''), 'error') }
  }

  async function saveWsFile() {
    if (!$.wsOpenFile) return
    $.wsSaving = true; rerender()
    try {
      const d = await ctx.api!.put(`/api/agents/${agentId}/workspace/file`, { path: $.wsOpenFile.path, content: $.wsEditContent })
      if (d.success) { ctx.toast!('已保存', 'success'); $.wsOpenFile = null; await loadWsList() }
    } catch (e) { ctx.toast!('保存失败：' + errMsg(e, ''), 'error') }
    $.wsSaving = false; rerender()
  }

  function wsBreadcrumbParts(): string[] {
    if (!$.wsPath || $.wsPath === '/') return []
    return $.wsPath.split('/').filter(Boolean)
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


  const agentIdPath = ctx.route?.params?.id ?? ''
  function fmtVersionTime(t: string): string {
    try { return new Date(t).toLocaleString().slice(0, 16) } catch { return String(t ?? '').slice(0, 16) }
  }
  function loadVersions() {
    void ctx.api!.get<{ versions: any[] }>(`/api/agents/${agentIdPath}/versions`).then((d) => { $.versions = d.versions ?? []; rerender() }).catch(() => {})
  }
  async function saveVersionFn() {
    $.savingVersion = true; rerender()
    await ctx.api!.post(`/api/agents/${agentIdPath}/versions`, { note: $.versionNote }).then(() => {
      $.versionNote = ''; ctx.toast?.('版本已保存', 'success'); loadVersions()
    }).catch(() => ctx.toast?.('保存失败', 'error'))
    $.savingVersion = false; rerender()
  }
  async function rollbackVersionFn(versionId: string) {
    const ok = await ctx.confirm?.('回滚将覆盖当前配置，确定继续？')
    if (ok === false) return
    $.rollingBack = versionId; rerender()
    await ctx.api!.post(`/api/agents/${agentIdPath}/versions/${versionId}/rollback`).then(() => {
      ctx.toast?.('已回滚', 'success'); location.reload()
    }).catch(() => ctx.toast?.('回滚失败', 'error'))
    $.rollingBack = null; rerender()
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

  async function testWebhook() {
    const msg = $.whTestContent.trim() || '测试消息：验证 Webhook 机器人可用'
    $.whTesting = true; $.whTestResult = ''; $.whTestStatus = null; $.whTestElapsed = null
    rerender()
    const t0 = performance.now()
    try {
      const body = JSON.stringify({ content: msg })
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
      $.whTestStatus = res.status
      $.whTestElapsed = Math.round(performance.now() - t0)
      $.whTestResult = (d as any).reply
        ? (d as any).reply
        : res.ok ? '调用成功（无回复）'
        : (d as any).error ?? `HTTP ${res.status}`
      await loadWebhookLogs()
    } catch (e) {
      $.whTestElapsed = Math.round(performance.now() - t0)
      $.whTestResult = '调用失败：' + errMsg(e, '')
    }
    $.whTesting = false; rerender()
  }

  function genSecret() {
    const s = crypto.randomUUID().replace(/-/g, '')
    $.webhookSecret = s; rerender()
    void ctx.browser?.copyText(s); ctx.toast!('已生成并复制', 'success')
  }

  function webhookFullUrl() {
    return `${location.origin}/api/webhook/${agentId}`
  }

  // 对接示例代码（带当前 secret 自动签名）
  function guideCurl(secret: string, withSign: boolean): string {
    const url = webhookFullUrl()
    if (!withSign || !secret) {
      return `# 无需签名（未设置 Secret）\ncurl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"content":"你好，Webhook"}'`
    }
    return `# 需签名：X-Signature = HMAC-SHA256(secret, timestamp + '.' + body)\nSECRET="${secret}"\nURL='${url}'\nBODY='{"content":"你好，Webhook"}'\nTS=$(date +%s%3N)\nNONCE=$(cat /proc/sys/kernel/random/uuid)\nSIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')\ncurl -X POST "$URL" \\\n  -H 'Content-Type: application/json' \\\n  -H "X-Signature: $SIG" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" \\\n  -d "$BODY"`
  }

  function guideNode(secret: string): string {
    const url = webhookFullUrl()
    if (!secret) {
      return `const body = JSON.stringify({ content: '你好，Webhook' })\nawait fetch('${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body,\n}).then(r => r.json()).then(console.log)`
    }
    return `const crypto = require('node:crypto')\nconst body = JSON.stringify({ content: '你好，Webhook' })\nconst secret = '${secret}'\nconst ts = String(Date.now())\nconst nonce = crypto.randomUUID()\nconst sig = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex')\nawait fetch('${url}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-Signature': sig, 'X-Timestamp': ts, 'X-Nonce': nonce,\n  },\n  body,\n}).then(r => r.json()).then(console.log)`
  }

  function copyGuide(text: string) {
    void ctx.browser?.copyText(text); ctx.toast!('示例已复制', 'success')
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

  /** 批量上传：文件选择（multiple）→ 逐个读内容 → 上传 */
  async function uploadFiles(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files ? Array.from(input.files) : []
    if (files.length === 0) return
    $.uploading = true
    rerender()
    let ok = 0
    for (const f of files) {
      try {
        const text = await f.text()
        await ctx.api!.post(`/api/agents/${agentId}/knowledge`, { filename: f.name, content: text })
        ok++
      } catch { /* 单个失败跳过 */ }
    }
    input.value = ''
    $.uploading = false
    const d = await ctx.api!.get<{ documents: KbDocument[] }>(`/api/agents/${agentId}/knowledge`)
    $.docs = d.documents ?? []
    rerender()
    ctx.toast?.(`上传完成：${ok}/${files.length} 个文档`, ok === files.length ? 'success' : 'warning')
  }

  async function deleteDoc(docId: string) {
    await ctx.api!.delete(`/api/knowledge/${docId}`)
    const d = await ctx.api!.get(`/api/agents/${agentId}/knowledge`)
    $.docs = d.documents ?? []
    rerender()
  }

  return async (props) => {
    if ($.loading) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><Loading /></div>
    if ($.notFound) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="🧭" text="Agent 不存在或无权访问" hint="可能是链接过期，或该 Agent 属于其他应用。"><Button variant="primary" onClick={() => ctx.route!.navigate('/agents')}>返回 Agent 列表</Button></EmptyState></div>
    if ($.error && !$.agent) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="⚠️" text="加载 Agent 失败" hint={$.error}><Button variant="primary" onClick={() => { window.location.reload() }}>重试</Button></EmptyState></div>

    const a = $.agent ?? ({} as Partial<Agent>)
    const typeColor: Record<string, string> = { ai: '#8b5cf6', webhook: '#f59e0b', knowledge_base: '#22c55e', user: '#4f6ef7' }

    return (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <a class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/agents')}>← 返回 Agent 列表</a>

      <div class="wf-row wf-gap-xs" style="flex-wrap: wrap">
        {(a.type === 'ai'
          ? [['sec-config', '配置'], ['sec-skills', '技能'], ['sec-files', '文件'], ['sec-knowledge', '知识库'], ['sec-preview', '对话'], ['sec-logs', '日志'], ['sec-versions', '版本']]
          : a.type === 'webhook'
            ? [['sec-config', '配置'], ['sec-webhook', 'Webhook'], ['sec-versions', '版本']]
            : [['sec-config', '配置'], ['sec-account', '账号'], ['sec-versions', '版本']]
        ).map(([id, label]) => (
          <button key={id} type="button" class="wf-btn wf-btn--sm wf-btn--ghost"
            onClick={() => { const el = document.getElementById(id); if (el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            {label}
          </button>
        ))}
      </div>

      <Card id="sec-account">
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

      <Card id="sec-config">
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
                  <Field label={`月 Token 配额（${$.quotaUsed.toLocaleString()} 已用${$.aiQuota && parseInt($.aiQuota) > 0 ? ' / ' + parseInt($.aiQuota).toLocaleString() : '（不限）'}）`}>
                    <Input type="number" min="0" step="1000" value={$.aiQuota} placeholder="0 = 不限"
                      onInput={(e: Event) => { $.aiQuota = inputValue(e); rerender() }} />
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
                <span class="wf-block wf-text-xs wf-text-tertiary wf-mt-xs">首次运行时自动创建（容器卷挂载——沙盒内 bash 写入的文件与此处一致）</span>
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
                <span class="wf-text-xs wf-text-tertiary wf-self-center">默认关闭（沙盒 --network none——npm/curl 会失败）；开启后容器接入 bridge 网络</span>
              </div>
              {$.allowFileTools && <div class="wf-text-xs wf-text-tertiary wf-mt-xs">🧪 沙盒：Docker node:24 · 网络隔离 · 内存 512MB · 1 CPU（命令执行在容器内，路径穿越/资源/网络均受容器边界保护）</div>}
            </>
          )}

          {a.type === 'webhook' && (
            <>
              <Field label="入站端点" hint="外部系统 POST JSON 到该地址即可触发 AI 应答（若设置 Secret，须带 X-Signature/X-Timestamp/X-Nonce 头）">
                <div class="wf-row wf-gap-xs">
                  <Input readonly value={webhookFullUrl()} />
                  <Button type="button" variant="ghost" onClick={() => { void ctx.browser?.copyText(webhookFullUrl()); ctx.toast!('已复制', 'success') }}><Icon name="copy" size={14} /></Button>
                </div>
              </Field>
              <Field label="对接指南" hint="外部系统接入示例——复制即用，自动带上当前 Secret 签名">
                <div class="wf-row wf-gap-xs">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { $.showGuide = !$.showGuide; rerender() }}>
                    {$.showGuide ? '收起示例' : '查看示例代码'}
                  </Button>
                </div>
                {$.showGuide && (
                  <div class="wf-bg-secondary wf-rounded wf-p-sm wf-mt-xs">
                    <div class="wf-row wf-gap-xs wf-mb-xs">
                      <Button type="button" size="sm" variant={$.guideTab === 'curl' ? 'primary' : 'ghost'} onClick={() => { $.guideTab = 'curl'; rerender() }}>curl</Button>
                      <Button type="button" size="sm" variant={$.guideTab === 'node' ? 'primary' : 'ghost'} onClick={() => { $.guideTab = 'node'; rerender() }}>Node.js fetch</Button>
                      <div class="wf-fill" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => copyGuide($.guideTab === 'curl' ? guideCurl($.webhookSecret, true) : guideNode($.webhookSecret))}>
                        <Icon name="copy" size={14} /> 复制
                      </Button>
                    </div>
                    <pre class="wf-text-xs wf-overflow-auto" style="white-space: pre-wrap; line-height: 1.5">{(function () {
                      if ($.guideTab === 'node') return guideNode($.webhookSecret)
                      // curl 标签：无 secret 时展示简单版，有 secret 时展示签名版
                      return $.webhookSecret ? guideCurl($.webhookSecret, true) : guideCurl('', false)
                    })()}</pre>
                    <div class="wf-text-xs wf-text-tertiary wf-mt-xs">请求格式：<code>content</code>（必填·消息内容）· <code>conversation_id</code>（可选·会话 ID——同一会话多轮记忆）· 响应 <code>{'{"reply": "..."}'}</code></div>
                  </div>
                )}
              </Field>
              <div class="wf-row wf-gap-lg">
                <div class="wf-fill">
                  <Field label="Webhook Secret" hint="设置后，请求必须携带 X-Signature: HMAC-SHA256(secret, timestamp + '.' + body) 头">
                    <div class="wf-row wf-gap-xs">
                      <Input type={$.secretVisible ? 'text' : 'password'} placeholder="留空不验证签名"
                        value={$.webhookSecret} onInput={(e: Event) => { $.webhookSecret = inputValue(e); rerender() }} />
                      <Button type="button" variant="ghost" title="生成随机 Secret" onClick={genSecret}>🎲</Button>
                      <Button type="button" variant="ghost" title={$.secretVisible ? '隐藏' : '显示'} onClick={() => { $.secretVisible = !$.secretVisible; rerender() }}>
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
              <Field label="出站回调" hint="配置后，入站应答会镜像回推到该地址（POST { reply, conversation_id, timestamp } + X-Signature 签名，与入站一致）；留空仅入站">
                <Input type="url" placeholder="https://example.com/webhook-reply（可选）" value={$.webhookUrl}
                  onInput={(e: Event) => { $.webhookUrl = inputValue(e); rerender() }} />
              </Field>
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
        <Card id="sec-account">
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
        <Card id="sec-skills">
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="settings" size={14} /> 技能管理</div>
          {$.boundSkills.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无绑定技能</div>}
          {$.boundSkills.map((s: BoundSkill) => (
            <div key={s.slug} class="wf-split wf-py-sm wf-border-b">
              <div class="wf-stack wf-gap-none">
                <span class="wf-text-sm wf-text-medium">{s.name ?? s.skill_name}</span>
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

      {a.type === 'ai' && $.allowFileTools && (
        <Card id="sec-files">
          <div class="wf-split wf-mb-sm">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="folder" size={14} /> 工作空间文件</div>
            <Button size="sm" variant="ghost" onClick={() => loadWsList()}>刷新</Button>
          </div>
          <div class="wf-text-xs wf-text-tertiary wf-mb-sm">沙盒内 AI 写入的文件与此处一致（卷挂载共享）——AI 干活时刷新即可看到进度</div>

          {$.wsOpenFile ? (
            <div class="wf-stack wf-gap-sm">
              <div class="wf-row wf-gap-xs">
                <Button size="sm" variant="ghost" onClick={() => { $.wsOpenFile = null; rerender() }}>返回列表</Button>
                <span class="wf-text-sm wf-text-medium wf-fill wf-truncate">{$.wsOpenFile.path}</span>
              </div>
              <textarea rows={12} value={$.wsEditContent} onInput={(e: Event) => { $.wsEditContent = (e.target as HTMLTextAreaElement).value; rerender() }} />
              <div class="wf-right">
                <Button size="sm" variant="primary" disabled={$.wsSaving} onClick={saveWsFile}>{$.wsSaving ? '保存中...' : '保存'}</Button>
              </div>
            </div>
          ) : (
            <>
              <div class="wf-row wf-gap-xs wf-mb-xs wf-text-xs wf-text-secondary">
                <Button size="sm" variant="ghost" disabled={$.wsPath === '/'} onClick={() => loadWsList('')}>/</Button>
                {wsBreadcrumbParts().map((p, i) => {
                  const target = wsBreadcrumbParts().slice(0, i + 1).join('/')
                  return (
                    <span key={i} class="wf-row wf-gap-xs">
                      <span>/</span>
                      <button type="button" class="wf-text-secondary wf-text-xs" onClick={() => loadWsList(target)}>{p}</button>
                    </span>
                  )
                })}
              </div>
              {$.wsLoading && <Loading />}
              {!$.wsLoading && $.wsEntries.length === 0 && <EmptyState icon="📂" text="空目录" hint="沙盒内 AI 写文件后此处可见" />}
              {$.wsEntries.map((entry) => (
                <button key={entry.name} type="button" class="wf-row wf-gap-xs wf-py-xs wf-fill wf-text-left"
                  onClick={() => openWsFile(entry)}>
                  <Icon name={entry.type === 'dir' ? 'folder' : 'file-text'} size={14} />
                  <span class="wf-text-sm wf-text-medium">{entry.name}{entry.type === 'dir' ? '/' : ''}</span>
                  <span class="wf-fill" />
                  {entry.type === 'file' && <span class="wf-text-xs wf-text-tertiary wf-nums">{entry.size > 1024 ? (entry.size / 1024).toFixed(1) + 'KB' : entry.size + 'B'}</span>}
                  <span class="wf-text-xs wf-text-tertiary wf-nums">{new Date(entry.mtime).toLocaleTimeString()}</span>
                </button>
              ))}
            </>
          )}
        </Card>
      )}

      {a.type === 'ai' && (
        <Card id="sec-preview">
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
        <Card id="sec-logs">
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
                

<Card id="sec-webhook">
          <div class="wf-split wf-mb-sm">
            <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="external-link" size={14} /> Webhook 收发测试</div>
            <Button size="sm" variant="ghost" onClick={loadWebhookLogs}>刷新日志</Button>
          </div>
          <div class="wf-row wf-gap-xs wf-mb-sm">
            <div class="wf-fill">
              <Input placeholder="测试消息内容（默认：验证 Webhook 机器人可用）" value={$.whTestContent}
                onInput={(e: Event) => { $.whTestContent = inputValue(e); rerender() }} />
            </div>
            <Button size="sm" variant="primary" disabled={$.whTesting} onClick={testWebhook}>
              {$.whTesting ? '测试中...' : '发送测试请求'}
            </Button>
          </div>
          {$.whTestResult && (
            <div class="wf-text-sm wf-bg-secondary wf-rounded wf-p-sm wf-mb-sm">
              <div class="wf-row wf-gap-md wf-mb-xs">
                <span class="wf-text-semibold">{$.whTestStatus === 200 ? '✅ 成功' : '❌ 失败'}</span>
                <span class="wf-text-tertiary wf-nums">HTTP {$.whTestStatus ?? '?'} · {$.whTestElapsed ?? 0}ms</span>
              </div>
              <div style="white-space: pre-wrap">{$.whTestResult}</div>
            </div>
          )}

          <div class="wf-row wf-gap-xs wf-mb-sm">
            {(['all', 'success', 'fail'] as const).map(f => (
              <Button key={f} size="sm" variant={$.whLogFilter === f ? 'primary' : 'ghost'}
                onClick={() => { $.whLogFilter = f; rerender() }}>
                {f === 'all' ? '全部' : f === 'success' ? '成功' : '失败'}
              </Button>
            ))}
          </div>
          {$.whLogsLoading && <Loading />}
          {!$.whLogsLoading && $.whLogs.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-text-center wf-p-lg">暂无请求记录</div>}
          {$.whLogs
            .filter(l => $.whLogFilter === 'all' || ($.whLogFilter === 'success' ? l.success !== false : l.success === false))
            .map((log: WebhookLog, idx: number) => {
              const expanded = $.expandedWhLog === log.id
              const isNewest = idx === 0 && $.whTestElapsed !== null && log.created_at === $.whLogs[0]?.created_at
              const reqBody = typeof log.request_body === 'string' ? log.request_body : JSON.stringify(log.request_body ?? '{}')
              const resBody = typeof log.response_body === 'string' ? log.response_body : JSON.stringify(log.response_body ?? '')
              return (
                <div key={log.id} class="wf-py-sm wf-border-b">
                  <button type="button" class="wf-row wf-gap-xs wf-fill wf-text-left" onClick={() => { $.expandedWhLog = expanded ? null : log.id; rerender() }}>
                    <Icon name={log.success === false ? 'close' : 'check'} size={14} />
                    <span class={`wf-text-sm wf-text-medium ${log.success === false ? 'wf-text-danger' : ''}`}>HTTP {log.response_status ?? '?'}</span>
                    {isNewest && <Badge variant="primary">最新</Badge>}
                    <span class="wf-fill" />
                    <span class="wf-text-xs wf-text-tertiary wf-nums">{log.elapsed_ms}ms</span>
                    <span class="wf-text-xs wf-text-tertiary">{log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}</span>
                    <Icon name="chevron-down" size={14} />
                  </button>
                  {expanded && (
                    <div class="wf-mt-xs wf-grid wf-gap-xs" style="grid-template-columns: 1fr 1fr">
                      <div>
                        <div class="wf-text-xs wf-text-secondary wf-mb-xs">请求体</div>
                        <pre class="wf-text-xs wf-bg-secondary wf-rounded wf-p-xs wf-overflow-auto" style="white-space: pre-wrap; line-height: 1.5; max-height: 160px">{reqBody}</pre>
                      </div>
                      <div>
                        <div class="wf-text-xs wf-text-secondary wf-mb-xs">响应体</div>
                        <pre class="wf-text-xs wf-bg-secondary wf-rounded wf-p-xs wf-overflow-auto" style="white-space: pre-wrap; line-height: 1.5; max-height: 160px">{resBody}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </Card>
      )}

      <Card id="sec-versions">
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="refresh" size={14} /> 版本管理</div>
          <div class="wf-text-xs wf-text-tertiary wf-mb-sm">保存当前配置快照，可随时回滚（系统提示/模型/工具/配额等）</div>
          <div class="wf-row wf-gap-xs wf-mb-sm">
            <div class="wf-fill"><Input placeholder="版本备注（可选）" value={$.versionNote}
              onInput={(e: Event) => { $.versionNote = inputValue(e); rerender() }} /></div>
            <Button size="sm" disabled={$.savingVersion} onClick={saveVersionFn}>
              {$.savingVersion ? '保存中...' : '保存版本'}
            </Button>
          </div>
          <div class="wf-stack wf-gap-xs">
            {$.versions.length === 0 ? (
              <div class="wf-text-sm wf-text-tertiary wf-py-sm">暂无版本——保存第一个版本开始管理</div>
            ) : $.versions.map((v: any) => (
              <div key={v.id} class="wf-split wf-py-sm wf-border-b">
                <div class="wf-stack wf-gap-none">
                  <span class="wf-text-sm">v{v.version} · {v.note ?? '版本'}</span>
                  <span class="wf-text-xs wf-text-tertiary">{fmtVersionTime(v.created_at)}</span>
                </div>
                <Button size="sm" variant="ghost" disabled={$.rollingBack === v.id}
                  onClick={() => rollbackVersionFn(v.id)}>{$.rollingBack === v.id ? '回滚中...' : '回滚'}</Button>
              </div>
            ))}
          </div>
        </Card>

      {a.type === 'knowledge_base' && (
        <Card id="sec-knowledge">
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
            <Field label="批量上传" hint="支持 .txt / .md / .csv / .json——一次选择多个文件">
              <input type="file" multiple accept=".txt,.md,.csv,.json,.jsonl,.log"
                onChange={uploadFiles} disabled={$.uploading} class="wf-input" />
            </Field>
            <div class="wf-text-xs wf-text-tertiary wf-border-t wf-pt-sm">或手动粘贴：</div>
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
