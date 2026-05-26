import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import type { Middleware } from './types.ts'

export interface CompressOptions {
  level?: number
  threshold?: number
}

export function compress(options?: CompressOptions): Middleware {
  const level = options?.level ?? 6
  const threshold = options?.threshold ?? 1024

  return async (req, ctx, next) => {
    const accept = req.headers.get('accept-encoding') ?? ''

    const useBrotli = accept.includes('br')
    const useGzip = !useBrotli && accept.includes('gzip')
    const useDeflate = !useBrotli && !useGzip && accept.includes('deflate')

    if (!useBrotli && !useGzip && !useDeflate) {
      return next(req, ctx)
    }

    const res = await next(req, ctx)

    if (res.status === 304 || res.status === 204 || res.status < 200 || res.status >= 300) {
      return res
    }

    const ce = res.headers.get('content-encoding')
    if (ce) return res

    const ct = res.headers.get('content-type') ?? ''
    if (!ct || ct.startsWith('audio/') || ct.startsWith('video/') || ct.startsWith('image/') || ct === 'application/zip') {
      return res
    }

    const body = await res.bytes()
    if (body.byteLength < threshold) return res

    let compressed: Buffer
    let encoding: string

    if (useBrotli) {
      compressed = brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: Math.min(level, 11) },
      })
      encoding = 'br'
    } else if (useGzip) {
      compressed = gzipSync(body, { level: Math.min(level, 9) })
      encoding = 'gzip'
    } else {
      compressed = gzipSync(body, { level: Math.min(level, 9) })
      encoding = 'deflate'
    }

    const headers = new Headers(res.headers)
    headers.set('Content-Encoding', encoding)
    headers.set('Content-Length', String(compressed.byteLength))
    headers.delete('Content-Range')
    headers.set('Vary', 'Accept-Encoding')

    return new Response(compressed, {
      status: res.status,
      statusText: res.statusText,
      headers,
    })
  }
}
