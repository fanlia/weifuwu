/**
 * 会话 payload 类型 — 框架 user() 从 token 解码合并到 ctx.auth 的字段。
 * （auth 中间件已删，此类型保留供 AppCtx 标注 payload 字段）
 */
export interface AuthPayload {
  /** 当前用户 id（token 的 sub） */
  userId: string
  /** 租户 id（token 携带时；多租户隔离用） */
  tenantId?: string
  email?: string
  name?: string
  role?: string
}
