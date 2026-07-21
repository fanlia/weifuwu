/**
 * 租户隔离中间件
 *
 * 从 JWT auth payload 中提取 tenant_id，注入 ctx.tenantId
 * 必须在 auth() 之后使用
 */

import type { Context, Middleware } from 'weifuwu'

declare module 'weifuwu' {
  interface Context {
    tenantId: string
  }
}

/**
 * 租户隔离中间件
 *
 * 从 ctx.auth.tenantId 提取 tenant_id，注入 ctx.tenantId
 * 所有数据查询时通过 WHERE tenant_id = ctx.tenantId 实现隔离
 *
 * ```ts
 * import { auth } from './middleware/auth.ts'
 * import { tenant } from './middleware/tenant.ts'
 * app.use(auth())
 * app.use(tenant())
 * ```
 */
export function tenant(): Middleware<Context, Context & { tenantId: string }> {
  const mw: Middleware = (req, ctx, next) => {
    if (!ctx.auth) {
      return Response.json({ error: '未认证' }, { status: 401 })
    }
    ctx.tenantId = ctx.auth.tenantId
    return next(req, ctx)
  }
  mw.__meta = { injects: ['tenantId'], depends: ['auth'] }

  return mw as Middleware<Context, Context & { tenantId: string }>
}
