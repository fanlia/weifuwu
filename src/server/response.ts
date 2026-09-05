/**
 * HTTP 响应辅助函数 — 消除 Response.json({ ... }, { status }) 的重复模式。
 *
 * 所有函数返回标准的 Web Response，可直接从 handler 返回。
 *
 * ```ts
 * import { ok, created, badRequest, notFound, redirect } from 'weifuwu'
 *
 * app.get('/users/:id', async (req, ctx) => {
 *   const user = await ctx.orm.query.from('users').where({ id: { eq: ctx.params.id } }).run()
 *   if (!user.length) return notFound('用户不存在')
 *   return ok(user[0])
 * })
 * ```
 */

import { HttpError } from './types.ts'
import { DbError } from './db/errors.ts'

/** 200 OK — JSON 响应 */
export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init })
}

/** 201 Created — JSON 响应 */
export function created<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 201, ...init })
}

/** 204 No Content */
export function noContent(init?: ResponseInit): Response {
  return new Response(null, { status: 204, ...init })
}

/** 400 Bad Request */
export function badRequest(message?: string): Response {
  return Response.json({ error: message ?? 'Bad Request' }, { status: 400 })
}

/** 401 Unauthorized */
export function unauthorized(message?: string): Response {
  return Response.json({ error: message ?? 'Unauthorized' }, { status: 401 })
}

/** 403 Forbidden */
export function forbidden(message?: string): Response {
  return Response.json({ error: message ?? 'Forbidden' }, { status: 403 })
}

/** 404 Not Found */
export function notFound(message?: string): Response {
  return Response.json({ error: message ?? 'Not Found' }, { status: 404 })
}

/** 409 Conflict */
export function conflict(message?: string): Response {
  return Response.json({ error: message ?? 'Conflict' }, { status: 409 })
}

/** 422 Unprocessable Entity */
export function unprocessable(message?: string): Response {
  return Response.json({ error: message ?? 'Unprocessable Entity' }, { status: 422 })
}

/** 429 Too Many Requests */
export function tooManyRequests(message?: string): Response {
  return Response.json({ error: message ?? 'Too Many Requests' }, { status: 429 })
}

/** 500 Internal Server Error */
export function serverError(message?: string): Response {
  return Response.json({ error: message ?? 'Internal Server Error' }, { status: 500 })
}

/**
 * 重定向响应（默认 302）。
 *
 * ```ts
 * return redirect('/login')
 * return redirect('/new-path', 301) // 永久重定向
 * ```
 */
export function redirect(url: string, status: number = 302): Response {
  return new Response(null, { status, headers: { Location: url } })
}

/**
 * 错误 → Response（总错误面——HTTP 链（router.onError/默认链）与 route 内
 * catch 同语义——DbError/HttpError 映射单源）。
 *
 * 双层语义（有意分层——文档契约）：
 * - **链面（未捕获）**：普通 Error → 500（Internal Server Error——意外错误
 *   诚实现形不泄漏——router.handleError 默认链消费）；DbError/ValidationError
 *   → 400/409（orm 错误不该 500）
 * - **route 内 catch（已知业务）**：普通 Error → 400（业务守卫/校验——
 *   「我知道这是什么错」→ errorResponse 显式调用）
 * - HttpError：双面一致（status 权威——403/404/409 同输出）
 *
 * code 面（`{ error, code }`——前端可 switch 而非解析 message 字符串）：
 *   ValidationError → 'validation' · DbError 23505 → 'conflict' ·
 *   DbError.kind → kind · HttpError/普通 Error → 无 code（status 已是语义）。
 */
export function errorResponse(e: unknown, status?: number): Response {
  const msg = e instanceof Error ? e.message : String(e)
  // code 面（语义码——同 status 不同语义可编程判别）
  let code: string | undefined
  if (e instanceof HttpError) {
    return Response.json({ error: msg }, { status: status ?? e.status })
  }
  if (e instanceof DbError) {
    const st = status ?? (e.code === '23505' ? 409 : 400)
    code = e.code === '23505' ? 'conflict' : e.kind
    return Response.json({ error: msg, code }, { status: st })
  }
  return Response.json({ error: msg }, { status: status ?? 400 })
}

