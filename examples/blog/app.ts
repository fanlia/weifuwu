import { Router, ssr, postgres, theme, i18n, flash, loadEnv, user } from '../../index.ts'
import type { PostgresClient } from '../../postgres/types.ts'

loadEnv()

const DATABASE_URL = process.env.DATABASE_URL
const JWT_SECRET = process.env.JWT_SECRET
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}
if (!JWT_SECRET) {
  console.error('JWT_SECRET not set')
  process.exit(1)
}

export const pg = postgres({ connection: DATABASE_URL })
export type { PostgresClient }

export const app = new Router()

// ── Auth module ─────────────────────────────────────────────────────────
const auth = user({ pg, jwtSecret: JWT_SECRET })
export { auth }

// ── Optional auth middleware (reads JWT from cookie, non-blocking) ──────
app.use(auth.middlewareOptional({ cookie: 'token' }))

// ── Global middleware ──────────────────────────────────────────────────
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(flash())

// ── Form-based auth routes (cookie-style) ───────────────────────────────

/** Register: parse form → create user → set cookie → redirect */
app.post('/register', async (req) => {
  const form = await req.formData()
  const email = (form.get('email') as string)?.trim()
  const password = form.get('password') as string
  const name = (form.get('name') as string)?.trim()

  if (!email || !password || !name) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/register',
        'set-cookie': 'flash=' + encodeURIComponent(JSON.stringify({ type: 'error', text: 'All fields are required' })) + '; Path=/; SameSite=Lax',
      },
    })
  }

  try {
    const result = await auth.register({ email, password, name })
    return new Response(null, {
      status: 302,
      headers: {
        location: '/',
        'set-cookie': [
          `token=${result.token}; Path=/; SameSite=Lax; HttpOnly`,
          'flash=' + encodeURIComponent(JSON.stringify({ type: 'success', text: 'Registered successfully!' })) + '; Path=/; SameSite=Lax',
        ],
      },
    })
  } catch (e: any) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/register',
        'set-cookie': 'flash=' + encodeURIComponent(JSON.stringify({ type: 'error', text: e.message || 'Registration failed' })) + '; Path=/; SameSite=Lax',
      },
    })
  }
})

/** Login: parse form → verify → set cookie → redirect */
app.post('/login', async (req) => {
  const form = await req.formData()
  const email = (form.get('email') as string)?.trim()
  const password = form.get('password') as string

  if (!email || !password) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/login',
        'set-cookie': 'flash=' + encodeURIComponent(JSON.stringify({ type: 'error', text: 'Email and password are required' })) + '; Path=/; SameSite=Lax',
      },
    })
  }

  try {
    const result = await auth.login({ email, password })
    return new Response(null, {
      status: 302,
      headers: {
        location: '/',
        'set-cookie': [
          `token=${result.token}; Path=/; SameSite=Lax; HttpOnly`,
          'flash=' + encodeURIComponent(JSON.stringify({ type: 'success', text: 'Welcome back!' })) + '; Path=/; SameSite=Lax',
        ],
      },
    })
  } catch (e: any) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/login',
        'set-cookie': 'flash=' + encodeURIComponent(JSON.stringify({ type: 'error', text: e.message || 'Invalid credentials' })) + '; Path=/; SameSite=Lax',
      },
    })
  }
})

/** Logout: clear token cookie → redirect */
app.get('/logout', async () => {
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': 'token=; Path=/; Max-Age=0',
    },
  })
})

// ── SSR ────────────────────────────────────────────────────────────────
app.use('/', ssr({ dir: './ui' }))

// ── API routes ──────────────────────────────────────────────────────────

/** List all posts (JSON) */
app.get('/api/posts', async () => {
  const rows = await pg.sql`
    SELECT p.id, p.title, LEFT(p.content, 200) AS excerpt, p.created_at,
           u.name AS author_name
    FROM posts p
    LEFT JOIN users u ON u.id = p.author_id
    ORDER BY p.created_at DESC
    LIMIT 50
  `
  return Response.json(rows)
})

/** Get a single post (JSON) */
app.get('/api/posts/:id', async (req, ctx) => {
  const [row] = await pg.sql`
    SELECT p.id, p.title, p.content, p.created_at,
           u.name AS author_name
    FROM posts p
    LEFT JOIN users u ON u.id = p.author_id
    WHERE p.id = ${ctx.params.id}
  `
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
})

/** Get current user info (JSON) */
app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return Response.json({ user: null })
  return Response.json({ user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name } })
})

/** Create a new post (form POST — redirects with flash) */
app.post('/posts/create', async (req, ctx) => {
  // Require login
  if (!ctx.user) {
    return ctx.flash!.set({ type: 'error', text: 'Please log in first' }, '/login')
  }

  const form = await req.formData()
  const title = (form.get('title') as string)?.trim()
  const content = (form.get('content') as string)?.trim()

  if (!title || !content) {
    return ctx.flash!.set({ type: 'error', text: 'Both title and content are required' }, '/')
  }

  await pg.sql`
    INSERT INTO posts (title, content, author_id) VALUES (${title}, ${content}, ${ctx.user.id})
  `

  return ctx.flash!.set({ type: 'success', text: ctx.i18n?.t('create.success') || 'Post published!' }, '/')
})

// ── Middleware: inject data into SSR pages ──────────────────────────────
app.use(async (req, ctx, next) => {
  const url = new URL(req.url)
  const path = url.pathname

  // Inject current user into all SSR pages
  const userData = ctx.user ? { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name } : null
  ctx.loaderData = { ...(ctx.loaderData || {}), currentUser: userData }

  // Homepage — load latest posts
  if (path === '/' || path === '') {
    const rows = await pg.sql`
      SELECT p.id, p.title, LEFT(p.content, 200) AS excerpt, p.created_at,
             u.name AS author_name
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC
      LIMIT 10
    `
    ctx.loaderData = { ...ctx.loaderData as any, posts: rows }
  }

  // Post detail — load single post by ID
  const detailMatch = path.match(/^\/posts\/(\d+)$/)
  if (detailMatch) {
    const [row] = await pg.sql`
      SELECT p.id, p.title, p.content, p.created_at,
             u.name AS author_name
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      WHERE p.id = ${detailMatch[1]}
    `
    ctx.loaderData = { ...ctx.loaderData as any, post: row || null }
  }

  return next(req, ctx)
})
