/**
 * Agent 详情/编辑页面
 *
 * 支持类型: ai, webhook, knowledge_base, user
 * - AI: 编辑系统提示词 + 展示工具配置
 * - Webhook: 编辑 URL + 测试发送
 * - Knowledge Base: 文档上传与管理
 * - User: 显示绑定的用户信息
 */

import { signal, computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, TypeBadge, Loading } from '../components/ui'

export function AgentDetail(_props: {}, ctx: WfuiContext) {
  const agentId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const name = signal('')
  const description = signal('')
  const systemPrompt = signal('')
  const webhookUrl = signal('')
  const submitting = signal(false)
  const error = signal('')
  const hasError = computed(() => error.value !== '')

  // 知识库文档管理
  const newDocFilename = signal('')
  const newDocContent = signal('')
  const uploading = signal(false)

  // Webhook 测试
  const testWebhookResult = signal('')
  const testWebhookLoading = signal(false)

  // fetcher 内直接初始化表单信号（数据到达即填充）
  const [agent, { loading }] = createResource<any>(async () => {
    const d = await fetch(`/api/agents/${agentId}`, { headers }).then(r => r.json())
    const a = d.agent ?? {}
    name.value = a.name ?? ''
    description.value = a.description ?? ''
    systemPrompt.value = a.system_prompt ?? ''
    webhookUrl.value = a.webhook_url ?? ''
    return a
  })

  const isAI = computed(() => agent.value?.type === 'ai')
  const isWebhook = computed(() => agent.value?.type === 'webhook')
  const isKB = computed(() => agent.value?.type === 'knowledge_base')
  const isUser = computed(() => agent.value?.type === 'user')
  const notFound = computed(() => !loading.value && !agent.value?.id)

  // 工具列表解析
  const toolsList = computed(() => {
    const t = agent.value?.tools
    if (!t) return []
    if (Array.isArray(t)) return t
    try { return JSON.parse(t) } catch { return [] }
  })
  const hasTools = computed(() => toolsList.value.length > 0)

  // ── 知识库文档 ──
  const [docs, { loading: docsLoading, refetch }] = createResource<any[]>(
    () => {
      if (!isKB.value) return []
      return fetch(`/api/agents/${agentId}/knowledge`, { headers })
        .then(r => r.json()).then(d => d.documents ?? [])
    },
    { initialValue: [] },
  )

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
        refetch()
      }
    } finally {
      uploading.value = false
    }
  }

  async function deleteDoc(docId: string) {
    if (!confirm('确定删除此文档？')) return
    const res = await fetch(`/api/knowledge/${docId}`, { method: 'DELETE', headers })
    if (res.ok) refetch()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    submitting.value = true
    error.value = ''

    const body: Record<string, unknown> = {
      name: name.value,
      description: description.value || undefined,
    }
    if (isAI.value) body.system_prompt = systemPrompt.value || undefined
    if (isWebhook.value) body.webhook_url = webhookUrl.value || undefined

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '保存失败'; submitting.value = false; return }
      // 刷新数据
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
              {agent.value?.is_active === false && <span class="badge badge-gray" style={{ marginLeft: '8px' }}>已暂停</span>}
            </div>
          </div>
        </div>

        <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

        <form class="card card-pad" onSubmit={handleSubmit}>
          <div class="field">
            <label class="field-label">名称 <span class="req">*</span></label>
            <input class="input" type="text" value={name} onInput={(e: any) => { name.value = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">描述</label>
            <input class="input" type="text" value={description} onInput={(e: any) => { description.value = e.target.value }} />
          </div>

          <Show when={isAI}>
            <div class="field">
              <label class="field-label">系统提示词（System Prompt）</label>
              <textarea class="textarea" rows={5} value={systemPrompt} onInput={(e: any) => { systemPrompt.value = e.target.value }} />
              <div class="field-hint">设定 AI 的角色与行为指令</div>
            </div>
          </Show>

          <Show when={isWebhook}>
            <div class="field">
              <label class="field-label">Webhook URL</label>
              <input class="input" type="url" value={webhookUrl} onInput={(e: any) => { webhookUrl.value = e.target.value }} />
              <div class="field-hint">消息将以 POST JSON 推送到该地址</div>
            </div>
          </Show>

          <div class="form-foot">
            <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/agents')}>取消</button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
              {computed(() => submitting.value ? '保存中...' : '保存修改')}
            </button>
          </div>
        </form>

        {/* ── AI 工具配置展示 ── */}
        <Show when={computed(() => isAI.value && hasTools.value)}>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '16px' }}>🔧 已注册工具</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <For each={toolsList} keyBy={(t: any) => t.function?.name ?? Math.random()}>{(tool: any) => (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--border)', fontSize: '13px',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                    {tool.function?.name ?? '未知工具'}
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '12px' }}>
                    {tool.function?.description ?? '无描述'}
                  </div>
                </div>
              )}</For>
            </div>
          </div>
        </Show>

        {/* ── Webhook 测试 ── */}
        <Show when={isWebhook}>
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
        </Show>

        {/* ── 知识库文档管理 ── */}
        <Show when={isKB}>
          <div class="card card-pad mt-24">
            <div class="sect-title" style={{ marginBottom: '16px' }}>📚 知识库文档</div>

            <Show when={docsLoading}><Loading /></Show>

            <Show when={computed(() => !docsLoading.value && (docs.value ?? []).length === 0)}>
              <div class="empty" style={{ padding: '24px' }}>
                <div class="empty-txt">暂无文档</div>
                <div class="empty-hint">上传文本来构建知识库</div>
              </div>
            </Show>

            <Show when={computed(() => (docs.value ?? []).length > 0)}>
              <div class="check-list" style={{ marginBottom: '18px', maxHeight: '300px' }}>
                <For each={docs} keyBy="id">{(d: any) => (
                  <div class="check-item">
                    <span>📄 {d.filename}</span>
                    <span class="muted" style={{ fontSize: '12px' }}>{d.chunk_count} 块</span>
                    <button
                      class="btn btn-danger btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => deleteDoc(d.id)}
                    >删除</button>
                  </div>
                )}</For>
              </div>
            </Show>

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
          </div>
        </Show>

        {/* ── User 信息 ── */}
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
