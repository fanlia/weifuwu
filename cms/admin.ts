import type { Sql } from 'postgres'
import type { Context } from '../types.ts'
import type { ContentType, ContentEntry, CmsFieldDef, EntryStatus } from './types.ts'
import {
  listContentTypes, getContentType, createContentType, updateContentType, deleteContentType,
  listEntries, getEntry, createEntry, updateEntry, publishEntry, archiveEntry, deleteEntry,
  searchEntries, listVersions, getVersion, createVersion,
} from './content.ts'
import { Router } from '../router.ts'

function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function h(s: unknown): string {
  return esc(s)
}

function redirect(to: string, status = 303): Response {
  return new Response(null, { status, headers: { location: to } })
}

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
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem}
.stat-card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:1.25rem;text-align:center}
.stat-card .num{font-size:2rem;font-weight:700;color:var(--primary)}
.stat-card .label{font-size:.85rem;color:var(--text-muted);margin-top:.25rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{padding:.75rem;text-align:left;border-bottom:1px solid var(--border)}
th{font-weight:600;color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
tr:hover td{background:#f9fafb}
.badge{display:inline-block;padding:.15rem .5rem;border-radius:999px;font-size:.75rem;font-weight:500}
.badge-draft{background:#fef3c7;color:#92400e}
.badge-published{background:#d1fae5;color:#065f46}
.badge-archived{background:#f3f4f6;color:#374151}
.btn{display:inline-block;padding:.5rem 1rem;border-radius:6px;font-size:.875rem;font-weight:500;border:none;cursor:pointer;transition:all .15s;text-decoration:none;line-height:1.4}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover);text-decoration:none}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:var(--danger-hover);text-decoration:none}
.btn-success{background:var(--success);color:#fff}
.btn-success:hover{opacity:.9;text-decoration:none}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-outline:hover{background:var(--bg);text-decoration:none}
.btn-sm{padding:.3rem .6rem;font-size:.8rem}
.btn-group{display:flex;gap:.5rem;flex-wrap:wrap}
.mb-1{margin-bottom:.5rem}
.mb-2{margin-bottom:1rem}
.mt-2{margin-top:1rem}
.flex{display:flex}
.justify-between{justify-content:space-between}
.items-center{align-items:center}
.gap-2{gap:.5rem}
.form-group{margin-bottom:1rem}
.form-group label{display:block;font-size:.875rem;font-weight:500;margin-bottom:.25rem;color:var(--text)}
.form-group .help{font-size:.8rem;color:var(--text-muted);margin-top:.25rem}
input[type=text],input[type=number],input[type=url],input[type=datetime-local],select,textarea{width:100%;padding:.5rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.9rem;font-family:inherit;transition:border-color .15s}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(79,70,229,.1)}
textarea.code{font-family:'SF Mono','Fira Code',monospace;font-size:.85rem}
input[type=checkbox]{margin-right:.5rem}
.alert{padding:.75rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:.9rem}
.alert-success{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
.alert-error{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.empty{text-align:center;padding:3rem 1rem;color:var(--text-muted)}
.empty p{font-size:1rem;margin-bottom:1rem}
.pagination{display:flex;gap:.5rem;justify-content:center;margin-top:1rem}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem}
.media-item{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;transition:box-shadow .15s}
.media-item:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.media-item img{width:100%;height:140px;object-fit:cover;display:block}
.media-item .meta{padding:.5rem;font-size:.8rem}
.media-item .meta .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.media-item .meta .info{color:var(--text-muted);font-size:.75rem}
.field-row{display:flex;gap:.75rem;align-items:center;margin-bottom:.5rem;padding:.5rem;background:var(--bg);border-radius:6px}
.field-row input[type=text]{flex:1}
.field-row select{width:160px;flex:none}
`

function flashMessage(ctx: Context): string {
  const msg = ctx.query?.message as string
  const err = ctx.query?.error as string
  if (msg) return `<div class="alert alert-success">${h(msg)}</div>`
  if (err) return `<div class="alert alert-error">${h(err)}</div>`
  return ''
}

function adminLayout(title: string, content: string, ctx: Context, activeNav?: string): string {
  const base = (ctx.mountPath || '').replace(/\/+$/, '')

  function navItem(href: string, label: string, icon: string, match?: string) {
    const active = activeNav && match && activeNav.startsWith(match)
    return `<a href="${base}${href}" class="${active ? 'active' : ''}">${icon} ${label}</a>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} — CMS</title>
<style>${ADMIN_CSS}</style>
</head>
<body>
<div class="sidebar">
  <h2>📦 CMS</h2>
  <nav>
    ${navItem('/admin', 'Dashboard', '', '')}
  </nav>
  <nav class="section">
    ${navItem('/admin/content-types', 'Content Types', '', '/admin/content-types')}
    ${navItem('/admin/media', 'Media Library', '', '/admin/media')}
  </nav>
</div>
<div class="main">
  ${flashMessage(ctx)}
  ${content}
</div>
</body>
</html>`
}

async function renderDashboard(sql: Sql<any>, ctx: Context): Promise<string> {
  const types = await listContentTypes(sql)
  const totalTypes = types.length

  let totalEntries = 0
  let publishedEntries = 0
  for (const t of types) {
    const all = await listEntries(sql, t.slug)
    totalEntries += all.length
    publishedEntries += all.filter(e => e.status === 'published').length
  }

  const recentEntries: ContentEntry[] = []
  for (const t of types) {
    const entries = await listEntries(sql, t.slug)
    recentEntries.push(...entries.slice(0, 5))
  }
  recentEntries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const recent = recentEntries.slice(0, 10)

  const stats = `
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${totalTypes}</div><div class="label">Content Types</div></div>
      <div class="stat-card"><div class="num">${totalEntries}</div><div class="label">Total Entries</div></div>
      <div class="stat-card"><div class="num">${publishedEntries}</div><div class="label">Published</div></div>
    </div>
  `

  let content = `<h1>Dashboard</h1>${stats}`

  if (types.length === 0) {
    content += `
      <div class="card empty">
        <p>No content types yet.</p>
        <a href="${baseHref(ctx)}/admin/content-types/new" class="btn btn-primary">Create your first Content Type</a>
      </div>
    `
    return adminLayout('Dashboard', content, ctx, '')
  }

  content += `<div class="card"><h2>Recent Entries</h2>`
  if (recent.length === 0) {
    content += `<div class="empty"><p>No entries yet.</p></div>`
  } else {
    content += `<table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody>`
    for (const e of recent) {
      const ct = types.find(t => t.slug === e.contentType)
      content += `<tr><td><a href="${baseHref(ctx)}/admin/content/${e.contentType}/${e.id}/edit">${h(e.title)}</a></td><td>${h(ct?.label || e.contentType)}</td><td>${statusBadge(e.status)}</td><td>${formatDate(e.updatedAt)}</td></tr>`
    }
    content += `</tbody></table>`
  }
  content += `</div>`

  content += `<div class="card"><h2>Quick Actions</h2>
    <div class="btn-group">
      <a href="${baseHref(ctx)}/admin/content-types/new" class="btn btn-primary">New Content Type</a>
      ${types.map(t => `<a href="${baseHref(ctx)}/admin/content/${t.slug}/new" class="btn btn-outline">New ${h(t.label)}</a>`).join('')}
    </div>
  </div>`

  return adminLayout('Dashboard', content, ctx, '')
}

function baseHref(ctx: Context): string {
  return (ctx.mountPath || '').replace(/\/+$/, '')
}

function statusBadge(status: EntryStatus): string {
  const cls = status === 'published' ? 'badge-published' : status === 'draft' ? 'badge-draft' : 'badge-archived'
  return `<span class="badge ${cls}">${status}</span>`
}

function formatDate(d: string): string {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function renderContentTypeList(sql: Sql<any>, ctx: Context): Promise<string> {
  const types = await listContentTypes(sql)

  let content = `<div class="flex justify-between items-center mb-2">
    <h1>Content Types</h1>
    <a href="${baseHref(ctx)}/admin/content-types/new" class="btn btn-primary">+ New Type</a>
  </div>`

  if (types.length === 0) {
    content += `<div class="card empty"><p>No content types defined.</p></div>`
  } else {
    content += `<div class="card"><table><thead><tr><th>Label</th><th>Slug</th><th>Fields</th><th>Entries</th><th>Created</th><th></th></tr></thead><tbody>`
    for (const t of types) {
      const entries = await listEntries(sql, t.slug)
      content += `<tr>
        <td><a href="${baseHref(ctx)}/admin/content/${t.slug}"><strong>${h(t.label)}</strong></a></td>
        <td><code>${h(t.slug)}</code></td>
        <td>${t.fields.length}</td>
        <td>${entries.length}</td>
        <td>${formatDate(t.createdAt)}</td>
        <td>
          <div class="btn-group">
            <a href="${baseHref(ctx)}/admin/content-types/${t.slug}/edit" class="btn btn-outline btn-sm">Edit</a>
            <a href="${baseHref(ctx)}/admin/content/${t.slug}" class="btn btn-outline btn-sm">Entries</a>
            <form method="POST" action="${baseHref(ctx)}/admin/content-types/${t.slug}/delete" onsubmit="return confirm('Delete this content type and all its entries?')">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        </td>
      </tr>`
    }
    content += `</tbody></table></div>`
  }

  return adminLayout('Content Types', content, ctx, '/admin/content-types')
}

function renderContentTypeForm(ctx: Context, existing?: ContentType): string {
  const base = baseHref(ctx)
  const isEdit = !!existing
  const action = isEdit ? `${base}/admin/content-types/${existing!.slug}` : `${base}/admin/content-types`
  const title = isEdit ? `Edit ${existing!.label}` : 'New Content Type'

  const ct = existing || { slug: '', label: '', description: '', fields: [] as CmsFieldDef[], config: {} }
  const fieldsJson = JSON.stringify(ct.fields, null, 2)
  const configJson = JSON.stringify(ct.config || {}, null, 2)

  let content = `<h1>${title}</h1>
  <div class="card">
    <form method="POST" action="${action}">
      <div class="form-group">
        <label for="slug">Slug</label>
        <input type="text" id="slug" name="slug" value="${h(ct.slug)}" required${isEdit ? ' readonly style="background:#f3f4f6"' : ''} placeholder="e.g., post, page, product">
        <div class="help">Unique identifier used in URLs and API</div>
      </div>
      <div class="form-group">
        <label for="label">Label</label>
        <input type="text" id="label" name="label" value="${h(ct.label)}" required placeholder="e.g., Post, Page, Product">
      </div>
      <div class="form-group">
        <label for="description">Description</label>
        <textarea id="description" name="description" rows="2">${h(ct.description)}</textarea>
      </div>
      <div class="form-group">
        <label for="fields">Fields (JSON)</label>
        <textarea id="fields" name="fields" rows="12" class="code" required>${h(fieldsJson)}</textarea>
        <div class="help">Array of field definitions. <a href="#" onclick="return false" style="cursor:help">See docs</a></div>
      </div>
      <div class="form-group">
        <label for="config">Config (JSON)</label>
        <textarea id="config" name="config" rows="4" class="code">${h(configJson)}</textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
        <a href="${base}/admin/content-types" class="btn btn-outline">Cancel</a>
      </div>
    </form>
  </div>`

  return adminLayout(title, content, ctx, '/admin/content-types')
}

async function renderEntryList(sql: Sql<any>, typeSlug: string, ctx: Context): Promise<string> {
  const ct = await getContentType(sql, typeSlug)
  if (!ct) {
    return adminLayout('Not Found', `<div class="card"><p>Content type "${h(typeSlug)}" not found.</p></div>`, ctx, '/admin/content-types')
  }

  const entries = await listEntries(sql, typeSlug)
  const searchQ = ctx.query?.q as string

  let content = `<div class="flex justify-between items-center mb-2">
    <h1>${h(ct.label)} <span style="font-weight:400;font-size:.9rem;color:var(--text-muted)">(${h(ct.slug)})</span></h1>
    <a href="${baseHref(ctx)}/admin/content/${typeSlug}/new" class="btn btn-primary">+ New ${h(ct.label)}</a>
  </div>`

  if (entries.length === 0) {
    content += `<div class="card empty">
      <p>No entries yet.</p>
      <a href="${baseHref(ctx)}/admin/content/${typeSlug}/new" class="btn btn-primary">Create first entry</a>
    </div>`
  } else {
    const titleField = ct.config?.titleField || 'title'
    content += `<div class="card"><table><thead><tr><th>${h(titleField === 'title' ? 'Title' : titleField)}</th><th>Slug</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>`
    for (const e of entries) {
      const displayTitle = e.title || (e.data[titleField] as string) || `(ID: ${e.id})`
      content += `<tr>
        <td><a href="${baseHref(ctx)}/admin/content/${typeSlug}/${e.id}/edit"><strong>${h(displayTitle)}</strong></a></td>
        <td><code>${h(e.slug)}</code></td>
        <td>${statusBadge(e.status)}</td>
        <td>${formatDate(e.updatedAt)}</td>
        <td>
          <div class="btn-group">
            <a href="${baseHref(ctx)}/admin/content/${typeSlug}/${e.id}/edit" class="btn btn-outline btn-sm">Edit</a>
            ${e.status === 'draft' ? `<form method="POST" action="${baseHref(ctx)}/admin/content/${typeSlug}/${e.id}/publish"><button type="submit" class="btn btn-success btn-sm">Publish</button></form>` : ''}
            ${e.status === 'published' ? `<form method="POST" action="${baseHref(ctx)}/admin/content/${typeSlug}/${e.id}/archive"><button type="submit" class="btn btn-outline btn-sm">Archive</button></form>` : ''}
            ${e.status !== 'published' ? `<form method="POST" action="${baseHref(ctx)}/admin/content/${typeSlug}/${e.id}/delete" onsubmit="return confirm('Delete this entry?')"><button type="submit" class="btn btn-danger btn-sm">Delete</button></form>` : ''}
          </div>
        </td>
      </tr>`
    }
    content += `</tbody></table></div>`
  }

  return adminLayout(ct.label, content, ctx, '/admin/content-types')
}

async function renderEntryForm(sql: Sql<any>, typeSlug: string, ctx: Context, existing?: ContentEntry): Promise<string> {
  const ct = await getContentType(sql, typeSlug)
  if (!ct) {
    return adminLayout('Not Found', `<div class="card"><p>Content type "${h(typeSlug)}" not found.</p></div>`, ctx, '/admin/content-types')
  }

  const base = baseHref(ctx)
  const isEdit = !!existing
  const action = isEdit ? `${base}/admin/content/${typeSlug}/${existing!.id}` : `${base}/admin/content/${typeSlug}`
  const title = isEdit ? `Edit ${existing!.title || existing!.slug || `Entry #${existing!.id}`}` : `New ${ct.label}`

  const entry = existing || { slug: '', title: '', data: {} as Record<string, unknown>, status: 'draft' as EntryStatus, id: 0, locale: null, createdBy: null, updatedBy: null, publishedAt: null, createdAt: '', updatedAt: '', contentType: typeSlug }
  const data = entry.data || {}

  let content = `<div class="flex justify-between items-center mb-2">
    <h1>${h(title)}</h1>
    ${isEdit ? `<div class="btn-group">
      <span class="badge ${entry.status === 'published' ? 'badge-published' : entry.status === 'draft' ? 'badge-draft' : 'badge-archived'}" style="font-size:.9rem;padding:.3rem .75rem">${entry.status}</span>
    </div>` : ''}
  </div>`

  if (isEdit) {
    content += `<div class="btn-group mb-2">
      ${entry.status === 'draft' ? `<form method="POST" action="${base}/admin/content/${typeSlug}/${entry.id}/publish"><button type="submit" class="btn btn-success btn-sm">Publish</button></form>` : ''}
      ${entry.status === 'published' ? `<form method="POST" action="${base}/admin/content/${typeSlug}/${entry.id}/archive"><button type="submit" class="btn btn-outline btn-sm">Archive</button></form>` : ''}
      ${entry.status !== 'published' ? `<form method="POST" action="${base}/admin/content/${typeSlug}/${entry.id}/delete" onsubmit="return confirm('Delete this entry?')"><button type="submit" class="btn btn-danger btn-sm">Delete</button></form>` : ''}
      ${isEdit ? `<a href="${base}/admin/content/${typeSlug}/${entry.id}/versions" class="btn btn-outline btn-sm">Versions</a>` : ''}
    </div>`
  }

  content += `<div class="card">
    <form method="POST" action="${action}">
      <div class="form-group">
        <label for="title">${h(ct.config?.titleField || 'Title')}</label>
        <input type="text" id="title" name="title" value="${h(entry.title)}" required placeholder="Enter title">
      </div>
      <div class="form-group">
        <label for="slug">Slug</label>
        <input type="text" id="slug" name="slug" value="${h(entry.slug)}" placeholder="Auto-generated from title if empty">
      </div>`

  for (const field of ct.fields) {
    content += renderFormField(field, data[field.name], 'data')
  }

  content += `
      <div class="btn-group mt-2">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
        <a href="${base}/admin/content/${typeSlug}" class="btn btn-outline">Cancel</a>
      </div>
    </form>
  </div>`

  return adminLayout(title, content, ctx, '/admin/content-types')
}

function renderFormField(field: CmsFieldDef, value: unknown, prefix: string): string {
  const name = `${prefix}[${field.name}]`
  const val = value !== undefined && value !== null ? String(value) : ''

  let input = ''
  switch (field.type) {
    case 'string':
    case 'slug':
      input = `<input type="text" id="field-${field.name}" name="${name}" value="${h(val)}" ${field.required ? 'required' : ''} placeholder="${h(field.placeholder || '')}">`
      break
    case 'richtext':
      input = `<textarea id="field-${field.name}" name="${name}" rows="10" ${field.required ? 'required' : ''}>${h(val)}</textarea>`
      break
    case 'integer':
      input = `<input type="number" id="field-${field.name}" name="${name}" value="${h(val)}" step="1" ${field.required ? 'required' : ''}>`
      break
    case 'float':
      input = `<input type="number" id="field-${field.name}" name="${name}" value="${h(val)}" step="0.01" ${field.required ? 'required' : ''}>`
      break
    case 'boolean':
      input = `<input type="hidden" name="${name}" value="false"><input type="checkbox" id="field-${field.name}" name="${name}" value="true" ${val === 'true' ? 'checked' : ''}>`
      break
    case 'datetime':
      input = `<input type="datetime-local" id="field-${field.name}" name="${name}" value="${h(val)}" ${field.required ? 'required' : ''}>`
      break
    case 'json':
      input = `<textarea id="field-${field.name}" name="${name}" rows="8" class="code">${h(val)}</textarea>`
      break
    case 'enum': {
      const opts = (field.options || []).map(o =>
        `<option value="${h(o)}" ${o === val ? 'selected' : ''}>${h(o)}</option>`
      ).join('')
      input = `<select id="field-${field.name}" name="${name}" ${field.required ? 'required' : ''}><option value="">— Select —</option>${opts}</select>`
      break
    }
    case 'image':
      input = `<input type="text" id="field-${field.name}" name="${name}" value="${h(val)}" placeholder="Media URL or path" ${field.required ? 'required' : ''}>`
      break
    case 'gallery':
      input = `<input type="text" id="field-${field.name}" name="${name}" value="${h(val)}" placeholder="Comma-separated media URLs">`
      break
    case 'relation':
      input = `<input type="text" id="field-${field.name}" name="${name}" value="${h(val)}" ${field.required ? 'required' : ''} placeholder="Related ${h(field.relation?.contentType || 'entry')} ID or slug">`
      break
    default:
      input = `<input type="text" id="field-${field.name}" name="${name}" value="${h(val)}">`
  }

  return `
      <div class="form-group">
        <label for="field-${field.name}">${h(field.name)}${field.required ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
        ${input}
        ${field.helpText ? `<div class="help">${h(field.helpText)}</div>` : ''}
      </div>`
}

async function renderVersions(sql: Sql<any>, typeSlug: string, entryId: number, ctx: Context): Promise<string> {
  const ct = await getContentType(sql, typeSlug)
  const entry = await getEntry(sql, entryId)
  if (!ct || !entry) {
    return adminLayout('Not Found', `<div class="card"><p>Entry not found.</p></div>`, ctx, '/admin/content-types')
  }

  const versions = await listVersions(sql, entryId)
  const base = baseHref(ctx)

  let content = `<div class="flex justify-between items-center mb-2">
    <h1>Versions: ${h(entry.title)}</h1>
    <a href="${base}/admin/content/${typeSlug}/${entryId}/edit" class="btn btn-outline">← Back to Editor</a>
  </div>`

  if (versions.length === 0) {
    content += `<div class="card empty"><p>No versions saved.</p></div>`
  } else {
    content += `<div class="card"><table><thead><tr><th>Version</th><th>Created</th><th></th></tr></thead><tbody>`
    for (const v of versions) {
      content += `<tr>
        <td><strong>#${v.version}</strong></td>
        <td>${formatDate(v.createdAt)}</td>
        <td>
          <div class="btn-group">
            <form method="POST" action="${base}/admin/content/${typeSlug}/${entryId}/restore/${v.version}" onsubmit="return confirm('Restore version #${v.version}? Current data will be replaced.')">
              <button type="submit" class="btn btn-outline btn-sm">Restore</button>
            </form>
          </div>
        </td>
      </tr>`
    }
    content += `</tbody></table></div>`
  }

  return adminLayout(`Versions: ${entry.title}`, content, ctx, '/admin/content-types')
}

export function registerAdminRoutes(router: Router, sql: Sql<any>): void {
  const h = (handler: (sql: Sql<any>, req: Request, ctx: Context) => Promise<Response>) =>
    (req: Request, ctx: Context) => handler(sql, req, ctx)

  // Dashboard
  router.get('/admin', h(async (_sql, req, ctx) => {
    const html = await renderDashboard(sql, ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Content type list
  router.get('/admin/content-types', h(async (_sql, req, ctx) => {
    const html = await renderContentTypeList(sql, ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Content type create form
  router.get('/admin/content-types/new', h(async (_sql, req, ctx) => {
    const html = renderContentTypeForm(ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Content type create
  router.post('/admin/content-types', h(async (_sql, req, ctx) => {
    try {
      const fd = await req.formData()
      const slug = (fd.get('slug') as string)?.trim()
      const label = (fd.get('label') as string)?.trim()
      const description = (fd.get('description') as string) || ''
      const fieldsRaw = (fd.get('fields') as string) || '[]'
      const configRaw = (fd.get('config') as string) || '{}'

      let fields: CmsFieldDef[]
      let config: any
      try { fields = JSON.parse(fieldsRaw) } catch { fields = [] }
      try { config = JSON.parse(configRaw) } catch { config = {} }

      if (!slug || !label) throw new Error('Slug and label are required')

      await createContentType(sql, slug, label, fields, config)
      return redirect(`${baseHref(ctx)}/admin/content-types?message=${encodeURIComponent(`Content type "${label}" created`)}`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content-types/new?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Content type edit form
  router.get('/admin/content-types/:slug/edit', h(async (_sql, req, ctx) => {
    const ct = await getContentType(sql, ctx.params.slug)
    if (!ct) {
      return redirect(`${baseHref(ctx)}/admin/content-types?error=${encodeURIComponent('Content type not found')}`, 303)
    }
    const html = renderContentTypeForm(ctx, ct)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Content type update
  router.post('/admin/content-types/:slug', h(async (_sql, req, ctx) => {
    try {
      const fd = await req.formData()
      const label = (fd.get('label') as string)?.trim()
      const description = (fd.get('description') as string) || ''
      const fieldsRaw = (fd.get('fields') as string) || '[]'
      const configRaw = (fd.get('config') as string) || '{}'

      let fields: CmsFieldDef[]
      let config: any
      try { fields = JSON.parse(fieldsRaw) } catch { fields = [] }
      try { config = JSON.parse(configRaw) } catch { config = {} }

      await updateContentType(sql, ctx.params.slug, { label, description, fields, config })
      return redirect(`${baseHref(ctx)}/admin/content-types?message=${encodeURIComponent(`Content type updated`)}`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content-types/${ctx.params.slug}/edit?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Content type delete
  router.post('/admin/content-types/:slug/delete', h(async (_sql, req, ctx) => {
    try {
      await deleteContentType(sql, ctx.params.slug)
      return redirect(`${baseHref(ctx)}/admin/content-types?message=Content type deleted`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content-types?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Entry list
  router.get('/admin/content/:type', h(async (_sql, req, ctx) => {
    const html = await renderEntryList(sql, ctx.params.type, ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Entry create form
  router.get('/admin/content/:type/new', h(async (_sql, req, ctx) => {
    const html = await renderEntryForm(sql, ctx.params.type, ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Entry create
  router.post('/admin/content/:type', h(async (_sql, req, ctx) => {
    try {
      const ct = await getContentType(sql, ctx.params.type)
      if (!ct) throw new Error('Content type not found')

      const fd = await req.formData()
      const title = (fd.get('title') as string)?.trim() || 'Untitled'
      let slug = (fd.get('slug') as string)?.trim() || ''
      if (!slug) slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `entry-${Date.now()}`

      const entryData = parseFormDataToObject(fd, ct.fields)

      const entry = await createEntry(sql, { contentType: ct.slug, slug, title, entryData })
      await createVersion(sql, entry.id, entryData)

      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${entry.id}/edit?message=Created`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/new?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Entry edit form
  router.get('/admin/content/:type/:id/edit', h(async (_sql, req, ctx) => {
    const entryId = parseInt(ctx.params.id, 10)
    if (isNaN(entryId)) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}?error=Invalid ID`, 303)
    }
    const entry = await getEntry(sql, entryId)
    if (!entry) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}?error=Entry not found`, 303)
    }
    const html = await renderEntryForm(sql, ctx.params.type, ctx, entry)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Entry update
  router.post('/admin/content/:type/:id', h(async (_sql, req, ctx) => {
    try {
      const entryId = parseInt(ctx.params.id, 10)
      const ct = await getContentType(sql, ctx.params.type)
      if (!ct) throw new Error('Content type not found')

      const entry = await getEntry(sql, entryId)
      if (!entry) throw new Error('Entry not found')

      const fd = await req.formData()
      const title = (fd.get('title') as string)?.trim() || entry.title
      let slug = (fd.get('slug') as string)?.trim() || ''
      if (!slug) slug = entry.slug
      const entryData = parseFormDataToObject(fd, ct.fields)

      const oldData = entry.data
      await createVersion(sql, entryId, oldData)

      await updateEntry(sql, entryId, { slug, title, entryData })
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${entryId}/edit?message=Updated`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${ctx.params.id}/edit?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Entry publish
  router.post('/admin/content/:type/:id/publish', h(async (_sql, req, ctx) => {
    try {
      const entryId = parseInt(ctx.params.id, 10)
      await publishEntry(sql, entryId)
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${entryId}/edit?message=Published`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${ctx.params.id}/edit?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Entry archive
  router.post('/admin/content/:type/:id/archive', h(async (_sql, req, ctx) => {
    try {
      const entryId = parseInt(ctx.params.id, 10)
      await archiveEntry(sql, entryId)
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${entryId}/edit?message=Archived`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${ctx.params.id}/edit?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Entry delete
  router.post('/admin/content/:type/:id/delete', h(async (_sql, req, ctx) => {
    try {
      const entryId = parseInt(ctx.params.id, 10)
      await deleteEntry(sql, entryId)
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}?message=Entry deleted`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))

  // Version history
  router.get('/admin/content/:type/:id/versions', h(async (_sql, req, ctx) => {
    const entryId = parseInt(ctx.params.id, 10)
    const html = await renderVersions(sql, ctx.params.type, entryId, ctx)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }))

  // Version restore
  router.post('/admin/content/:type/:id/restore/:version', h(async (_sql, req, ctx) => {
    try {
      const entryId = parseInt(ctx.params.id, 10)
      const version = parseInt(ctx.params.version, 10)
      const ct = await getContentType(sql, ctx.params.type)
      if (!ct) throw new Error('Content type not found')

      const entry = await getEntry(sql, entryId)
      if (!entry) throw new Error('Entry not found')

      const ver = await getVersion(sql, entryId, version)
      if (!ver) throw new Error('Version not found')

      await createVersion(sql, entryId, entry.data)
      await updateEntry(sql, entryId, { entryData: ver.data })

      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${entryId}/edit?message=Version ${version} restored`, 303)
    } catch (err: any) {
      return redirect(`${baseHref(ctx)}/admin/content/${ctx.params.type}/${ctx.params.id}/edit?error=${encodeURIComponent(err.message)}`, 303)
    }
  }))
}

function parseFormDataToObject(fd: FormData, fields: CmsFieldDef[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const field of fields) {
    const val = fd.get(`data[${field.name}]`)
    if (val === null) continue

    const strVal = val as string

    switch (field.type) {
      case 'integer':
        data[field.name] = strVal ? parseInt(strVal, 10) : null
        break
      case 'float':
        data[field.name] = strVal ? parseFloat(strVal) : null
        break
      case 'boolean':
        data[field.name] = strVal === 'true'
        break
      case 'json':
        try { data[field.name] = JSON.parse(strVal) } catch { data[field.name] = strVal }
        break
      default:
        data[field.name] = strVal
    }
  }

  return data
}

