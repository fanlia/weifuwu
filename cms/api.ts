import type { Sql } from 'postgres'
import type { Context } from '../types.ts'
import {
  getContentType, getEntryBySlug, listEntries, searchEntries,
} from './content.ts'
import type { ContentEntry, EntryStatus } from './types.ts'
import { Router } from '../router.ts'

export function registerApiRoutes(router: Router, sql: Sql<any>): void {
  // List published entries for a content type
  router.get('/api/:type', async (req: Request, ctx: Context) => {
    try {
      const ct = await getContentType(sql, ctx.params.type)
      if (!ct) {
        return Response.json({ error: 'Content type not found' }, { status: 404 })
      }

      const q = ctx.query?.q as string
      let entries: ContentEntry[]

      if (q) {
        entries = await searchEntries(sql, ct.slug, q, 'published')
      } else {
        entries = await listEntries(sql, ct.slug, 'published')
      }

      const fields = ct.fields

      return Response.json({
        data: entries.map(e => serializeEntry(e, fields)),
        meta: {
          total: entries.length,
          type: ct.slug,
        },
      })
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 })
    }
  })

  // Get a single published entry by slug
  router.get('/api/:type/:slug', async (req: Request, ctx: Context) => {
    try {
      const ct = await getContentType(sql, ctx.params.type)
      if (!ct) {
        return Response.json({ error: 'Content type not found' }, { status: 404 })
      }

      const entry = await getEntryBySlug(sql, ct.slug, ctx.params.slug, 'published')
      if (!entry) {
        return Response.json({ error: 'Entry not found' }, { status: 404 })
      }

      return Response.json({
        data: serializeEntry(entry, ct.fields),
      })
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 })
    }
  })
}

function serializeEntry(entry: ContentEntry, fields: any[]): Record<string, unknown> {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    ...entry.data,
    meta: {
      type: entry.contentType,
      status: entry.status,
      publishedAt: entry.publishedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  }
}
