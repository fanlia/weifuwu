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
    if (!ct.includes('multipart/form-data')) return next(req, ctx)

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
        if (options?.allowedTypes && !options.allowedTypes.includes(value.type)) {
          return Response.json({ error: `File type not allowed: ${value.type}` }, { status: 415 })
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
          const filePath = join(saveDir, `${randomUUID()}-${value.name}`)
          await mkdir(saveDir, { recursive: true })
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
