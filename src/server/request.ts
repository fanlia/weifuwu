/**
 * 请求辅助函数 — 安全解析 HTTP 请求体。
 *
 * ```ts
 * import { parseBody } from 'weifuwu'
 *
 * app.post('/users', async (req, ctx) => {
 *   const { name, email } = await parseBody<{ name: string; email: string }>(req)
 *   // parseBody 自动处理 JSON 解析错误 → 400
 * })
 * ```
 */

import { HttpError } from './types.ts'

/**
 * 安全解析 JSON 请求体。
 *
 * - JSON 格式错误 → 抛出 HttpError(400)
 * - 类型参数 T 提供编译时类型提示
 *
 * ```ts
 * const body = await parseBody<{ name: string }>(req)
 * ```
 */
export async function parseBody<T = unknown>(req: Request): Promise<T> {
  // GET/HEAD 请求没有 body
  if (req.method === 'GET' || req.method === 'HEAD') {
    return {} as T
  }

  try {
    return await req.json() as T
  } catch {
    throw new HttpError('Invalid JSON body', 400)
  }
}
