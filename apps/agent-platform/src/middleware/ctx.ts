/**
 * agent-platform 聚合上下文 — 自研中间件注入的显式类型。
 *
 * 不用 declare module 覆盖框架 Context（同名 auth?/ai? 与框架类型冲突），
 * 也不用 Omit（Context 带 index signature，Omit 会污染字段为 unknown）。
 * 而是自包含接口：显式列出 handler 实际可用的字段（含框架 postgres 注入的 sql），
 * 配合框架 Router<T extends object>（放开约束后自定义上下文成为一等公民）。
 */
import type { User, Context, AuthApi } from 'weifuwu'
import type { AiClientModule } from 'weifuwu'
import type { AuthPayload } from './auth-payload.ts'
import type { WorkspaceInfo } from './workspace.ts'

export interface AppCtx {
  // ── 框架核心字段 ──
  params: Record<string, string>
  query: Record<string, string>
  mountPath?: string
  user?: User | null
  loaderData?: Record<string, unknown>
  env?: Record<string, string>
  /** postgres() 中间件注入（Context['sql'] 由框架 postgres declare 提供） */
  sql: Context['sql']
  // ── 自研中间件注入 ──
  /** 框架 user() 注入：AuthApi 方法面 + 会话 payload 字段（userId/tenantId/email/name/role） */
  auth: AuthApi & AuthPayload
  /** 框架 ai() 注入：AiClientModule（chat/stream/sse/agent/embed/approve） */
  ai: AiClientModule
  /** 租户隔离（tenant 中间件从 auth.tenantId 注入） */
  tenantId: string
  workspace?: WorkspaceInfo
  // ── 其他中间件注入（宽松） ──
  [key: string]: unknown
}
