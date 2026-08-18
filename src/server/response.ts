/**
 * HTTP 响应辅助函数 — 消除 Response.json({ ... }, { status }) 的重复模式。
 *
 * 所有函数返回标准的 Web Response，可直接从 handler 返回。
 *
 * ```ts
 * import { ok, created, badRequest, notFound, redirect } from 'weifuwu'
 *
 * app.get('/users/:id', async (req, ctx) => {
 *   const [user] = await ctx.sql`SELECT * FROM users WHERE id = ${ctx.params.id}`
 *   if (!user) return notFound('用户不存在')
 *   return ok(user)
 * })
 * ```
 */

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
