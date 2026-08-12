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
  tenant_id: string
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
  tenantId?: string,
  signature?: string,
  timestamp?: string,
  nonce?: string,
): Promise<WebhookResponse> {
  const { sql, ai } = ctx
  const startTime = Date.now()

  // 查找 agent — 如果有 tenantId 则验证租户隔离
  const agent: Record<string, any> = tenantId
    ? (await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens,
               webhook_secret, webhook_retry_count, tenant_id
        FROM agents
        WHERE id = ${agentId} AND type = 'webhook' AND is_active = TRUE AND tenant_id = ${tenantId}
      `)[0] as unknown as Record<string, any>
    : (await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens,
               webhook_secret, webhook_retry_count, tenant_id
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
      await logWebhookCall(ctx, agentId, agent.tenant_id, JSON.stringify(body), null, 401, Date.now() - startTime, false)
      throw new Error('Missing X-Signature header')
    }
    const rawBody = JSON.stringify(body)
    if (!verifySignature(rawBody, signature, agent.webhook_secret, timestamp)) {
      await logWebhookCall(ctx, agentId, agent.tenant_id, rawBody, null, 403, Date.now() - startTime, false)
      throw new Error('Invalid signature')
    }
    if (!checkNonce(nonce, timestamp)) {
      await logWebhookCall(ctx, agentId, agent.tenant_id, rawBody, null, 403, Date.now() - startTime, false)
      throw new Error('Replay detected or stale timestamp')
    }
  }

  const systemPrompt = agent.system_prompt ?? '你是一个 Webhook Bot。'
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
  const retryCount = agent.webhook_retry_count ?? 3

  // 统一走 agent runner（兼容纯对话和 tool calling）
  const agentRunner = ai.agent({
    model: agent.model,
    systemPrompt,
    tools,
    maxSteps: tools.length > 0 ? 5 : 1,
  })

  try {
    const result = await agentRunner.runToResult([{ role: 'user', content: body.content }])

    const elapsed = Date.now() - startTime
    await logWebhookCall(ctx, agentId, agent.tenant_id, JSON.stringify(body), result.content, 200, elapsed, true)

    return {
      reply: result.content,
      conversation_id: body.conversation_id,
    }
  } catch (err) {
    const elapsed = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)
    await logWebhookCall(ctx, agentId, agent.tenant_id, JSON.stringify(body), errMsg, 500, elapsed, false)
    throw err
  }
}

/**
 * 记录 Webhook 调用日志
 */
async function logWebhookCall(
  ctx: AppCtx,
  agentId: string,
  tenantId: string,
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
        INSERT INTO webhook_logs (agent_id, tenant_id, request_body, response_body, response_status, elapsed_ms, success)
        VALUES (${agentId}, ${tenantId}, ${requestBody}, ${responseBody}, ${responseStatus}, ${elapsedMs}, ${success})
      `
    }
  } catch {
    // 日志记录失败不影响主流程
  }
}
