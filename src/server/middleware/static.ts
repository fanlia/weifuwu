import { open, stat, realpath, type FileHandle } from 'node:fs/promises'
import { extname, resolve, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Middleware } from '../types.ts'

/** Options for {@link serveStatic}. */
export interface ServeStaticOptions {
  /** Directory index filename (default: `'index.html'`). */
  index?: string
  /** `Cache-Control max-age` in seconds. */
  maxAge?: number
  /** Add `immutable` to `Cache-Control` (requires `maxAge`). */
  immutable?: boolean
}

/**
 * Static file serving handler.
 *
 * Serves files from a root directory. Supports ETag/304, directory index,
 * Content-Type detection by extension, and directory traversal protection.
 *
 * ```ts
 * import { serveStatic, Router } from 'weifuwu'
 * const app = new Router()
 *
 * // 作为全局中间件（推荐）：未匹配到文件时自动 404
 * app.use(serveStatic('./public'))
 *
 * // 或挂载到特定路径前缀：
 * app.get('/assets/*', serveStatic('./public'))
 * ```
 */
export function serveStatic(root: string, options?: ServeStaticOptions): Middleware {
  const rootDir = resolve(root)

  const opts = options ?? {}

  return async (req, ctx, next) => {
    const relativePath = ctx.params['*'] ?? new URL(req.url).pathname.slice(1)
    const decoded = decodeURIComponent(relativePath)

    if (decoded.includes('..') || decoded.includes('\0')) {
      return new Response('Forbidden', { status: 403 })
    }

    let filePath = normalize(resolve(rootDir, decoded))
    if (!filePath.startsWith(rootDir + sep) && filePath !== rootDir) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      // S8：stat 先行——决定目录 index / 预压缩选择后再打开目标文件
      let statInfo = await stat(filePath)

      if (statInfo.isDirectory()) {
        const indexFile = opts.index ?? 'index.html'
        filePath = resolve(filePath, indexFile)
        if (!filePath.startsWith(rootDir + sep)) {
          return new Response('Forbidden', { status: 403 })
        }
        statInfo = await stat(filePath)
        if (!statInfo.isFile()) {
          return new Response('Not Found', { status: 404 })
        }
      }

      // Resolve symlinks and verify within root
      const realPath = await realpath(filePath)
      if (!realPath.startsWith(rootDir + sep) && realPath !== rootDir) {
        return new Response('Forbidden', { status: 403 })
      }

      const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

      // S8 预压缩探测：.br 优先 → .gz；预压缩产物 mtime ≥ 原文件（防陈旧内容）。
      // Content-Type 保留原文件类型（浏览器解压后按类型渲染）。
      const acceptEncoding = req.headers.get('accept-encoding') ?? ''
      let servePath = filePath
      let serveStat = statInfo
      let contentEncoding: string | null = null
      if (/\bbr\b/.test(acceptEncoding)) {
        try {
          const st = await stat(filePath + '.br')
          if (st.mtimeMs >= statInfo.mtimeMs) { servePath = filePath + '.br'; serveStat = st; contentEncoding = 'br' }
        } catch { /* 无 .br——用原文件 */ }
      } else if (/\bgzip\b/.test(acceptEncoding)) {
        try {
          const st = await stat(filePath + '.gz')
          if (st.mtimeMs >= statInfo.mtimeMs) { servePath = filePath + '.gz'; serveStat = st; contentEncoding = 'gzip' }
        } catch { /* 无 .gz——用原文件 */ }
      }

      let fileHandle: FileHandle | undefined
      fileHandle = await open(servePath, 'r')

      const etag = `"${serveStat.ino}-${serveStat.size}-${serveStat.mtimeMs}"`
      const ifNoneMatch = req.headers.get('if-none-match')
      if (ifNoneMatch === etag) {
        await fileHandle.close()
        return new Response(null, { status: 304 })
      }

      const ifModifiedSince = req.headers.get('if-modified-since')
      if (ifModifiedSince && serveStat.mtimeMs <= new Date(ifModifiedSince).getTime()) {
        await fileHandle.close()
        return new Response(null, { status: 304 })
      }

      // S8 Range：单区间（多区间诚实裁剪——无场景证据）；越界 → 416
      let start = 0
      let end = serveStat.size - 1
      let is206 = false
      const rangeHeader = req.headers.get('range')
      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
        if (m && (m[1] !== '' || m[2] !== '')) {
          if (m[1] === '') {
            // 后缀形式 bytes=-N：末 N 字节
            const n = Math.min(Number(m[2]), serveStat.size)
            start = serveStat.size - n
            end = serveStat.size - 1
          } else {
            start = Number(m[1])
            end = m[2] !== '' ? Math.min(Number(m[2]), serveStat.size - 1) : serveStat.size - 1
          }
          if (start > end || start >= serveStat.size) {
            await fileHandle.close()
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${serveStat.size}` },
            })
          }
          is206 = true
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': String(end - start + 1),
        ETag: etag,
        'Last-Modified': serveStat.mtime.toUTCString(),
        'Cache-Control': opts.immutable
          ? `public, max-age=${opts.maxAge ?? 31536000}, immutable`
          : `public, max-age=${opts.maxAge ?? 0}`,
        'Accept-Ranges': 'bytes',
      }
      if (contentEncoding) headers['Content-Encoding'] = contentEncoding
      if (is206) headers['Content-Range'] = `bytes ${start}-${end}/${serveStat.size}`

      const readStream = fileHandle.createReadStream({ start, end })
      const cleanup = () => fileHandle!.close().catch(() => {})
      readStream.on('close', cleanup)
      readStream.on('error', cleanup)
      const webStream = Readable.toWeb(readStream)
      return new Response(webStream as unknown as ReadableStream, {
        status: is206 ? 206 : 200,
        headers,
      })
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        // 作为中间件使用时（app.use），404 交给下一个中间件
        // 作为 handler 使用时（app.get），next 不存在，返回 404
        return next ? next(req, ctx) : new Response('Not Found', { status: 404 })
      }
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.ts': 'application/x-typescript',
  '.tsx': 'application/x-typescript',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.csv': 'text/csv; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}
