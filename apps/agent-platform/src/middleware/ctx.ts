/**
 * agent-platform 聚合上下文 — 全部自研中间件注入的显式交叉类型。
 *
 * 不 declare module 覆盖框架 Context（避免与框架已声明的 auth?/ai? 等类型冲突），
 * 而是用交叉类型让编译器精确知道每个 handler 可用的注入字段。
 * 使用方式：route/service handler 的 `ctx: AppCtx`。
 */
import type { Context } from 'weifuwu'
import type { AiInjected } from './ai.ts'
import type { AuthInjected } from './auth.ts'
import type { TenantInjected } from './tenant.ts'
import type { WorkspaceInjected } from './workspace.ts'

// Omit 掉框架 Context 的 ai?/auth?（类型与自研 AiClient/AuthPayload 冲突），
// 用自研注入类型接管——避免交叉后方法签名取框架版（如 agent() 返回 SSE Response 而非结构化结果）。
export type AppCtx = Omit<Context, 'ai' | 'auth'> & AiInjected & AuthInjected & TenantInjected & WorkspaceInjected
