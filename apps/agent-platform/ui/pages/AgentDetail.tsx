/**
 * Agent 详情/编辑页面
 *
 * 支持类型: ai, webhook, knowledge_base, user
 * - AI: 编辑系统提示词 + 模型配置 + 工具选择 + 执行历史
 * - Webhook: 编辑 URL + 测试发送
 * - Knowledge Base: 文档上传与管理
 * - User: 显示绑定的用户信息
 */

import { signal, computed, createResource, Show, For, effect } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, TypeBadge, Loading } from '../components/ui'

// ── 可用模型列表 ────────────────────────────────────────

const MODELS = [
  { value: '', label: '默认 (环境变量 DEEPSEEK_MODEL)' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
]

/** 渲染文档分块列表（因 esbuild JSX 嵌套深度限制，用 DOM 方式渲染） */
function renderChunks(chunks: any[]): Node {
  const container = document.createElement('div')
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.gap = '6px'
  for (const ch of chunks) {
    const el = document.createElement('div')
    el.style.padding = '8px 10px'
    el.style.borderRadius = '6px'
    el.style.background = '#fff'
    el.style.border = '1px solid #e5e7eb'
    el.style.fontSize = '12px'
    el.style.lineHeight = '1.6'
    el.innerHTML = `<span style="font-size:11px;color:var(--text-3)">块 #${ch.chunk_index + 1}</span><br>${(ch.content ?? '').slice(0, 300)}`
    container.appendChild(el)
  }
  return container
}

export function AgentDetail(_props: {}, ctx: WfuiContext) {
  const agentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  // ── 表单信号 ──
  const name = signal('')
  const description = signal('')
  const submitting = signal(false)
  const error = signal('')
  const hasError = computed(() => error.value !== '')

  // AI 配置
  const systemPrompt = signal('')
  const aiModel = signal('')
  const aiTemperature = signal('0.7')
  const aiMaxTokens = signal('2048')
  const aiHITL = signal(false)
  const enabledTools = signal<string[]>([])

  // 知识库文档管理
  const newDocFilename = signal('')
  const newDocContent = signal('')
  const uploading = signal(false)
  const batchDocs = signal<string>('')  // 批量粘贴（JSON 格式）
  const showBatch = signal(false)
  const expandedDoc = signal<string | null>(null)  // 展开的文档 ID
  const docChunks = signal<any[]>([])  // 展开文档的 chunks
  const loadingChunks = signal(false)

  // Webhook 配置
  const webhookUrl = signal('')
  const webhookSecret = signal('')
  const webhookRetryCount = signal('3')
  const secretVisible = signal(false)

  // Webhook 测试
  const testWebhookResult = signal('')
  const testWebhookLoading = signal(false)

  // ── 数据加载 ──
  const [agent, { loading }] = createResource<any>(async () => {
    const d = await fetch(`/api/agents/${agentId}`, { headers }).then(r => r.json())
    const a = d.agent ?? {}
    name.value = a.name ?? ''
    description.value = a.description ?? ''
    systemPrompt.value = a.system_prompt ?? ''
    aiModel.value = a.model ?? ''
    aiTemperature.value = String(a.temperature ?? 0.7)
    aiMaxTokens.value = String(a.max_tokens ?? 2048)
    aiHITL.value = !!a.human_in_the_loop
    webhookUrl.value = a.webhook_url ?? ''
    webhookSecret.value = a.webhook_secret ?? ''
    webhookRetryCount.value = String(a.webhook_retry_count ?? 3)
    // 工具：从 agent.tools 中提取已启用的工具名
    const tools = typeof a.tools === 'string' ? JSON.parse(a.tools) : (a.tools ?? [])
    enabledTools.value = (Array.isArray(tools) ? tools : []).map((t: any) => t.function?.name ?? '')
    return a
  })

  // ── 内置工具列表 ──
  const [builtinTools] = createResource<any[]>(
    () => fetch('/api/agents/builtin-tools', { headers })
      .then(r => r.json()).then(d => d.tools ?? []),
    { initialValue: [] },
  )

  // ── 计算信号 ──
  const isAI = computed(() => agent.value?.type === 'ai')
  const docChunksList = computed(() => docChunks.value)
  const docExpanded = (id: string) => computed(() => expandedDoc.value === id)
  const isWebhook = computed(() => agent.value?.type === 'webhook')
  const isKB = computed(() => agent.value?.type === 'knowledge_base')
  const isUser = computed(() => agent.value?.type === 'user')
  const notFound = computed(() => !loading.value && !agent.value?.id)

  const toolsList = computed(() => {
    const t = agent.value?.tools
    if (!t) return []
    if (Array.isArray(t)) return t
    try { return JSON.parse(t) } catch { return [] }
  })
  const hasTools = computed(() => toolsList.value.length > 0)

  // ── 执行历史 ──
  const [logs, { loading: logsLoading }] = createResource<any[]>(
    () => {
      if (!isAI.value) return []
      return fetch(`/api/stats/agents/${agentId}/logs`, { headers })
        .then(r => r.json()).then(d => d.logs ?? [])
    },
    { initialValue: [] },
  )
  const hasLogs = computed(() => (logs.value ?? []).length > 0)
  const totalTokens = computed(() =>
    (logs.value ?? []).reduce((s: number, l: any) => s + (l.tokens_total ?? 0), 0)
  )

  // ── Webhook 请求日志 ──
  const [webhookLogs, { loading: whLogsLoading }] = createResource<any[]>(
    () => {
      if (!isWebhook.value) return []
      return fetch(`/api/stats/agents/${agentId}/webhook-logs`, { headers })
        .then(r => r.json()).then(d => d.logs ?? [])
    },
    { initialValue: [] },
  )
  const hasWebhookLogs = computed(() => (webhookLogs.value ?? []).length > 0)

  // ── 知识库文档 ──
  const [docs, { loading: docsLoading, refetch: refetchDocs }] = createResource<any[]>(
    () => {
      if (!isKB.value) return []
      return fetch(`/api/agents/${agentId}/knowledge`, { headers })
        .then(r => r.json()).then(d => d.documents ?? [])
    },
    { initialValue: [] },
  )

  // 知识库 QA
  const qaQuery = signal('')
  const qaResults = signal<any[]>([])
  const qaSearching = signal(false)

  // ── 工具勾选 ──
  function toggleTool(name: string) {
    const set = new Set(enabledTools.value)
    if (set.has(name)) set.delete(name); else set.add(name)
    enabledTools.value = [...set]
  }

  function isToolEnabled(name: string) {
    return enabledTools.value.includes(name)
  }

  // ── 操作函数 ──

  // ── 文档展开/收起 ──
  async function toggleExpandDoc(docId: string) {
    if (expandedDoc.value === docId) {
      expandedDoc.value = null
      docChunks.value = []
      return
    }
    expandedDoc.value = docId
    loadingChunks.value = true
    try {
      const res = await fetch(`/api/knowledge/${docId}?chunks=true`, { headers })
      if (res.ok) {
        const data = await res.json()
        docChunks.value = data.chunks ?? []
      }
    } finally {
      loadingChunks.value = false
    }
  }

  async function uploadDoc(e: Event) {
    e.preventDefault()
    if (!newDocFilename.value.trim() || !newDocContent.value.trim()) return
    uploading.value = true
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          filename: newDocFilename.value.trim(),
          content: newDocContent.value,
        }),
      })
      if (res.ok) {
        newDocFilename.value = ''
        newDocContent.value = ''
        refetchDocs()
      }
    } finally {
      uploading.value = false
    }
  }

  // ── 文件上传 ──
  async function uploadFiles(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    uploading.value = true
    const form = new FormData()
    for (const file of files) {
      form.append('files', file)
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },  // 让 fetch 自动设置 Content-Type: multipart/form-data
        body: form,
      })
      if (res.ok || res.status === 207) {
        refetchDocs()
      }
    } finally {
      uploading.value = false
      input.value = '' // 重置文件选择
    }
  }

  // ── 拖拽上传 ──
  let dropCounter = 0
  const isDragOver = signal(false)

  function onDragEnter(e: any) {
    e.preventDefault()
    dropCounter++
    isDragOver.value = true
  }
  function onDragLeave(e: any) {
    e.preventDefault()
    dropCounter--
    if (dropCounter === 0) isDragOver.value = false
  }
  function onDragOver(e: any) {
    e.preventDefault()
  }
  async function onDrop(e: any) {
    e.preventDefault()
    dropCounter = 0
    isDragOver.value = false
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    uploading.value = true
    const form = new FormData()
    for (const file of files) {
      form.append('files', file)
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (res.ok || res.status === 207) {
        refetchDocs()
      }
    } finally {
      uploading.value = false
    }
  }

  // ── 批量粘贴上传 ──
  async function uploadBatch(e: Event) {
    e.preventDefault()
    let docs: Array<{ filename: string; content: string }> = []
    try {
      docs = JSON.parse(batchDocs.value)
    } catch {
      return
    }
    if (!Array.isArray(docs) || docs.length === 0) return

    uploading.value = true
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ documents: docs }),
      })
      if (res.ok || res.status === 207) {
        batchDocs.value = ''
        showBatch.value = false
        refetchDocs()
      }
    } finally {
      uploading.value = false
    }
  }

  async function deleteDoc(docId: string) {
    if (!confirm('确定删除此文档？')) return
    const res = await fetch(`/api/knowledge/${docId}`, { method: 'DELETE', headers })
    if (res.ok) refetchDocs()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    submitting.value = true
    error.value = ''

    const body: Record<string, unknown> = {
      name: name.value,
      description: description.value || undefined,
    }
    if (isAI.value) {
      body.system_prompt = systemPrompt.value || undefined
      body.model = aiModel.value || undefined
      body.temperature = parseFloat(aiTemperature.value) || 0.7
      body.max_tokens = parseInt(aiMaxTokens.value) || 2048
      body.human_in_the_loop = aiHITL.value
      // 根据勾选的工具名，从内置工具定义中构建 tools 数组
      const allTools = builtinTools.value ?? []
      const selectedDefs = allTools.filter((t: any) => enabledTools.value.includes(t.function.name))
      body.tools = selectedDefs
    }
    if (isWebhook.value) {
      body.webhook_url = webhookUrl.value || undefined
      body.webhook_secret = webhookSecret.value || undefined
      body.webhook_retry_count = parseInt(webhookRetryCount.value) || 3
    }

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '保存失败'; submitting.value = false; return }
      window.location.reload()
    } catch {
      error.value = '网络错误'
      submitting.value = false
    }
  }

  async function testWebhook() {
    testWebhookLoading.value = true
    testWebhookResult.value = ''
    try {
      const res = await fetch(`/api/webhook/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello, this is a test message from Agent Platform.' }),
      })
      const data = await res.json()
      testWebhookResult.value = res.ok
        ? `✅ 回复: ${data.reply}`
        : `❌ 错误: ${data.error ?? res.status}`
    } catch (e: any) {
      testWebhookResult.value = `❌ 请求失败: ${e.message}`
    } finally {
      testWebhookLoading.value = false
    }
  }

  async function searchQA(e: Event) {
    e.preventDefault()
    if (!qaQuery.value.trim()) return
    qaSearching.value = true
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query: qaQuery.value.trim(), top_k: 5 }),
      })
      if (res.ok) {
        const data = await res.json()
        qaResults.value = data.results ?? []
      }
    } finally {
      qaSearching.value = false
    }
  }

  function fmtTime(iso: string): string {
    try {
      const d = new Date(iso)
      return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div class="page page-narrow">
      <a href="/agents" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/agents') }}>← 返回 Agent 列表</a>

      <Show when={loading}><Loading /></Show>

      <Show when={notFound}>
        <div class="empty">
          <div class="empty-ico">🔍</div>
          <div class="empty-txt">Agent 不存在</div>
        </div>
      </Show>

      <Show when={computed(() => !!agent.value?.id)}>
        {() => (
        <div>
        <div class="detail-hero card">
          <div class={`ava ava-${agent.value?.type ?? 'user'}`}>{(agent.value?.name ?? '?')[0]}</div>
          <div class="detail-hero-info">
            <div class="detail-hero-name">
              {computed(() => agent.value?.name ?? '')}
              <TypeBadge type={agent.value?.type ?? ''} />
            </div>
            <div class="detail-hero-sub">
              ID: {agentId}
              {computed(() => {
                const m = agent.value?.model
                return m ? ` · 模型: ${m}` : ''
              })}
              {agent.value?.is_active === false && <span class="badge badge-gray" style={{ marginLeft: '8px' }}>已暂停</span>}
            </div>
          </div>
        </div>

        <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

        {/* ═══ 基本设置 ═══ */}
        <form class="card card-pad" onSubmit={handleSubmit}>
          <div class="sect-title" style={{ marginBottom: '16px' }}>基本设置</div>

          <div class="field">
            <label class="field-label">名称 <span class="req">*</span></label>
            <input class="input" type="text" value={name} onInput={(e: any) => { name.value = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">描述</label>
            <input class="input" type="text" value={description} onInput={(e: any) => { description.value = e.target.value }} />
          </div>

          {/* ── AI 配置 ── */}
          <Show when={isAI}>
            <div>
              <div class="field">
                <label class="field-label">系统提示词（System Prompt）</label>
                <textarea class="textarea" rows={5} value={systemPrompt} onInput={(e: any) => { systemPrompt.value = e.target.value }} />
                <div class="field-hint">设定 AI 的角色与行为指令</div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label class="field-label">模型</label>
                  <select class="select" value={aiModel} onChange={(e: any) => { aiModel.value = e.target.value }}>
                    <For each={MODELS}>{(m: any) => (
                      <option value={m.value}>{m.label}</option>
                    )}</For>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label">温度</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="range" min="0" max="2" step="0.1" value={aiTemperature}
                      onInput={(e: any) => { aiTemperature.value = e.target.value }}
                      style={{ flex: 1 }} />
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
            </div>
          </Show>

          {/* ── Webhook 配置 ── */}
          <Show when={isWebhook}>
            <div>
              <div class="field">
                <label class="field-label">Webhook URL</label>
                <input class="input" type="url" value={webhookUrl} onInput={(e: any) => { webhookUrl.value = e.target.value }} />
                <div class="field-hint">消息将以 POST JSON 推送到该地址</div>
              </div>
              <div class="form-row">
                <div class="field">
                  <label class="field-label">Webhook Secret</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input class="input" type={secretVisible.value ? 'text' : 'password'} placeholder="留空不验证签名" value={webhookSecret}
                      onInput={(e: any) => { webhookSecret.value = e.target.value }} />
                    <button type="button" class="btn btn-ghost btn-sm" onClick={() => { secretVisible.value = !secretVisible.value }}
                      style={{ flex: 'none', padding: '9px 12px' }}>
                      {computed(() => secretVisible.value ? '🙈' : '👁')}
                    </button>
                  </div>
                  <div class="field-hint">设置后，请求必须携带 X-Signature: HMAC-SHA256(body) 头</div>
                </div>
                <div class="field">
                  <label class="field-label">重试次数</label>
                  <input class="input" type="number" min="0" max="5" value={webhookRetryCount}
                    onInput={(e: any) => { webhookRetryCount.value = e.target.value }} />
                  <div class="field-hint">失败后指数退避重试（默认 3 次）</div>
                </div>
              </div>
            </div>
          </Show>

          <div class="form-foot">
            <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/agents')}>取消</button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
              {computed(() => submitting.value ? '保存中...' : '保存修改')}
            </button>
          </div>
        </form>

        {/* ═══ AI 工具配置 ═══ */}
        <Show when={isAI}>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '12px' }}>🔧 工具配置</div>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
              选择 AI 可使用的内置工具。工具在保存后生效。
            </p>
            <Show when={computed(() => (builtinTools.value ?? []).length === 0)}>
              <div style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'center', padding: '12px' }}>
                没有可用的内置工具
              </div>
            </Show>
            <For each={builtinTools} keyBy={(t: any) => t.function?.name ?? Math.random()}>{(tool: any) => {
              const toolName = tool.function?.name ?? ''
              const checked = computed(() => isToolEnabled(toolName))
              return (
                <label class="check-item" style={{ cursor: 'pointer', borderRadius: '8px' }}>
                  <input type="checkbox" checked={checked}
                    onChange={() => toggleTool(toolName)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{toolName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{tool.function?.description ?? ''}</div>
                  </div>
                </label>
              )
            }}</For>
          </div>
        </Show>

        {/* ═══ AI 执行历史 ═══ */}
        <Show when={isAI}>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '8px' }}>
              📊 执行历史
              <span class="muted" style={{ fontWeight: 400, fontSize: '12px', marginLeft: '8px' }}>
                累计 {computed(() => `${(logs.value ?? []).length} 次`)} · 总计 {computed(() => `${totalTokens.value.toLocaleString()} tokens`)}
              </span>
            </div>

            <Show when={logsLoading}><Loading /></Show>

            <Show when={computed(() => !logsLoading.value && !hasLogs.value)}>
              <div style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'center', padding: '24px' }}>
                暂无执行记录。在聊天中发送消息后，AI 的调用记录会显示在这里。
              </div>
            </Show>

            <Show when={hasLogs}>
              <div class="check-list" style={{ maxHeight: '300px' }}>
                <For each={logs} keyBy="id">{(log: any) => (
                  <div class="check-item" style={{ flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {log.success ? '✅' : '❌'} {log.steps_count} steps
                      </div>
                      <div class="muted" style={{ fontSize: '11px' }}>
                        {fmtTime(log.created_at)} · {log.tokens_total} tokens · {log.elapsed_ms}ms
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-2)' }}>
                      <span>输入: {log.messages_count}条</span>
                      <span>步骤: {log.steps_count}</span>
                    </div>
                  </div>
                )}</For>
              </div>
            </Show>
          </div>
        </Show>

        {/* ═══ Webhook 测试 ═══ */}
        <Show when={isWebhook}>
          <div>
            <div class="card card-pad mt-24">
              <div class="sect-title" style={{ marginBottom: '16px' }}>🔗 Webhook 测试</div>
              <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '12px' }}>
                向此 Webhook 发送一条测试消息，验证配置是否正确。
              </p>
              <button class="btn btn-primary" onClick={testWebhook} disabled={testWebhookLoading}>
                {computed(() => testWebhookLoading.value ? '发送中...' : '发送测试消息')}
              </button>
              <Show when={computed(() => testWebhookResult.value !== '')}>
                <div class="mt-8" style={{
                  padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
                  background: testWebhookResult.value.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${testWebhookResult.value.startsWith('✅') ? '#a7f3d0' : '#fecaca'}`,
                  color: testWebhookResult.value.startsWith('✅') ? '#047857' : '#b91c1c',
                }}>{testWebhookResult}</div>
              </Show>
            </div>

            <div class="card card-pad mt-24">
              <div class="sect-title" style={{ marginBottom: '12px' }}>📋 Webhook 请求日志</div>

              <Show when={whLogsLoading}><Loading /></Show>

              <Show when={computed(() => !whLogsLoading.value && !hasWebhookLogs.value)}>
                <div style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'center', padding: '24px' }}>
                  暂无请求记录
                </div>
              </Show>

              <Show when={hasWebhookLogs}>
                <div class="check-list" style={{ maxHeight: '300px' }}>
                  <For each={webhookLogs} keyBy="id">{(log: any) => (
                    <div class="check-item" style={{ flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {log.success ? '✅' : '❌'} HTTP {log.response_status ?? '?'}
                        </div>
                        <div class="muted" style={{ fontSize: '11px' }}>
                          {fmtTime(log.created_at)} · {log.elapsed_ms}ms
                        </div>
                      </div>
                      <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-2)' }}>
                        {log.response_body ? (log.response_body.length > 80 ? log.response_body.slice(0, 80) + '...' : log.response_body) : '无响应'}
                      </div>
                    </div>
                  )}</For>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* ═══ 知识库文档管理 ═══ */}
        <Show when={isKB}>
          <div>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '16px' }}>
              📚 知识库文档
              <span class="muted" style={{ fontWeight: 400, fontSize: '12px', marginLeft: '8px' }}>
                {computed(() => `${(docs.value ?? []).length} 个文档`)}
              </span>
            </div>

            <Show when={docsLoading}><Loading /></Show>

            {/* ── 文档列表（可展开） ── */}
            <Show when={computed(() => (docs.value ?? []).length > 0)}>
              <div class="check-list" style={{ marginBottom: '18px' }}>
                <For each={docs} keyBy="id">{(d: any) => (
                  <div>
                    <div class="check-item" onClick={() => toggleExpandDoc(d.id)} style={{ cursor: 'pointer' }}>
                      <span>{computed(() => docExpanded(d.id).value ? '📂' : '📄')}</span>
                      <span style={{ flex: 1 }}>{d.filename}</span>
                      <span class="muted" style={{ fontSize: '12px', marginRight: '8px' }}>{d.chunk_count} 块</span>
                      <button
                        class="btn btn-danger btn-sm"
                        onClick={(e: any) => { e.stopPropagation(); deleteDoc(d.id) }}
                      >删除</button>
                    </div>
                    {/* 展开后的 chunks */}
                    <Show when={docExpanded(d.id)}>
                      <div style={{
                        padding: '12px 16px 12px 44px', borderTop: '1px solid #f3f4f6',
                        background: '#fafbfc', fontSize: '13px',
                      }}>
                        <Show when={loadingChunks}>
                          <div class="muted" style={{ padding: '8px 0' }}>加载中...</div>
                        </Show>
                        <Show when={computed(() => !loadingChunks.value && docChunks.value.length === 0)}>
                          <div class="muted" style={{ padding: '8px 0' }}>无分块数据</div>
                        </Show>
                        <Show when={computed(() => docChunks.value.length > 0)}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {renderChunks(docChunks.value)}
                          </div>
                        </Show>
                        {/* 内容预览 */}
                        <div class="mt-8">
                          <a href={`/api/knowledge/${d.id}`} target="_blank"
                            class="btn btn-ghost btn-sm"
                            onClick={(e: any) => { e.preventDefault(); fetch(`/api/knowledge/${d.id}`, { headers }).then(r => r.json()).then(data => { alert(data.document?.content?.slice(0, 2000) ?? '无内容') }) }}
                            style={{ textDecoration: 'none' }}
                          >📖 预览全文</a>
                        </div>
                      </div>
                    </Show>
                  </div>
                )}</For>
              </div>
            </Show>

            {/* ── 上传方式切换 ── */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button class={`btn btn-sm ${!showBatch.value ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => showBatch.value = false}>✏️ 文本粘贴</button>
              <button class={`btn btn-sm ${showBatch.value ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => showBatch.value = true}>📁 批量导入</button>
            </div>

            {/* ── 文本粘贴上传 ── */}
            <Show when={computed(() => !showBatch.value)}>
              <form onSubmit={uploadDoc}>
                <div class="field">
                  <label class="field-label">文件名</label>
                  <input class="input" type="text" placeholder="如：产品手册.txt"
                    value={newDocFilename}
                    onInput={(e: any) => { newDocFilename.value = e.target.value }} />
                </div>
                <div class="field">
                  <label class="field-label">文档内容</label>
                  <textarea class="textarea" rows={5} placeholder="粘贴文档内容..."
                    value={newDocContent}
                    onInput={(e: any) => { newDocContent.value = e.target.value }} />
                </div>
                <button type="submit" class="btn btn-primary" disabled={uploading}>
                  {computed(() => uploading.value ? '上传中...' : '上传文档')}
                </button>
              </form>
            </Show>

            {/* ── 文件上传 + 批量导入 ── */}
            <Show when={showBatch}>
              <div>
              {/* 拖拽上传 */}
              <div
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                class={computed(() => `drop-zone${isDragOver.value ? ' drop-over' : ''}`)}
              >
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>📄</div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>拖拽文件到此处</div>
                <div class="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>支持 .txt .md .csv .json（单文件 ≤ 5MB）</div>
                <label class="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                  选择文件
                  <input type="file" multiple accept=".txt,.md,.csv,.json"
                    style={{ display: 'none' }}
                    onChange={(e: any) => uploadFiles(e)}
                    disabled={uploading} />
                </label>
                <Show when={uploading}>
                  <div class="muted mt-8" style={{ fontSize: '12px' }}>上传中...</div>
                </Show>
              </div>

              {/* 批量 JSON 粘贴 */}
              <details style={{ fontSize: '13px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
                  📋 批量粘贴（JSON 格式）
                </summary>
                <form onSubmit={uploadBatch}>
                  <div class="field">
                    <textarea class="textarea" rows={4}
                      placeholder={'[\n  { "filename": "doc1.md", "content": "..." },\n  { "filename": "doc2.md", "content": "..." }\n]'}
                      value={batchDocs}
                      onInput={(e: any) => { batchDocs.value = e.target.value }} />
                    <div class="field-hint">JSON 数组格式，每个对象包含 filename 和 content</div>
                  </div>
                  <button type="submit" class="btn btn-primary btn-sm" disabled={uploading}>
                    {computed(() => uploading.value ? '上传中...' : '批量导入')}
                  </button>
                </form>
              </details>
            </div>
            </Show>
          </div>

          {/* ── 知识库 QA ── */}
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '16px' }}>🔍 知识库问答测试</div>
            <form onSubmit={searchQA}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input class="input" type="text" placeholder="输入问题，测试检索效果..."
                  value={qaQuery}
                  onInput={(e: any) => { qaQuery.value = e.target.value }} />
                <button type="submit" class="btn btn-primary" disabled={qaSearching}>
                  {computed(() => qaSearching.value ? '搜索...' : '检索')}
                </button>
              </div>
            </form>

            <Show when={computed(() => qaResults.value.length > 0)}>
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <For each={qaResults} keyBy="id">{(r: any) => (
                  <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '13px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>📄 {r.filename}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                        相似度: {(r.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-2)' }}>{r.content}</div>
                  </div>
                )}</For>
              </div>
            </Show>
          </div>
          </div>
        </Show>

        {/* ═══ User 信息 ═══ */}
        <Show when={isUser}>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '8px' }}>👤 绑定用户</div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              此 Agent 绑定到平台用户（user_id: {agent.value?.user_id ?? '无'}），
              该用户的聊天消息由此 Agent 代为发送。
            </div>
          </div>
        </Show>

        </div>
        )}
      </Show>
    </div>
  )
}
