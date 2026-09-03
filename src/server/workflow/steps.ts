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

const steps: StepHandler[] = [httpStep, templateStep, logStep]

export function builtinSteps(): StepHandler[] {
  return steps
}
