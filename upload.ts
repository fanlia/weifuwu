import { writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, extname } from 'node:path'
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

const extensionMimeMap: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'application/x-typescript',
  '.tsx': 'application/x-typescript',
}

function detectMimeFromExtension(filename: string): string | undefined {
  return extensionMimeMap[extname(filename).toLowerCase()]
}

export function upload(options?: UploadOptions): Middleware {
  const saveDir = options?.dir

  return async (req, ctx, next) => {
    const ct = req.headers.get('content-type') ?? ''
    if (!ct.includes('multipart/form-data')) return next(req, ctx)
    try {
      if (saveDir) await mkdir(saveDir, { recursive: true })
    } catch (e) {
      console.error('upload: failed to create directory', saveDir, e)
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return Response.json({ error: 'Invalid multipart data' }, { status: 400 })
    }

    const files: Record<string, UploadedFile | UploadedFile[]> = {}
    const fields: Record<string, string> = {}

    for (const [key, value] of formData) {
      if (value instanceof File) {
        // Validate: check client-declared type AND extension-based type
        if (options?.allowedTypes) {
          const clientOk = options.allowedTypes.includes(value.type)
          const extType = detectMimeFromExtension(value.name)
          const extOk = extType ? options.allowedTypes.includes(extType) : false
          if (!clientOk && !extOk) {
            return Response.json({ error: `File type not allowed: ${value.type}` }, { status: 415 })
          }
        }
        if (options?.maxFileSize && value.size > options.maxFileSize) {
          return Response.json({ error: `File too large: ${value.name}` }, { status: 413 })
        }

        const buf = Buffer.from(await value.arrayBuffer())

        const uf: UploadedFile = {
          name: value.name,
          type: value.type,
          size: buf.byteLength,
          buffer: saveDir ? undefined : buf,
        }

        if (saveDir) {
          const safeName = value.name.replace(/[/\\\0]/g, '_').replace(/\.\./g, '_')
          const filePath = join(saveDir, `${randomUUID()}-${safeName}`)
          await writeFile(filePath, buf)
          uf.path = filePath
        }

        if (files[key]) {
          const existing = files[key]
          files[key] = Array.isArray(existing) ? [...existing, uf] : [existing, uf]
        } else {
          files[key] = uf
        }
      } else {
        fields[key] = value
      }
    }

    ctx.parsed = { ...ctx.parsed, files, fields }
    return next(req, ctx)
  }
}
