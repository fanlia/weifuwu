import { createGzip, createBrotliCompress, createDeflate, constants, brotliCompress, gzip, deflate } from 'node:zlib'
import { promisify } from 'node:util'
import type { Middleware } from './types.ts'

const brotliCompressAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
const deflateAsync = promisify(deflate)

export interface CompressOptions {
  level?: number
  threshold?: number
}

export function compress(options?: CompressOptions): Middleware {
  const level = options?.level ?? 6
  const threshold = options?.threshold ?? 1024

  return async (req, ctx, next) => {
    const accept = req.headers.get('accept-encoding') ?? ''

    const encoding = accept.includes('br') ? 'br'
      : accept.includes('gzip') ? 'gzip'
      : accept.includes('deflate') ? 'deflate'
      : ''

    if (!encoding) return next(req, ctx)

    const res = await next(req, ctx)

    if (res.status === 304 || res.status === 204 || res.status === 206 || res.status < 200 || res.status >= 300) {
      return res
    }

    if (res.headers.get('content-encoding')) return res

    const ct = res.headers.get('content-type') ?? ''
    if (!ct || ct.startsWith('audio/') || ct.startsWith('video/') || ct.startsWith('image/') || ct === 'application/zip') {
      return res
    }

    if (!res.body) return res

    const body = await res.bytes()
    if (body.byteLength < threshold) return res

    let compressed: Buffer
    try {
      if (encoding === 'br') {
        compressed = await brotliCompressAsync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: Math.min(level, 11) } })
      } else if (encoding === 'gzip') {
        compressed = await gzipAsync(body, { level: Math.min(level, 9) })
      } else {
        compressed = await deflateAsync(body, { level: Math.min(level, 9) })
      }
    } catch {
      return res
    }

    const headers = new Headers(res.headers)
    headers.set('Content-Encoding', encoding)
    headers.set('Content-Length', String(compressed.byteLength))
    headers.delete('Content-Range')
    const existingVary = headers.get('Vary')
    headers.set('Vary', existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding')

    return new Response(compressed as BodyInit, {
      status: res.status,
      statusText: res.statusText,
      headers,
    })
  }
}
