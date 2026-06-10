import { open, realpath, type FileHandle } from 'node:fs/promises'
import { extname, resolve, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Handler } from './types.ts'

export interface ServeStaticOptions {
  index?: string
  maxAge?: number
  immutable?: boolean
}

export function serveStatic(root: string, options?: ServeStaticOptions): Handler {
  const rootDir = resolve(root)

  const opts = options ?? {}

  return async (req, ctx) => {
    const relativePath = ctx.params['*'] ?? new URL(req.url).pathname.slice(1)
    const decoded = decodeURIComponent(relativePath)

    if (decoded.includes('..') || decoded.includes('\0')) {
      return new Response('Forbidden', { status: 403 })
    }

    let filePath = normalize(resolve(rootDir, decoded))
    if (!filePath.startsWith(rootDir + sep) && filePath !== rootDir) {
      return new Response('Forbidden', { status: 403 })
    }

    let fileHandle: FileHandle | undefined
    try {
      fileHandle = await open(filePath, 'r')
      let stat = await fileHandle.stat()

      // Resolve symlinks and verify within root
      const realPath = await realpath(filePath)
      if (!realPath.startsWith(rootDir + sep) && realPath !== rootDir) {
        await fileHandle.close()
        return new Response('Forbidden', { status: 403 })
      }

      if (stat.isDirectory()) {
        await fileHandle.close()
        const indexFile = opts.index ?? 'index.html'
        filePath = resolve(filePath, indexFile)
        if (!filePath.startsWith(rootDir + sep)) {
          return new Response('Forbidden', { status: 403 })
        }
        fileHandle = await open(filePath, 'r')
        stat = await fileHandle.stat()
        if (!stat.isFile()) {
          await fileHandle.close()
          return new Response('Not Found', { status: 404 })
        }
      }

      const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

      const etag = `"${stat.ino}-${stat.size}-${stat.mtimeMs}"`
      const ifNoneMatch = req.headers.get('if-none-match')
      if (ifNoneMatch === etag) {
        await fileHandle.close()
        return new Response(null, { status: 304 })
      }

      const ifModifiedSince = req.headers.get('if-modified-since')
      if (ifModifiedSince && stat.mtimeMs <= new Date(ifModifiedSince).getTime()) {
        await fileHandle.close()
        return new Response(null, { status: 304 })
      }

      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': String(stat.size),
        'ETag': etag,
        'Last-Modified': stat.mtime.toUTCString(),
        'Cache-Control': opts.immutable
          ? `public, max-age=${opts.maxAge ?? 31536000}, immutable`
          : `public, max-age=${opts.maxAge ?? 0}`,
      }

      const readStream = fileHandle!.createReadStream()
      const cleanup = () => fileHandle!.close().catch(() => {})
      readStream.on('close', cleanup)
      readStream.on('error', cleanup)
      const webStream = Readable.toWeb(readStream)
      return new Response(webStream as any, { headers })
    } catch (err) {
      if (fileHandle) await fileHandle.close().catch(() => {})
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return new Response('Not Found', { status: 404 })
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
