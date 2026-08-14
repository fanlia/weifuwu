/**
 * Webhook 消息收发服务
 *
 * Webhook Bot 通过 HTTP POST 接收外部消息，调用 AI 处理后返回
 *
 * 增强：
 * - HMAC-SHA256 签名验证（X-Signature header）
 * - 失败重试（指数退避）
 * - 调用日志记录
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AppCtx } from '../middleware/ctx.ts'
import type { ChatMessage } from '../ai/types.ts'

export interface WebhookRequest {
  content: string
  conversation_id?: string
  [key: string]: unknown
}

export interface WebhookResponse {
  reply: string
  conversation_id?: string
}

export interface WebhookConfig {
  id: string
  app_id: string
  system_prompt: string
  model: string | null
  tools: unknown[]
  temperature: number | null
  max_tokens: number | null
  webhook_secret: string | null
  webhook_retry_count: number | null
}

/**
 * 验证 Webhook 请求签名
 *
 * HMAC-SHA256(body) === X-Signature header
 */
function createSignature(body: string, secret: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/**
 * SSRF 防护：出站 URL 必须 http/https 且非内网（字面量 + DNS 解析双检查）
 * ——webhook_url 由租户配置，服务器 fetch 任意 URL = 内网探测/元数据窃取风险
 */
async function isSafeWebhookUrl(raw: string): Promise<boolean> {
  // 测试逃生口（仅测试环境——集成测试用本地 mock 端点验证镜像；生产绝不设置）
  if (process.env.WEBHOOK_SSRF_ALLOW_PRIVATE === '1') return true
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '127.0.0.1') return false
    const isPrivate = (addr: string): boolean => {
      const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
      if (!m) return addr.includes(':') // 非 IPv4（IPv6/域名）→ DNS 检查兜底；域名本身放行走解析
      const [a, b] = m.slice(1).map(Number)
      return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    }
    if (isPrivate(host)) return false
    // DNS 解析检查：域名指向内网也拒绝
    const { lookup } = await import('node:dns/promises')
    const addrs = await lookup(host).catch(() => [] as Array<{ address: string }>)
    if (!Array.isArray(addrs) || addrs.length === 0) return false
    for (const a of addrs) if (isPrivate(a.address)) return false
    return true
  } catch { return false }
}

/**
 * 出站回调镜像：入站应答回推到配置的 webhook_url（双向管道）
 * - 签名对齐入站：X-Timestamp（毫秒）+ X-Signature（HMAC(secret, ts + '.' + body)）
 * - 重试：指数退避（复用 webhook_retry_count）
 * - 未配置 URL → 直接成功（无镜像）
 */
async function deliverOutbound(agent: any, reply: string, conversationId?: string): Promise<boolean> {
  const url = agent?.webhook_url ? String(agent.webhook_url) : ''
  if (!url) return true
  // SSRF 防护：内网/非法 URL 拒绝推送（记录日志由调用方处理）
  if (!(await isSafeWebhookUrl(url))) return false
  const secret = agent?.webhook_secret ? String(agent.webhook_secret) : ''
  const maxRetry = Math.max(1, Number(agent?.webhook_retry_count ?? 3))
  const body = JSON.stringify({ reply, conversation_id: conversationId ?? null, timestamp: Date.now() })
  for (let attempt = 0; attempt < maxRetry; attempt++) {
    try {
      const ts = String(Date.now())
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Timestamp': ts }
      if (secret) headers['X-Signature'] = createSignature(body, secret, ts)
      const res = await fetch(url, { method: 'POST', headers, body })
      if (res.ok) return true
      // 非 2xx → 退避重试
      if (attempt < maxRetry - 1) await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
    } catch {
      if (attempt < maxRetry - 1) await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
    }
  }
  return false
}

function verifySignature(body: string, signature: string, secret: string, timestamp?: string): boolean {
  try {
    // timestamp 参与签名：HMAC(secret, timestamp + '.' + body)——防 replay（旧调用方无 timestamp 时退化为 HMAC(body)）
    const payload = timestamp ? `${timestamp}.${body}` : body
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const received = signature.toLowerCase()
    // timingSafeEqual 防止时序攻击
    const expectedBuf = Buffer.from(expected, 'hex')
    const receivedBuf = Buffer.from(received, 'hex')
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ── Replay 防护：已用 nonce 集合（进程内，5 分钟过期） ──────────
const seenNonces = new Map<string, number>()
function checkNonce(nonce: string | undefined, timestamp: string | undefined): boolean {
  if (!nonce || !timestamp) return true // 旧调用方（无 nonce/timestamp）不拦截——兼容
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false // timestamp 超 5 分钟 = 过期/重放
  const now = Date.now()
  for (const [k, t] of seenNonces) { if (now - t > 5 * 60_000) seenNonces.delete(k) } // 清理过期
  if (seenNonces.has(nonce)) return false // 同 nonce 重放
  seenNonces.set(nonce, now)
  return true
}

/**
 * 带重试的 fetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.ok || attempt === retries) return res
      // 只在服务端错误时重试
      if (res.status < 500) return res
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    if (attempt < retries) {
      // 指数退避：1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw lastErr ?? new Error('Webhook retry failed')
}

/**
 * 处理 Webhook Bot 的入站消息
 *
 * 1. 查找 agent 配置（含 webhook_secret、webhook_retry_count）
 * 2. 验证请求签名（如果配置了 secret）
 * 3. 构建对话消息
 * 4. 调用 AI 生成回复
 * 5. 记录调用日志到 webhook_logs
 * 6. 返回响应
 */
export async function handleWebhookMessage(
  ctx: AppCtx,
  agentId: string,
  body: WebhookRequest,
  appId?: string,
  signature?: string,
  timestamp?: string,
  nonce?: string,
): Promise<WebhookResponse> {
  const { sql, ai } = ctx
  const startTime = Date.now()

  // 查找 agent — 如果有 appId 则验证租户隔离
  const agent: Record<string, any> = appId
    ? (await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens,
               webhook_secret, webhook_retry_count, webhook_url, app_id
        FROM agents
        WHERE id = ${agentId} AND type = 'webhook' AND is_active = TRUE AND app_id = ${appId}
      `)[0] as unknown as Record<string, any>
    : (await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens,
               webhook_secret, webhook_retry_count, webhook_url, app_id
        FROM agents
        WHERE id = ${agentId} AND type = 'webhook' AND is_active = TRUE
      `)[0] as unknown as Record<string, any>

  if (!agent) {
    throw new Error('Webhook Bot not found or inactive')
  }

  // 签名验证（如果配置了 secret）
  if (agent.webhook_secret) {
    if (!signature) {
      // 记录日志并返回错误
      await logWebhookCall(ctx, agentId, agent.app_id, JSON.stringify(body), null, 401, Date.now() - startTime, false)
      throw new Error('Missing X-Signature header')
    }
    const rawBody = JSON.stringify(body)
    if (!verifySignature(rawBody, signature, agent.webhook_secret, timestamp)) {
      await logWebhookCall(ctx, agentId, agent.app_id, rawBody, null, 403, Date.now() - startTime, false)
      throw new Error('Invalid signature')
    }
    if (!checkNonce(nonce, timestamp)) {
      await logWebhookCall(ctx, agentId, agent.app_id, rawBody, null, 403, Date.now() - startTime, false)
      throw new Error('Replay detected or stale timestamp')
    }
  }

  const systemPrompt = agent.system_prompt ?? '你是一个 Webhook Bot。'
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
  const retryCount = agent.webhook_retry_count ?? 3

  // B1：conversation_id 会话记忆——同一会话的多轮调用保持上下文（最近 10 轮）
  const history = await loadConversationHistory(ctx, agentId, body.conversation_id, 10)

  // 统一走 agent runner（兼容纯对话和 tool calling）
  const agentRunner = ai.agent({
    model: agent.model,
    systemPrompt,
    tools,
    maxSteps: tools.length > 0 ? 5 : 1,
  })

  try {
    const result = await agentRunner.runToResult([...history, { role: 'user', content: body.content }])

    // 持久化本轮对话（B1）
    await persistConversation(ctx, agentId, body.conversation_id, 'user', body.content)
    await persistConversation(ctx, agentId, body.conversation_id, 'assistant', result.content)

    const elapsed = Date.now() - startTime
    await logWebhookCall(ctx, agentId, agent.app_id, JSON.stringify(body), result.content, 200, elapsed, true)
    await pruneLogs(ctx, agentId) // D3：每 agent 保留最近 500 条

    // 出站镜像：配置了 webhook_url → 应答回推到外部系统（双向管道）
    if (agent.webhook_url) {
      const delivered = await deliverOutbound(agent, result.content, body.conversation_id)
      await logWebhookCall(ctx, agentId, agent.app_id, `OUTBOUND → ${String(agent.webhook_url)}`, result.content, delivered ? 200 : 502, Date.now() - startTime, delivered)
    }

    return {
      reply: result.content,
      conversation_id: body.conversation_id,
    }
  } catch (err) {
    const elapsed = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)
    await logWebhookCall(ctx, agentId, agent.app_id, JSON.stringify(body), errMsg, 500, elapsed, false)
    await pruneLogs(ctx, agentId) // D3
    throw err
  }
}

/**
 * B1：加载会话历史（conversation_id 多轮记忆）——无 conversation_id 返回空（单轮兼容）
 */
async function loadConversationHistory(ctx: AppCtx, agentId: string, conversationId: string | undefined, limit: number): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!conversationId) return []
  try {
    const { sql } = ctx as any
    if (!sql) return []
    const rows = await sql`
      SELECT role, content FROM webhook_conversations
      WHERE agent_id = ${agentId} AND conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit * 2}
    `
    const list = Array.isArray(rows) ? rows : [rows]
    // 截断到偶数条（保证 user/assistant 成对），最多保留 limit 轮
    const maxPairs = Math.floor(list.length / 2)
    const pairs = Math.min(maxPairs, limit)
    const trimmed = list.slice(list.length - pairs * 2)
    return trimmed.map((r: any) => ({ role: r.role as 'user' | 'assistant', content: String(r.content ?? '') }))
  } catch {
    return []
  }
}

/**
 * B1：持久化对话记录（表不存在时静默跳过——webhook_conversations 迁移由 schema.sql 负责）
 */
async function persistConversation(ctx: AppCtx, agentId: string, conversationId: string | undefined, role: string, content: string): Promise<void> {
  if (!conversationId) return
  try {
    const { sql } = ctx as any
    if (!sql) return
    await sql`
      INSERT INTO webhook_conversations (agent_id, conversation_id, role, content)
      VALUES (${agentId}, ${conversationId}, ${role}, ${content})
    `
  } catch { /* 会话持久化失败不影响主流程 */ }
}

/**
 * D3：每 agent 保留最近 500 条日志（超量删除最旧）
 */
async function pruneLogs(ctx: AppCtx, agentId: string): Promise<void> {
  try {
    const { sql } = ctx as any
    if (!sql) return
    await sql`
      DELETE FROM webhook_logs
      WHERE agent_id = ${agentId}
        AND id NOT IN (
          SELECT id FROM webhook_logs
          WHERE agent_id = ${agentId}
          ORDER BY created_at DESC
          LIMIT 500
        )
    `
  } catch { /* 清理失败不影响主流程 */ }
}

/**
 * 记录 Webhook 调用日志
 */
async function logWebhookCall(
  ctx: AppCtx,
  agentId: string,
  appId: string,
  requestBody: string,
  responseBody: string | null,
  responseStatus: number | null,
  elapsedMs: number,
  success: boolean,
): Promise<void> {
  try {
    const { sql } = ctx as any
    if (sql) {
      await sql`
        INSERT INTO webhook_logs (agent_id, app_id, request_body, response_body, response_status, elapsed_ms, success)
        VALUES (${agentId}, ${appId}, ${requestBody}, ${responseBody}, ${responseStatus}, ${elapsedMs}, ${success})
      `
    }
  } catch {
    // 日志记录失败不影响主流程
  }
}
