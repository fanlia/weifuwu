import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, TypeBadge, Loading, errMsg } from '../components/ui'
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, Select, Slider, Textarea, Timeline } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { SkillsSection } from '../components/agent/SkillsSection'
import { PreviewSection } from '../components/agent/PreviewSection'
import { LogsSection } from '../components/agent/LogsSection'
import { VersionsSection } from '../components/agent/VersionsSection'
import { FilesSection } from '../components/agent/FilesSection'
import { KnowledgeSection } from '../components/agent/KnowledgeSection'
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
  aiHITL: boolean; webhookUrl: string; webhookPlatform: string; webhookSecret: string
  webhookRetryCount: string; secretVisible: boolean
    kbOptions: Array<{ id: string; name: string }>; kbId: string
      previewQuery: string; previewText: string; previewing: boolean
  allowFileTools: boolean; allowCommandExec: boolean; allowNetwork: boolean
  boundSkills: BoundSkill[]; availableSkills: AvailableSkill[]; showSkillPicker: boolean
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
    $.aiModel = ''; $.aiTemperature = '0.7'; $.aiMaxTokens = '2048'; $.aiQuota = '0'; $.quotaUsed = 0
    $.aiHITL = false; $.webhookUrl = ''; $.webhookPlatform = 'generic'; $.webhookSecret = ''
    $.webhookRetryCount = '3'; $.secretVisible = false
    $.allowFileTools = false; $.allowCommandExec = false; $.allowNetwork = false

    $.boundSkills = []; $.availableSkills = []; $.showSkillPicker = false

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
      $.aiHITL = !!a.human_in_the_loop
      $.webhookUrl = a.webhook_url ?? ''; $.webhookPlatform = a.webhook_platform ?? 'generic'; $.webhookSecret = a.webhook_secret ?? ''
      $.webhookRetryCount = String(a.webhook_retry_count ?? 3)
      $.kbId = a.kb_id ?? ''
      $.allowFileTools = a.allow_file_tools ?? false
      $.allowCommandExec = a.allow_command_exec ?? false
      $.allowNetwork = a.allow_network ?? false
      $.kbOptions = (kbRes.agents ?? []).map((k: { id: string; name: string }) => ({ id: k.id, name: k.name }))
      $.boundSkills = skillRes.skills ?? []
      $.availableSkills = availRes.skills ?? []

      $.whLogs = []; $.whLogsLoading = false; $.whLogFilter = 'all'
    $.whTestContent = ''; $.whTestStatus = null; $.whTestElapsed = null
    $.expandedWhLog = null; $.showGuide = false; $.guideTab = 'curl'

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

  async function startDm(id: string) {
    try {
      const res = await ctx.api!.post('/api/departments/dm', { agent_id: id })
      const d = res.department
      if (d?.id) { ctx.app?.navigate(`/chat/${d.id}`) }
      else { ctx.toast!('发起单聊失败', 'error') }
    } catch { ctx.toast!('发起单聊失败', 'error') }
  }

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
      body.webhook_platform = $.webhookPlatform
      body.webhook_secret = $.webhookSecret
      body.webhook_retry_count = parseInt($.webhookRetryCount) || 3
    }
    try {
      await ctx.api!.put(`/api/agents/${agentId}`, body)
      $.ok = '保存成功'; $.saving = false
      rerender()
    } catch (e) { $.error = errMsg(e, '保存失败'); $.saving = false; rerender() }
  }



  async function loadWebhookLogs() {
    $.whLogsLoading = true
    try {
      const d = await ctx.api!.get(`/api/stats/agents/${agentId}/webhook-logs`)
      $.whLogs = d.logs ?? []; $.whLogsLoading = false
      rerender()
    } catch { $.whLogsLoading = false; rerender() }
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

  return async (props) => {
    if ($.loading) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><Loading /></div>
    if ($.notFound) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="🧭" text="Agent 不存在或无权访问" hint="可能是链接过期，或该 Agent 属于其他应用。"><Button variant="primary" onClick={() => ctx.route!.navigate('/agents')}>返回 Agent 列表</Button></EmptyState></div>
    if ($.error && !$.agent) return <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px"><EmptyState icon="⚠️" text="加载 Agent 失败" hint={$.error}><Button variant="primary" onClick={() => { ctx.browser?.reload?.() }}>重试</Button></EmptyState></div>

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
            onClick={() => { const el = ctx.browser?.byId?.(id); if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
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
          {(a.type === 'ai' || a.type === 'webhook') && a.id && (
            <Button variant="primary" onClick={() => startDm(String(a.id))}><Icon name="message" size={14} /> 单聊</Button>
          )}
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
              <Field label="外部平台" hint="出站推送格式：AI 回复按平台群机器人消息体推送（generic = 平台自解析 reply/conversation_id）">
                <Select value={$.webhookPlatform}
                  onChange={(v: string | string[]) => { const val = Array.isArray(v) ? 'generic' : v; $.webhookPlatform = val; rerender() }}
                  options={[
                    { value: 'generic', label: '通用（自解析）' },
                    { value: 'wecom', label: '企业微信群机器人' },
                    { value: 'dingtalk', label: '钉钉群机器人' },
                    { value: 'feishu', label: '飞书群机器人' },
                  ]} />
              </Field>
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

      {a.type === 'ai' && <SkillsSection agentId={agentId} />}

      {a.type === 'ai' && a.allow_file_tools && <FilesSection agentId={agentId} />}

      {a.type === 'ai' && <PreviewSection agentId={agentId} />}

      {a.type === 'ai' && <LogsSection agentId={agentId} />}

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

      <VersionsSection agentId={agentId} />

      {a.type === 'knowledge_base' && <KnowledgeSection agentId={agentId} agent={a as Agent} />}
    </div>
    )
  }
}
