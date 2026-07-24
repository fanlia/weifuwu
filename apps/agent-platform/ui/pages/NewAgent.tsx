/**
 * 新建 Agent 页面
 */

import { signal, computed, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

const AGENT_TYPES = [
  { value: 'ai', label: '🤖 AI 机器人', desc: 'DeepSeek 驱动，支持工具调用与人工审批' },
  { value: 'webhook', label: '🔗 Webhook', desc: '通过 HTTP Webhook 收发消息' },
  { value: 'knowledge_base', label: '📚 知识库', desc: 'PGVector 文档语义检索' },
  { value: 'user', label: '👤 真实用户', desc: '绑定到平台用户账号' },
]

export function NewAgent(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token

  const type = signal('ai')
  const name = signal('')
  const description = signal('')
  const systemPrompt = signal('')
  const webhookUrl = signal('')
  const chunkSize = signal('500')
  // AI 配置
  const aiModel = signal('')
  const aiTemperature = signal('0.7')
  const aiMaxTokens = signal('2048')
  const aiHITL = signal(false)
  const submitting = signal(false)
  const error = signal('')

  const hasError = computed(() => error.value !== '')
  const isAI = computed(() => type.value === 'ai')
  const isWebhook = computed(() => type.value === 'webhook')
  const isKB = computed(() => type.value === 'knowledge_base')
  const typeClass = (v: string) => computed(() => `type-opt${type.value === v ? ' on' : ''}`)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!name.value.trim()) { error.value = '请输入名称'; return }
    submitting.value = true
    error.value = ''

    const body: Record<string, unknown> = {
      type: type.value,
      name: name.value.trim(),
      description: description.value || undefined,
    }
    if (type.value === 'ai') {
      body.system_prompt = systemPrompt.value || undefined
      body.model = aiModel.value || undefined
      body.temperature = parseFloat(aiTemperature.value) || 0.7
      body.max_tokens = parseInt(aiMaxTokens.value) || 2048
      body.human_in_the_loop = aiHITL.value
    }
    if (type.value === 'webhook') body.webhook_url = webhookUrl.value || undefined
    if (type.value === 'knowledge_base') body.chunk_size = parseInt(chunkSize.value) || 500

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '创建失败'; submitting.value = false; return }
      ctx.app.navigate('/agents')
    } catch {
      error.value = '网络错误'
      submitting.value = false
    }
  }

  return (
    <div class="page page-narrow">
      <a href="/agents" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/agents') }}>← 返回 Agent 列表</a>
      <PageHeader title="创建 Agent" sub="选择类型并填写基础信息" />

      <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

      <form class="card card-pad" onSubmit={handleSubmit}>
        <div class="field">
          <label class="field-label">类型</label>
          <div class="type-grid">
            <For each={AGENT_TYPES}>{(t: any) => (
              <div class={typeClass(t.value)} onClick={() => { type.value = t.value; error.value = '' }}>
                <div class="type-opt-t">{t.label}</div>
                <div class="type-opt-d">{t.desc}</div>
              </div>
            )}</For>
          </div>
        </div>

        <div class="field">
          <label class="field-label">名称 <span class="req">*</span></label>
          <input class="input" type="text" placeholder="输入 Agent 名称" value={name}
            onInput={(e: any) => { name.value = e.target.value }} />
        </div>

        <div class="field">
          <label class="field-label">描述</label>
          <input class="input" type="text" placeholder="简短描述此 Agent 的用途" value={description}
            onInput={(e: any) => { description.value = e.target.value }} />
        </div>

        <Show when={isAI}>
          <div class="field">
            <label class="field-label">系统提示词（System Prompt）</label>
            <textarea class="textarea" placeholder="设定 AI 的角色与行为指令..." value={systemPrompt}
              onInput={(e: any) => { systemPrompt.value = e.target.value }} />
            <div class="field-hint">留空则使用默认助手人格</div>
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field-label">模型</label>
              <select class="select" value={aiModel} onChange={(e: any) => { aiModel.value = e.target.value }}>
                <option value="">默认 (deepseek-chat)</option>
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
              </select>
              <div class="field-hint">默认使用环境变量 DEEPSEEK_MODEL 指定的模型</div>
            </div>
            <div class="field">
              <label class="field-label">温度 (Temperature)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="range" min="0" max="2" step="0.1" value={aiTemperature}
                  onInput={(e: any) => { aiTemperature.value = e.target.value }}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '30px', textAlign: 'center' }}>{aiTemperature}</span>
              </div>
              <div class="field-hint">较低值更确定，较高值更创造性（默认 0.7）</div>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field-label">最大 Token 数</label>
              <input class="input" type="number" min="64" max="8192" step="64" value={aiMaxTokens}
                onInput={(e: any) => { aiMaxTokens.value = e.target.value }} />
              <div class="field-hint">单次回复的最大 token 数，默认 2048</div>
            </div>
            <div class="field">
              <label class="field-label">人工审批 (Human-in-the-Loop)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '9px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={aiHITL}
                    onChange={(e: any) => { aiHITL.value = e.target.checked }} />
                  <span>开启后 AI 回复需人工批准后才发送</span>
                </label>
              </div>
              <div class="field-hint">适用于敏感场景，需要人工审核 AI 输出</div>
            </div>
          </div>
        </Show>

        <Show when={isWebhook}>
          <div class="field">
            <label class="field-label">Webhook URL</label>
            <input class="input" type="url" placeholder="https://example.com/webhook" value={webhookUrl}
              onInput={(e: any) => { webhookUrl.value = e.target.value }} />
            <div class="field-hint">消息将以 POST JSON 推送到该地址</div>
          </div>
        </Show>

        <Show when={isKB}>
          <div class="field">
            <label class="field-label">分块大小（chunk_size）</label>
            <input class="input" type="number" value={chunkSize}
              onInput={(e: any) => { chunkSize.value = e.target.value }} />
            <div class="field-hint">文档切分的字符数，默认 500</div>
          </div>
        </Show>

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/agents')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {computed(() => submitting.value ? '创建中...' : '创建 Agent')}
          </button>
        </div>
      </form>
    </div>
  )
}
