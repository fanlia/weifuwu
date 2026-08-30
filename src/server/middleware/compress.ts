/**
 * weifuwu/compress — 响应压缩中间件（SERVER-PERF-PLAN S7——波次 3）
 *
 * br 优先 → gzip 兜底（Accept-Encoding 协商）；阈值默认 1KB（小响应压缩得不偿失）；
 * content-type 白名单（文本类）；SSE（text/event-stream）跳过——流式逐 token 推送
 * 不被缓冲化。流式压缩：response.body 管道经 zlib 转换流——不在内存攒全量（与
 * sendResponse 背压机制衔接——SERVER-PERF-PLAN S1）。
 *
 * 诚实裁剪：❌ zstd（node 内置支持面未稳）、❌ 动态字典、❌ 静态压缩
 * （serveStatic 预压缩探测覆盖——S8）。
 *
 * ```ts
 * import { compress } from 'weifuwu'
 * app.use(compress())                          // 默认阈值 1KB
 * app.use(compress({ threshold: 0 }))          // 全部压缩
 * ```
 */

import { createGzip, createBrotliCompress } from 'node:zlib'
import { Readable, Transform } from 'node:stream'
import type { Context, Middleware } from '../types.ts'

export interface CompressOptions {
  /** 最小压缩字节数（Content-Length 判定；未知长度按需压缩）。默认 1024。 */
  threshold?: number
  /** 压缩级别（gzip level / brotli quality）。默认 zlib 默认值。 */
  level?: number
}

/** 可压缩 content-type 前缀/全名白名单（文本类——二进制已压缩再压无益）。
 *  text/event-stream 显式排除——SSE 逐 token 推送与压缩缓冲化冲突。 */
const COMPRESSIBLE = (type: string): boolean => {
  if (!type) return false
  const t = type.split(';')[0].trim().toLowerCase()
  if (t === 'text/event-stream') return false
  return (
    t.startsWith('text/') ||
    t === 'application/json' ||
    t === 'application/javascript' ||
    t === 'application/xml' ||
    t === 'image/svg+xml' ||
    t === 'application/wasm'
  )
}

export function compress(options: CompressOptions = {}): Middleware<Context, Context> {
  const threshold = options.threshold ?? 1024
  const level = options.level

  return async (req, ctx, next) => {
    const res = await next(req, ctx)

    // 无 body / 已编码 / 不可压缩类型 → 原样返回
    const contentEncoding = res.headers.get('content-encoding')
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.body || contentEncoding || !COMPRESSIBLE(contentType)) return res
    if (res.status === 204 || res.status === 304) return res

    // 协商：br 优先 → gzip 兜底 → 无则 identity
    const accept = req.headers.get('accept-encoding') ?? ''
    let encoding: 'br' | 'gzip' | null = null
    if (/\bbr\b/.test(accept)) encoding = 'br'
    else if (/\bgzip\b/.test(accept)) encoding = 'gzip'
    if (!encoding) return res

    // 阈值：Content-Length 可判定时跳过小响应；未知长度（流式）按需压缩
    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > 0 && contentLength < threshold) return res

    // 流式压缩：web stream → node readable → zlib transform → web stream
    const nodeStream = Readable.fromWeb(res.body as never)
    const zlibStream =
      encoding === 'br'
        ? createBrotliCompress(level !== undefined ? { params: {} } : undefined)
        : createGzip(level !== undefined ? { level } : undefined)
    const compressed = Readable.toWeb(nodeStream.pipe(zlibStream as Transform) as never) as ReadableStream

    const headers = new Headers(res.headers)
    headers.delete('content-length') // 压缩后长度未知——chunked
    headers.set('content-encoding', encoding)
    // Vary: Accept-Encoding（已有则追加——缓存层正确性）
    const vary = headers.get('vary')
    if (vary) {
      if (!/\baccept-encoding\b/i.test(vary)) headers.set('vary', `${vary}, Accept-Encoding`)
    } else {
      headers.set('vary', 'Accept-Encoding')
    }

    return new Response(compressed, { status: res.status, statusText: res.statusText, headers })
  }
}
