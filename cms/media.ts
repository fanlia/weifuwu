import type { Sql } from 'postgres'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { CmsMedia } from './types.ts'
import type { Context } from '../types.ts'
import { Router } from '../router.ts'

function redirect(to: string, status = 303): Response {
  return new Response(null, { status, headers: { location: to } })
}

export interface MediaOptions {
  sql: Sql<any>
  mediaDir: string
}

export async function createMediaTable(sql: Sql<any>): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_cms_media" (
      "id" SERIAL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "original_name" TEXT NOT NULL,
      "mimetype" TEXT NOT NULL DEFAULT 'application/octet-stream',
      "size" INTEGER NOT NULL DEFAULT 0,
      "width" INTEGER DEFAULT NULL,
      "height" INTEGER DEFAULT NULL,
      "alt" TEXT DEFAULT '',
      "created_by" INTEGER DEFAULT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function saveMedia(
  sql: Sql<any>,
  file: { name: string; data: Buffer; mimetype: string },
  mediaDir: string,
  userId?: number,
): Promise<CmsMedia> {
  const ext = extname(file.name) || ''
  const filename = `${randomUUID()}${ext}`
  const dir = mediaDir

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const filepath = join(dir, filename)
  await writeFile(filepath, file.data)

  const rows = await sql`
    INSERT INTO "_cms_media" ("filename", "original_name", "mimetype", "size", "created_by")
    VALUES (${filename}, ${file.name}, ${file.mimetype}, ${file.data.length}, ${userId ?? null})
    RETURNING *
  ` as any[]

  return mapMedia(rows[0])
}

export async function listMedia(sql: Sql<any>): Promise<CmsMedia[]> {
  const rows = await sql`SELECT * FROM "_cms_media" ORDER BY "created_at" DESC` as any[]
  return rows.map(mapMedia)
}

export async function getMedia(sql: Sql<any>, id: number): Promise<CmsMedia | null> {
  const rows = await sql`SELECT * FROM "_cms_media" WHERE "id" = ${id}` as any[]
  return rows[0] ? mapMedia(rows[0]) : null
}

export async function deleteMedia(sql: Sql<any>, id: number, mediaDir: string): Promise<void> {
  const media = await getMedia(sql, id)
  if (media) {
    try {
      const { unlink } = await import('node:fs/promises')
      await unlink(join(mediaDir, media.filename))
    } catch {
      // file may not exist
    }
  }
  await sql`DELETE FROM "_cms_media" WHERE "id" = ${id}`
}

function mapMedia(row: any): CmsMedia {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    mimetype: row.mimetype,
    size: row.size,
    width: row.width ?? null,
    height: row.height ?? null,
    alt: row.alt ?? '',
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}

export function registerMediaRoutes(router: Router, sql: Sql<any>, mediaDir: string): void {
  // Media library page
  router.get('/admin/media', async (req: Request, ctx: Context) => {
    const media = await listMedia(sql)
    const base = (ctx.mountPath || '').replace(/\/+$/, '')
    const msg = ctx.query?.message as string
    const err = ctx.query?.error as string

    let content = `<div class="flex justify-between items-center mb-2">
      <h1>Media Library</h1>
    </div>
    ${msg ? `<div class="alert alert-success">${esc(msg)}</div>` : ''}
    ${err ? `<div class="alert alert-error">${esc(err)}</div>` : ''}`

    if (media.length === 0) {
      content += `<div class="card empty"><p>No media uploaded yet.</p></div>`
    } else {
      content += `<div class="media-grid">`
      for (const m of media) {
        const isImage = m.mimetype.startsWith('image/')
        const fileUrl = `${base}/admin/media/${m.id}/file`
        content += `<div class="media-item">
          ${isImage ? `<img src="${esc(fileUrl)}" alt="${esc(m.alt || m.originalName)}" loading="lazy">` : `<div style="height:140px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-size:2rem;color:var(--text-muted)">📄</div>`}
          <div class="meta">
            <div class="name">${esc(m.originalName)}</div>
            <div class="info">${formatSize(m.size)}</div>
            <form method="POST" action="${base}/admin/media/${m.id}/delete" onsubmit="return confirm('Delete this file?')" style="margin-top:.25rem">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        </div>`
      }
      content += `</div>`
    }

    content += `<div class="card" style="margin-top:1rem">
      <h2>Upload File</h2>
      <form method="POST" action="${base}/admin/media/upload" enctype="multipart/form-data">
        <div class="form-group">
          <input type="file" name="file" required>
        </div>
        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>`

    const html = adminPageContent('Media Library', content, ctx, '/admin/media')
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  })

  // Media upload
  router.post('/admin/media/upload', async (req: Request, ctx: Context) => {
    try {
      const fd = await req.formData()
      const file = fd.get('file') as File | null
      if (!file) throw new Error('No file provided')

      const buf = Buffer.from(await file.arrayBuffer())
      await saveMedia(sql, { name: file.name, data: buf, mimetype: file.type }, mediaDir)

      const base = (ctx.mountPath || '').replace(/\/+$/, '')
      return redirect(`${base}/admin/media?message=File uploaded`, 303)
    } catch (err: any) {
      const base = (ctx.mountPath || '').replace(/\/+$/, '')
      return redirect(`${base}/admin/media?error=${encodeURIComponent(err.message)}`, 303)
    }
  })

  // Media delete
  router.post('/admin/media/:id/delete', async (req: Request, ctx: Context) => {
    try {
      const id = parseInt(ctx.params.id, 10)
      await deleteMedia(sql, id, mediaDir)
      const base = (ctx.mountPath || '').replace(/\/+$/, '')
      return redirect(`${base}/admin/media?message=File deleted`, 303)
    } catch (err: any) {
      const base = (ctx.mountPath || '').replace(/\/+$/, '')
      return redirect(`${base}/admin/media?error=${encodeURIComponent(err.message)}`, 303)
    }
  })

  // Media file serving
  router.get('/admin/media/:id/file', async (req: Request, ctx: Context) => {
    try {
      const id = parseInt(ctx.params.id, 10)
      const media = await getMedia(sql, id)
      if (!media) {
        return new Response('Not found', { status: 404 })
      }

      const { readFile } = await import('node:fs/promises')
      const filepath = join(mediaDir, media.filename)
      const data = await readFile(filepath)

      return new Response(data, {
        headers: {
          'content-type': media.mimetype,
          'content-length': String(media.size),
          'cache-control': 'public, max-age=31536000',
        },
      })
    } catch (err: any) {
      return new Response('Not found', { status: 404 })
    }
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function adminPageContent(title: string, content: string, ctx: Context, activeNav?: string): string {
  const base = (ctx.mountPath || '').replace(/\/+$/, '')

  const ADMIN_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f5f6fa;--card:#fff;--text:#1a1a2e;--text-muted:#6b7280;--primary:#4f46e5;--primary-hover:#4338ca;--danger:#ef4444;--danger-hover:#dc2626;--success:#10b981;--border:#e5e7eb;--radius:8px;--shadow:0 1px 3px rgba(0,0,0,.08)}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;display:flex}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
h1{font-size:1.5rem;font-weight:700;margin-bottom:1rem}
h2{font-size:1.2rem;font-weight:600;margin-bottom:.75rem}
.sidebar{width:240px;background:var(--card);border-right:1px solid var(--border);padding:1.5rem;position:sticky;top:0;height:100vh;overflow-y:auto;flex-shrink:0}
.sidebar h2{font-size:1rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:1rem}
.sidebar nav{display:flex;flex-direction:column;gap:.25rem}
.sidebar a{display:block;padding:.5rem .75rem;border-radius:6px;color:var(--text);font-size:.9rem;transition:background .15s}
.sidebar a:hover{background:#f0f0ff;text-decoration:none}
.sidebar a.active{background:#eef2ff;color:var(--primary);font-weight:600}
.sidebar .section{margin-top:1.5rem}
.main{flex:1;padding:2rem;max-width:1200px}
.card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:1.5rem;margin-bottom:1.5rem}
.btn{display:inline-block;padding:.5rem 1rem;border-radius:6px;font-size:.875rem;font-weight:500;border:none;cursor:pointer;transition:all .15s;text-decoration:none;line-height:1.4}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover);text-decoration:none}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:var(--danger-hover);text-decoration:none}
.form-group{margin-bottom:1rem}
.form-group label{display:block;font-size:.875rem;font-weight:500;margin-bottom:.25rem}
input[type=file]{padding:.5rem 0}
.alert{padding:.75rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:.9rem}
.alert-success{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
.alert-error{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.empty{text-align:center;padding:3rem 1rem;color:var(--text-muted)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem}
.media-item{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.media-item img{width:100%;height:140px;object-fit:cover;display:block}
.media-item .meta{padding:.5rem;font-size:.8rem}
.media-item .meta .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.media-item .meta .info{color:var(--text-muted);font-size:.75rem}
`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — CMS</title>
<style>${ADMIN_CSS}</style>
</head>
<body>
<div class="sidebar">
  <h2>📦 CMS</h2>
  <nav>
    <a href="${base}/admin" class="${!activeNav || activeNav === '' ? 'active' : ''}"> Dashboard</a>
  </nav>
  <nav class="section">
    <a href="${base}/admin/content-types" class="${activeNav?.startsWith('/admin/content-types') ? 'active' : ''}"> Content Types</a>
    <a href="${base}/admin/media" class="active"> Media Library</a>
  </nav>
</div>
<div class="main">${content}</div>
</body>
</html>`
}
