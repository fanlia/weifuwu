import { writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Middleware } from './types.ts'

export interface UploadedFile {
  name: string
  type: string
  size: number
  path?: string
  buffer?: Buffer
}

export interface UploadOptions {
  dir?: string
  maxFileSize?: number
  allowedTypes?: string[]
}

export function upload(options?: UploadOptions): Middleware {
  const saveDir = options?.dir

  return async (req, ctx, next) => {
    const ct = req.headers.get('content-type') ?? ''
    if (!ct.includes('multipart/form-data')) {
      return next(req, ctx)
    }

    const match = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    if (!match) {
      return Response.json({ error: 'Missing boundary' }, { status: 400 })
    }

    const boundary = match[1] ?? match[2]!
    const body = await req.text()
    const rawParts = body.split(`--${boundary}`).filter((p) => p && !p.startsWith('--') && !p.startsWith('\r\n--'))

    const files: Record<string, UploadedFile | UploadedFile[]> = {}
    const fields: Record<string, string> = {}

    for (const raw of rawParts) {
      const trimmed = raw.replace(/^\r?\n/, '')
      const lines = trimmed.split(/\r?\n/)
      let i = 0
      const headers: Record<string, string> = {}
      while (i < lines.length && lines[i]!.length > 0) {
        const sep = lines[i]!.indexOf(': ')
        if (sep !== -1) headers[lines[i]!.slice(0, sep).toLowerCase()] = lines[i]!.slice(sep + 2)
        i++
      }
      i++
      const bodyValue = lines.slice(i).join('\r\n')

      const disposition = headers['content-disposition'] ?? ''
      const nameMatch = disposition.match(/name="([^"]*)"/)
      if (!nameMatch) continue
      const name = nameMatch[1]!
      const filenameMatch = disposition.match(/filename="([^"]*)"/)
      const filename = filenameMatch?.[1]

      if (filename) {
        const buf = Buffer.from(bodyValue.replace(/\r?\n$/, ''), 'binary')
        if (options?.allowedTypes) {
          const mime = headers['content-type'] ?? 'application/octet-stream'
          if (!options.allowedTypes.includes(mime)) {
            return Response.json({ error: `File type not allowed: ${mime}` }, { status: 415 })
          }
        }
        if (options?.maxFileSize && buf.byteLength > options.maxFileSize) {
          return Response.json({ error: `File too large: ${filename}` }, { status: 413 })
        }

        const uf: UploadedFile = {
          name: filename,
          type: headers['content-type'] ?? 'application/octet-stream',
          size: buf.byteLength,
          buffer: saveDir ? undefined : buf,
        }

        if (saveDir) {
          const filePath = join(saveDir, `${randomUUID()}-${filename}`)
          await mkdir(saveDir, { recursive: true })
          await writeFile(filePath, buf)
          uf.path = filePath
        }

        if (files[name]) {
          const existing = files[name]
          files[name] = Array.isArray(existing) ? [...existing, uf] : [existing, uf]
        } else {
          files[name] = uf
        }
      } else {
        fields[name] = bodyValue.replace(/\r?\n$/, '')
      }
    }

    ctx.parsed = { ...ctx.parsed, files, fields }
    return next(req, ctx)
  }
}
