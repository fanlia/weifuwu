/**
 * weifuwu/workflow/steps — 内置步骤注册表（v1：http / template / log；if/ai/email 见 W3）
 *
 * 每步 = StepHandler：{ type, label, required, run(config, ctx, env) → data }
 * 语义定版（契约测试锁定）：
 *   - http：网络错误/超时 → 抛错（步骤失败）；status>=400 → ok:false 数据（不抛——让 if 判断）；
 *     2xx → ok:true { status, text, json? }（json 解析失败不算失败——text 是真相）
 *   - template：interpolate 插值（{{steps.<id>.data.xxx}} 命名空间）
 *   - log：调 env.log 输出（插值支持）
 */
import type { StepEnv, StepHandler } from './contracts.ts'
import { interpolate } from './expression.ts'

// ── http ────────────────────────────────────────────────

const httpStep: StepHandler = {
  type: 'http',
  label: 'HTTP 请求',
  fields: [
    { name: 'url', label: 'URL', type: 'string' },
    { name: 'method', label: '方法', type: 'string' },
  ],
  required: ['url'],
  async run(config, ctx, env) {
    const url = String(config.url)
    const method = method_(config.method)
    const timeoutMs = typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : 10_000
    const fetchFn = env.fetch ?? globalThis.fetch
    if (!fetchFn) throw new Error('http step: no fetch available')
    const headers = (config.headers ?? {}) as Record<string, string>
    const body = typeof config.body === 'string' ? config.body : undefined
    const res = await fetchFn(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    const data: Record<string, unknown> = { status: res.status, text }
    try { data.json = JSON.parse(text) } catch { /* 非 JSON——text 保留，不算失败 */ }
    return data
  },
}

function method_(m: unknown): string {
  const v = String(m ?? 'GET').toUpperCase()
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(v) ? v : 'GET'
}

// ── template ────────────────────────────────────────────

const templateStep: StepHandler = {
  type: 'template',
  label: '数据模板',
  fields: [{ name: 'template', label: '模板', type: 'string' }],
  required: ['template'],
  run(config, ctx) {
    return { text: interpolate(String(config.template), ctx) }
  },
}

// ── log ─────────────────────────────────────────────────

const logStep: StepHandler = {
  type: 'log',
  label: '日志',
  fields: [{ name: 'message', label: '消息', type: 'string' }],
  required: [],
  run(config, ctx, env) {
    const text = interpolate(String(config.message ?? ''), ctx)
    env.log?.(text)
    return { text }
  },
}

// ── if 依据（edge 去重语义见 runner 特判）── 无独立步骤模块——截断是流程语义

// ── ai ────────────────────────────────────────────────

const aiStep: StepHandler = {
  type: 'ai',
  label: 'AI 生成',
  fields: [
    { name: 'prompt', label: '提示词（支持 {{}} 插值）', type: 'string' },
    { name: 'system', label: '系统指令', type: 'string' },
  ],
  required: ['prompt'],
  /** 外部 LLM 调用有成本——dry 打桩 */
  effects: true,
  async run(config, ctx, env) {
    if (!env.ai?.chat) throw new Error('ai step: 未注入 ai 适配器（workflow({ ai })）')
    const system = config.system ? interpolate(String(config.system), ctx) : undefined
    const user = interpolate(String(config.prompt), ctx)
    const res = await env.ai.chat({
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: user },
      ],
    })
    return { text: res.content }
  },
}

// ── email ──────────────────────────────────────────────

const emailStep: StepHandler = {
  type: 'email',
  label: '发送邮件',
  fields: [
    { name: 'to', label: '收件人', type: 'string' },
    { name: 'subject', label: '主题（支持 {{}} 插值）', type: 'string' },
    { name: 'body', label: '正文（支持 {{}} 插值）', type: 'string' },
  ],
  required: ['to'],
  /** 真发送——dry 打桩 */
  effects: true,
  async run(config, ctx, env) {
    if (!env.email?.send) throw new Error('email step: 未注入 email 适配器（workflow({ email })）')
    const to = interpolate(String(config.to), ctx)
    const subject = config.subject ? interpolate(String(config.subject), ctx) : 'workflow 通知'
    const body = config.body ? interpolate(String(config.body), ctx) : ''
    const res = await env.email.send({ to: to.split(',').map((s) => s.trim()).filter(Boolean), subject, body })
    if (!res.ok) throw new Error(`email step: 发送失败${res.id ? ` (${res.id})` : ''}`)
    return { id: res.id }
  },
}

const steps: StepHandler[] = [httpStep, templateStep, logStep, aiStep, emailStep]

export function builtinSteps(): StepHandler[] {
  return steps
}
