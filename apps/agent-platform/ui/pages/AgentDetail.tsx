/**
 * Agent 详情/编辑页面
 */

import { signal, computed, createResource, Show } from 'weifuwu/client'
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
  const notFound = computed(() => !loading.value && !agent.value?.id)

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
      ctx.app.navigate('/agents')
    } catch {
      error.value = '网络错误'
      submitting.value = false
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
            <div class="detail-hero-sub">ID: {agentId}</div>
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
              <textarea class="textarea" value={systemPrompt} onInput={(e: any) => { systemPrompt.value = e.target.value }} />
            </div>
          </Show>

          <Show when={isWebhook}>
            <div class="field">
              <label class="field-label">Webhook URL</label>
              <input class="input" type="url" value={webhookUrl} onInput={(e: any) => { webhookUrl.value = e.target.value }} />
            </div>
          </Show>

          <div class="form-foot">
            <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/agents')}>取消</button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
              {computed(() => submitting.value ? '保存中...' : '保存修改')}
            </button>
          </div>
        </form>
        </div>
        )}
      </Show>
    </div>
  )
}
