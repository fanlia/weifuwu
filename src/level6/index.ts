import { serve as serveCore } from '../level2/serve.ts'
import { createNativeWsAdapter } from '../level5/server/ws/native/index.ts'

export type { Context, Handler, Middleware, ErrorHandler } from '../level0/types.ts'
export { HttpError, createMiddleware } from '../level0/types.ts'
export type { User, Hub } from '../level0/types.ts'
export { DEFAULT_MAX_BODY } from '../level2/serve.ts'
export type { ServeOptions, Server } from '../level2/serve.ts'
export { Router } from '../level2/router.ts'
export type { WebSocketHandler, WsHandlePort } from '../level2/ws.ts'

/**
 * serve——默认注入自研 RFC6455 适配器（W5；`ws` 仅作差分对账参考，不再随包发布依赖）。
 * 自定义协议（测试替身/特殊限额）时传 `options.wsAdapter` 覆盖；
 * 未注册 WS 路由时工厂不会被调用（零开销）。
 *
 * 直接使用 `weifuwu/core` 的 serve() 时需自行提供 wsAdapter（core 无 ws 实现）。
 */
export function serve<T extends object>(
  router: import('../level2/router.ts').Router<T>,
  options?: import('../level2/serve.ts').ServeOptions,
): import('../level2/serve.ts').Server {
  const withAdapter =
    options?.wsAdapter !== undefined ? options : { ...options, wsAdapter: createNativeWsAdapter }
  return serveCore(router, withAdapter)
}
export type { WebSocket } from '../level0/types.ts'
export { cors } from '../level5/server/middleware/cors.ts'
export type { CORSOptions } from '../level5/server/middleware/cors.ts'
export { compress } from '../level5/server/middleware/compress.ts'
export type { CompressOptions } from '../level5/server/middleware/compress.ts'
export { serveStatic } from '../level5/server/middleware/static.ts'
export type { ServeStaticOptions } from '../level5/server/middleware/static.ts'
export { rateLimit } from '../level5/server/middleware/rate-limit.ts'
export type { RateLimitOptions, RateLimitInjected, RateLimitAlgorithm } from '../level5/server/middleware/rate-limit.ts'
export { email } from './server/email/index.ts'
export type { EmailOptions, EmailMessage, EmailResult, EmailAdapter, EmailInjected } from './server/email/index.ts'
export type { Mailer, EmailInterface } from '../level5/server/email/contracts.ts'
export { MemoryEmail, createMemoryEmail, MemoryEmailServer, createMemoryEmailServer } from './server/email/index.ts'
export { userSystem, BUILTIN_APP_ID, WEIFUWU_USER_SCHEMA } from './server/user/index.ts'
export { appAuth } from '../level5/server/user/app-auth.ts'
export { z, type Infer, type ZodType, type ZodRawShape } from '../level0/zod.ts'
export { shape, f, type Shape, type FieldDbMeta, type BodyOf, type PatchOf } from '../level0/db/shape.ts'
export { bodyOf, type BodyOfOptions } from '../level4/server/db/body.ts'
export { listQuery, type ListQueryOptions } from '../level4/server/db/http.ts'
export { diffConsistency, normalizeType, type ConsistencyIssue, type DeclaredTable, type LiveTable } from '../level2/db/consistency.ts'
export { compileSchemaDDL, compileSchemaDdl, ddlToSql, type SchemaModule, type TableDecl, type IndexDecl, type EnumDecl } from '../level2/db/schema.ts'
export { createOrm, memoryAdapter, postgresAdapter, type Orm, type CtxOrm, type OrmTable, type RowOf, type OrmTenant, type DbAdapter } from '../level2/db/orm.ts'
export { gqlFromShape } from '../level5/server/db/gql-from-shape.ts'
export { restFromShape } from '../level5/server/db/rest-from-shape.ts'
export type { GqlShapeOptions, GqlShapeOutput, RestHooks, RestShapeOptions, RestShapeOutput } from '../level0/db/generator-contracts.ts'
export { eq, ne, gt, gte, lt, lte, inArray, notInArray, between, like, ilike, contains, startsWith, endsWith, eqCol, isNull, isNotNull, and, or, not, cols, type ColRef, type ShapeCols } from '../level0/db/ops.ts'
export { createTypedQuery, type TypedQuery, type TSelect, type TypedSchema, type SelRow, type TWhere } from '../level2/db/typed-query.ts'
export type { WhereExpr, Query } from '../level0/db/query.ts'
export { buildQuery, createQueryBuilder } from '../level2/db/query-builder.ts'
export * as ops from '../level0/db/ops.ts'
export { hashPassword, verifyPassword } from '../level5/server/user/password.ts'
// Token 工具（2026-08——下载直链 ?token= 验签——应用层复用同一 secret）
export { signToken, verifyToken, generateRefreshToken } from '../level5/server/user/token.ts'
export { messager, WEIFUWU_MESSAGER_SCHEMA } from './server/messager/index.ts'
export type { UserSystemOptions, UserInjected, AuthApi, RegisterInput } from './server/user/index.ts'
export type { MessagerOptions, MessagerInjected, MessagerClient, MessagerSystem, MessagerHandlerOptions, Message, Conversation } from './server/messager/index.ts'
export { workflowSystem, WEIFUWU_WORKFLOW_SCHEMA } from './server/workflows/index.ts'
export type { WorkflowSystem, WorkflowSystemOptions, WorkflowClient, WorkflowCrud, WorkflowRecord, WorkflowRunRecord, CompileGateInput } from './server/workflows/index.ts'
export { queue } from './server/queue/index.ts'
export { scheduler } from './server/scheduler/index.ts'
export type { QueueOptions, QueueClient, QueueInjected, QueueWorker, WorkerOptions, AddOptions, Job } from './server/queue/index.ts'
export { OpenAi, MemoryAi, createMemoryAi } from './server/ai/index.ts'
export type { Ai, AIInterface, ApprovalRequest, ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from '../level5/server/ai/contracts.ts'
export type { ImageGenOptions, VideoGenOptions, ImageGenClient, VideoGenClient } from '../level5/server/ai/multimodal.ts'
export type { MemoryAiOptions, OpenAiOptions, AiClientModule, AiInjected } from './server/ai/index.ts'
export { MemoryAiServer, createMemoryAiServer } from '../level5/server/ai/memory-server.ts'
export type { MemoryAiServerOptions, MemoryAiServerHandle } from '../level5/server/ai/memory-server.ts'
export type {
  AiClient,
  ChatResponse,
  AgentConfig,
  AgentTool,
  AgentRunner,
  ToolContext,
  AgentRunResult,
  AgentStep,
  WfEmitter,
} from './server/ai/index.ts'
export type {
  WfStreamEvent,
  WfMessageStart,
  WfToken,
  WfUsage,
  WfDone,
  WfError,
  WfErrorCode,
  WfToolCall,
  WfToolResult,
  WfToolProgress,
  WfStep,
  WfApprovalRequest,
  WfApprovalResponse,
  WfApprovalDecision,
  ChatMessage,
  ChatParams,
  MessageRole,
  ToolCall,
  ToolDefinition,
} from '../level5/server/ai/types.ts'
export { ui } from './server/ui/index.ts'
export { graphql } from '../level5/server/middleware/graphql.ts'
export type { GraphQLOptions, GraphQLHandler } from '../level5/server/middleware/graphql.ts'
export { postgres, MIGRATIONS_TABLE } from './server/postgres/index.ts'
export type { PostgresOptions, PostgresClient, PostgresInjected } from '../level5/server/postgres/types.ts'
export { redis } from './server/redis/index.ts'
export type { RedisOptions, RedisClient, RedisInjected } from '../level5/server/redis/types.ts'
export type { Redis, PoolConnection, PostgresPoolConnection, RedisPoolConnection } from '../level0/db/contracts.ts'
export { MemoryRedis } from '../level5/server/db/memory-redis.ts'
export { MemorySql, createMemoryOrm } from '../level2/db/memory-sql.ts'
export { MemoryRedisServer } from '../level5/server/db/redis-server.ts'
export { workflow } from './server/workflow/index.ts'
export type { WorkflowEngine, WorkflowOptions } from './server/workflow/index.ts'
export type { WorkflowDef, StepDef, StepHandler, StepEnv, RunResult, ExecuteOptions, WorkflowCtx, StepOutput, RunStatus } from '../level5/server/workflow/contracts.ts'
export type { KVStore } from '../level5/server/workflow/store.ts'
export { ok, created, noContent, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, tooManyRequests, serverError, redirect, errorResponse } from '../level2/response.ts'
export { parseBody } from '../level5/server/request.ts'



