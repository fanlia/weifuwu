import { Router, ssr, postgres, theme, i18n, flash, loadEnv } from '../../index.ts'
import type { PostgresClient } from '../../postgres/types.ts'

loadEnv()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

export const pg = postgres({ connection: DATABASE_URL })
export type { PostgresClient }

export const app = new Router()

// ── Global middleware ──────────────────────────────────────────────────
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(flash())

// ── SSR ────────────────────────────────────────────────────────────────
app.use('/', ssr({ dir: './ui' }))

// ── API routes ──────────────────────────────────────────────────────────

/** List all posts (JSON) */
app.get('/api/posts', async () => {
  const rows = await pg.sql`
    SELECT id, title, LEFT(content, 200) AS excerpt, created_at
    FROM posts
    ORDER BY created_at DESC
    LIMIT 50
  `
  return Response.json(rows)
})

/** Get a single post (JSON) */
app.get('/api/posts/:id', async (req, ctx) => {
  const [row] = await pg.sql`
    SELECT id, title, content, created_at
    FROM posts
    WHERE id = ${ctx.params.id}
  `
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
})

/** Create a new post (form POST — redirects with flash) */
app.post('/posts/create', async (req, ctx) => {
  const form = await req.formData()
  const title = (form.get('title') as string)?.trim()
  const content = (form.get('content') as string)?.trim()

  if (!title || !content) {
    return ctx.flash!.set({ type: 'error', text: ctx.i18n?.t('create.error') || 'Both title and content are required' }, '/')
  }

  await pg.sql`
    INSERT INTO posts (title, content) VALUES (${title}, ${content})
  `

  return ctx.flash!.set({ type: 'success', text: ctx.i18n?.t('create.success') || 'Post published!' }, '/')
})

// ── Middleware: inject post data into SSR pages ─────────────────────────
app.use(async (req, ctx, next) => {
  const url = new URL(req.url)
  const path = url.pathname

  // Homepage — load latest posts
  if (path === '/' || path === '') {
    const rows = await pg.sql`
      SELECT id, title, LEFT(content, 200) AS excerpt, created_at
      FROM posts
      ORDER BY created_at DESC
      LIMIT 10
    `
    ctx.loaderData = { posts: rows }
  }

  // Post detail — load single post by ID
  const detailMatch = path.match(/^\/posts\/(\d+)$/)
  if (detailMatch) {
    const [row] = await pg.sql`
      SELECT id, title, content, created_at
      FROM posts
      WHERE id = ${detailMatch[1]}
    `
    ctx.loaderData = { post: row || null }
  }

  return next(req, ctx)
})
