/**
 * CMS — content management module for weifuwu.
 *
 * Depends on `postgres()` and `user()` middleware registered first.
 *
 * ```ts
 * import { serve, Router, postgres, user, cms } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(cms())
 *
 * app.get('/api/posts', async (req, ctx) => {
 *   return Response.json(await ctx.cms.list({ type: 'post', status: 'published' }))
 * })
 *
 * app.get('/api/posts/:slug', async (req, ctx) => {
 *   const post = await ctx.cms.get(ctx.params.slug)
 *   if (!post) return new Response('Not found', { status: 404 })
 *   return Response.json(post)
 * })
 * ```
 */

import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  CMSAPI,
  CMSOptions,
  Content,
  ContentStatus,
  Tag,
  TagWithCount,
  CreateContentInput,
  UpdateContentInput,
  ListContentOptions,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'untitled'
}

function getSql(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) throw new Error('cms() requires postgres() middleware')
  return sql
}

// ═══════════════════════════════════════════════════════════════
// Row mapping
// ═══════════════════════════════════════════════════════════════

function toContent(row: Record<string, unknown>): Content {
  return {
    id: row.id as string,
    slug: row.slug as string,
    type: row.type as string,
    parent_id: row.parent_id as string | null,
    title: row.title as string,
    body: row.body as string,
    excerpt: row.excerpt as string | null,
    cover_image: row.cover_image as string | null,
    status: row.status as ContentStatus,
    author_id: row.author_id as string,
    author_name: row.author_name as string | undefined,
    published_at: row.published_at as Date | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    tags: row.tags ? (row.tags as unknown as Tag[]) : undefined,
  }
}

function toTag(row: Record<string, unknown>): Tag {
  return { id: row.id as string, name: row.name as string, slug: row.slug as string }
}

function toTagWithCount(row: Record<string, unknown>): TagWithCount {
  return { ...toTag(row), content_count: row.content_count as number }
}

function currentUserId(ctx: Context): string {
  const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
  if (!u?.id) throw new Error('cms() requires user() middleware — ctx.user is missing')
  return u.id as string
}

function requireAdmin(ctx: Context): void {
  const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
  if (!u) throw new Error('Authentication required')
  const role = u.role as string | undefined
  if (role !== 'admin') throw new Error('Admin role required')
}

// ═══════════════════════════════════════════════════════════════
// CMS implementation
// ═══════════════════════════════════════════════════════════════

export class CMS {
  private migrated = false
  private prefix: string
  private usersTable: string

  constructor(opts?: CMSOptions) {
    this.prefix = opts?.tablePrefix ?? ''
    this.usersTable = opts?.usersTable ?? 'users'
  }

  private q(name: string): string {
    return `"${this.prefix}${name}"`
  }

  // ── Migration ──────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('contents')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'post',
        parent_id   UUID REFERENCES ${this.q('contents')}(id) ON DELETE SET NULL,
        title       TEXT NOT NULL,
        body        TEXT NOT NULL DEFAULT '',
        excerpt     TEXT,
        cover_image TEXT,
        status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        author_id   UUID NOT NULL,
        published_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${this.q('contents_slug_type_idx')}
        ON ${this.q('contents')} (slug, type)
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('contents_type_status_idx')}
        ON ${this.q('contents')} (type, status, created_at DESC)
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('contents_parent_idx')}
        ON ${this.q('contents')} (parent_id)
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('tags')} (
        id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name  TEXT NOT NULL UNIQUE,
        slug  TEXT NOT NULL UNIQUE
      )
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('contents_tags')} (
        content_id UUID NOT NULL REFERENCES ${this.q('contents')}(id) ON DELETE CASCADE,
        tag_id     UUID NOT NULL REFERENCES ${this.q('tags')}(id) ON DELETE CASCADE,
        PRIMARY KEY (content_id, tag_id)
      )
    `)

    this.migrated = true
  }

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  // ── Per-request bound API ──────────────────────────────────

  bind(ctx: Context): CMSAPI {
    const self = this
    const sql = getSql(ctx)

    if (!this.migrated) {
      this.migrate(sql).catch(() => {})
    }

    // Helper: fetch tags for content IDs
    async function fetchTags(contentIds: string[]): Promise<Map<string, Tag[]>> {
      if (contentIds.length === 0) return new Map()
      const rows = await sql.unsafe(`
        SELECT ct.content_id, t.id, t.name, t.slug
        FROM ${self.q('contents_tags')} ct
        JOIN ${self.q('tags')} t ON t.id = ct.tag_id
        WHERE ct.content_id = ANY($1::uuid[])
        ORDER BY t.name
      `, [contentIds]) as unknown as Record<string, unknown>[]
      const map = new Map<string, Tag[]>()
      for (const row of rows) {
        const cid = row.content_id as string
        if (!map.has(cid)) map.set(cid, [])
        map.get(cid)!.push(toTag(row))
      }
      return map
    }

    // Helper: attach tags to content rows
    async function attachTags(contents: Content[]): Promise<Content[]> {
      if (contents.length === 0) return contents
      const tags = await fetchTags(contents.map(c => c.id))
      for (const c of contents) {
        const t = tags.get(c.id)
        if (t) c.tags = t
      }
      return contents
    }

    // Helper: upsert tags and link to content
    async function updateContentTags(contentId: string, tagNames: string[]): Promise<void> {
      // Delete existing links
      await sql.unsafe(`DELETE FROM ${self.q('contents_tags')} WHERE content_id = $1`, [contentId])

      if (tagNames.length === 0) return

      // Upsert tags
      const tagRecords: Tag[] = []
      for (const name of tagNames) {
        const slug = slugify(name)
        const [tag] = await sql.unsafe(`
          INSERT INTO ${self.q('tags')} (name, slug) VALUES ($1, $2)
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
          RETURNING *
        `, [name, slug]) as unknown as Record<string, unknown>[]
        if (tag) tagRecords.push(toTag(tag))
      }

      // Link tags to content
      if (tagRecords.length > 0) {
        const values = tagRecords.map((_, i) => `($1, $${i + 2})`).join(', ')
        await sql.unsafe(`
          INSERT INTO ${self.q('contents_tags')} (content_id, tag_id)
          VALUES ${values}
          ON CONFLICT DO NOTHING
        `, [contentId, ...tagRecords.map(t => t.id)])
      }
    }

    return {
      // ── List ─────────────────────────────────────────────

      async list(opts?: ListContentOptions) {
        await self.ensureMigrated(sql)
        const me = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
        const isAdmin = me?.role === 'admin'
        const limit = Math.min(opts?.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

        const conditions: string[] = []
        const values: unknown[] = []
        let idx = 1

        // Non-admin only sees published content
        if (!isAdmin) {
          conditions.push(`c.status = 'published'`)
        } else if (opts?.status) {
          conditions.push(`c.status = $${idx++}`)
          values.push(opts.status)
        }

        if (opts?.type) { conditions.push(`c.type = $${idx++}`); values.push(opts.type) }
        if (opts?.tag) {
          conditions.push(`EXISTS (SELECT 1 FROM ${self.q('contents_tags')} ct
            JOIN ${self.q('tags')} t ON t.id = ct.tag_id
            WHERE ct.content_id = c.id AND t.slug = $${idx})`)
          values.push(opts.tag)
          idx++
        }
        if (opts?.author_id) { conditions.push(`c.author_id = $${idx++}`); values.push(opts.author_id) }

        // parent_id filter
        if (opts?.parent_id !== undefined) {
          if (opts.parent_id === null) {
            conditions.push('c.parent_id IS NULL')
          } else {
            conditions.push(`c.parent_id = $${idx++}`)
            values.push(opts.parent_id)
          }
        }

        // Cursor pagination
        if (opts?.before) {
          const [cursor] = await sql.unsafe(
            `SELECT created_at FROM ${self.q('contents')} WHERE id = $1`, [opts.before],
          ) as unknown as Record<string, unknown>[]
          if (cursor) {
            conditions.push(`c.created_at < $${idx++}`)
            values.push(cursor.created_at)
          }
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const rows = await sql.unsafe(`
          SELECT c.*, (SELECT u.name FROM "${self.usersTable}" u WHERE u.id = c.author_id) AS author_name
          FROM ${self.q('contents')} c
          ${where}
          ORDER BY c.created_at DESC
          LIMIT $${idx}
        `, [...values, limit]) as unknown as Record<string, unknown>[]

        const contents = rows.map(toContent)
        return attachTags(contents)
      },

      // ── Get ──────────────────────────────────────────────

      async get(slug: string) {
        await self.ensureMigrated(sql)
        const me = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
        const isAdmin = me?.role === 'admin'

        const [row] = await sql.unsafe(`
          SELECT c.*, (SELECT u.name FROM "${self.usersTable}" u WHERE u.id = c.author_id) AS author_name
          FROM ${self.q('contents')} c
          WHERE c.slug = $1 ${isAdmin ? '' : "AND c.status = 'published'"}
          LIMIT 1
        `, [slug]) as unknown as Record<string, unknown>[]

        if (!row) return null
        const content = toContent(row)
        const tagged = await attachTags([content])
        return tagged[0]
      },

      async getById(id: string) {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(`
          SELECT c.*, (SELECT u.name FROM "${self.usersTable}" u WHERE u.id = c.author_id) AS author_name
          FROM ${self.q('contents')} c
          WHERE c.id = $1
          LIMIT 1
        `, [id]) as unknown as Record<string, unknown>[]
        if (!row) return null
        const content = toContent(row)
        const tagged = await attachTags([content])
        return tagged[0]
      },

      // ── Create ───────────────────────────────────────────

      async create(input: CreateContentInput) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)

        const slug = input.slug || slugify(input.title)
        const status = input.status || 'draft'
        const authorId = currentUserId(ctx)
        const parentId = input.parent_id || null

        // Ensure slug uniqueness within type
        const slugFinal = await self._uniqueSlug(sql, slug, input.type)

        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('contents')} (slug, type, parent_id, title, body, excerpt, cover_image, status, author_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          slugFinal, input.type, parentId, input.title, input.body,
          input.excerpt ?? null, input.cover_image ?? null, status, authorId,
        ]) as unknown as Record<string, unknown>[]

        const content = toContent(row)
        content.author_name = (ctx as Record<string, unknown>).user
          ? ((ctx as Record<string, unknown>).user as Record<string, unknown>).name as string
          : undefined

        if (input.tags && input.tags.length > 0) {
          await updateContentTags(content.id, input.tags)
          content.tags = await (async () => {
            const map = await fetchTags([content.id])
            return map.get(content.id) || []
          })()
        }

        // Auto-publish if status is published
        if (status === 'published') {
          await sql.unsafe(`UPDATE ${self.q('contents')} SET published_at = NOW() WHERE id = $1`, [content.id])
          content.published_at = new Date()
        }

        return content
      },

      // ── Update ───────────────────────────────────────────

      async update(id: string, input: UpdateContentInput) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)

        const sets: string[] = []
        const values: unknown[] = []
        let idx = 1

        if (input.slug !== undefined) { sets.push(`slug = $${idx++}`); values.push(input.slug) }
        if (input.type !== undefined) { sets.push(`type = $${idx++}`); values.push(input.type) }
        if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title) }
        if (input.body !== undefined) { sets.push(`body = $${idx++}`); values.push(input.body) }
        if (input.excerpt !== undefined) { sets.push(`excerpt = $${idx++}`); values.push(input.excerpt) }
        if (input.cover_image !== undefined) { sets.push(`cover_image = $${idx++}`); values.push(input.cover_image) }
        if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status) }
        if (input.parent_id !== undefined) { sets.push(`parent_id = $${idx++}`); values.push(input.parent_id) }

        let row: Record<string, unknown> | undefined

        if (sets.length > 0) {
          sets.push('updated_at = NOW()')
          values.push(id)
          ;[row] = await sql.unsafe(`
            UPDATE ${self.q('contents')} SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
          `, values) as unknown as Record<string, unknown>[]
          if (!row) return null
        } else {
          // No content fields to update — only updating tags or other non-content aspects
          ;[row] = await sql.unsafe(
            `SELECT * FROM ${self.q('contents')} WHERE id = $1 LIMIT 1`, [id],
          ) as unknown as Record<string, unknown>[]
          if (!row) return null
          // Still bump updated_at if tags changed
          if (input.tags !== undefined) {
            await sql.unsafe(`UPDATE ${self.q('contents')} SET updated_at = NOW() WHERE id = $1`, [id])
          }
        }

        // Handle tags
        if (input.tags !== undefined) {
          await updateContentTags(id, input.tags)
        }

        // Update published_at if publishing
        if (input.status === 'published') {
          await sql.unsafe(`UPDATE ${self.q('contents')} SET published_at = COALESCE(published_at, NOW()) WHERE id = $1`, [id])
        }

        const content = toContent(row)
        const tagged = await attachTags([content])
        return tagged[0]
      },

      // ── Delete ───────────────────────────────────────────

      async delete(id: string) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `DELETE FROM ${self.q('contents')} WHERE id = $1 RETURNING id`, [id],
        ) as unknown as Record<string, unknown>[]
        return !!row
      },

      // ── Publish / Unpublish ─────────────────────────────

      async publish(id: string) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(`
          UPDATE ${self.q('contents')}
          SET status = 'published', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
          WHERE id = $1 RETURNING *
        `, [id]) as unknown as Record<string, unknown>[]
        if (!row) return null
        const content = toContent(row)
        const tagged = await attachTags([content])
        return tagged[0]
      },

      async unpublish(id: string) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(`
          UPDATE ${self.q('contents')}
          SET status = 'draft', updated_at = NOW()
          WHERE id = $1 RETURNING *
        `, [id]) as unknown as Record<string, unknown>[]
        if (!row) return null
        const content = toContent(row)
        const tagged = await attachTags([content])
        return tagged[0]
      },

      // ── Tags ─────────────────────────────────────────────

      async listTags() {
        await self.ensureMigrated(sql)
        const rows = await sql.unsafe(`
          SELECT t.*, COUNT(ct.content_id)::INT AS content_count
          FROM ${self.q('tags')} t
          LEFT JOIN ${self.q('contents_tags')} ct ON ct.tag_id = t.id
          GROUP BY t.id
          ORDER BY t.name
        `) as unknown as Record<string, unknown>[]
        return rows.map(toTagWithCount)
      },

      async createTag(name: string) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)
        const slug = slugify(name)
        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('tags')} (name, slug) VALUES ($1, $2)
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
          RETURNING *
        `, [name, slug]) as unknown as Record<string, unknown>[]
        return toTag(row)
      },

      async deleteTag(id: string) {
        requireAdmin(ctx)
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `DELETE FROM ${self.q('tags')} WHERE id = $1 RETURNING id`, [id],
        ) as unknown as Record<string, unknown>[]
        return !!row
      },
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private async _uniqueSlug(sql: SqlClient, slug: string, type: string): Promise<string> {
    const [existing] = await sql.unsafe(
      `SELECT id FROM ${this.q('contents')} WHERE slug = $1 AND type = $2 LIMIT 1`,
      [slug, type],
    ) as unknown as Record<string, unknown>[]
    if (!existing) return slug

    // Append a number suffix
    for (let i = 2; i < 100; i++) {
      const candidate = `${slug}-${i}`
      const [found] = await sql.unsafe(
        `SELECT id FROM ${this.q('contents')} WHERE slug = $1 AND type = $2 LIMIT 1`,
        [candidate, type],
      ) as unknown as Record<string, unknown>[]
      if (!found) return candidate
    }
    return `${slug}-${Date.now()}`
  }

  // ── Middleware ─────────────────────────────────────────────

  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    ctx.cms = this.bind(ctx)
    return next(req, ctx)
  }
}
