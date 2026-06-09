import type { Sql } from 'postgres'
import type { ContentType, ContentEntry, ContentVersion, CmsFieldDef, ContentTypeConfig, EntryStatus } from './types.ts'

export async function createContentType(
  sql: Sql<any>,
  slug: string,
  label: string,
  fields: CmsFieldDef[],
  config?: ContentTypeConfig,
): Promise<ContentType> {
  const rows = await sql`
    INSERT INTO "_cms_content_types" ("slug", "label", "fields", "config")
    VALUES (${slug}, ${label}, ${sql.json(fields)}, ${sql.json(config ?? {})})
    RETURNING *
  ` as any[]
  return mapContentType(rows[0])
}

export async function getContentType(sql: Sql<any>, slug: string): Promise<ContentType | null> {
  const rows = await sql`SELECT * FROM "_cms_content_types" WHERE "slug" = ${slug}` as any[]
  return rows[0] ? mapContentType(rows[0]) : null
}

export async function listContentTypes(sql: Sql<any>): Promise<ContentType[]> {
  const rows = await sql`SELECT * FROM "_cms_content_types" ORDER BY "created_at" ASC` as any[]
  return rows.map(mapContentType)
}

export async function updateContentType(
  sql: Sql<any>,
  slug: string,
  data: { label?: string; description?: string; fields?: CmsFieldDef[]; config?: ContentTypeConfig },
): Promise<ContentType> {
  const sets: string[] = []
  const vals: any[] = []
  let idx = 1

  if (data.label !== undefined) {
    sets.push(`"label" = $${idx++}`)
    vals.push(data.label)
  }
  if (data.description !== undefined) {
    sets.push(`"description" = $${idx++}`)
    vals.push(data.description)
  }
  if (data.fields !== undefined) {
    sets.push(`"fields" = $${idx++}`)
    vals.push(JSON.stringify(data.fields))
  }
  if (data.config !== undefined) {
    sets.push(`"config" = $${idx++}`)
    vals.push(JSON.stringify(data.config))
  }

  if (sets.length === 0) {
    const existing = await getContentType(sql, slug)
    return existing!
  }

  sets.push(`"updated_at" = NOW()`)

  const query = `UPDATE "_cms_content_types" SET ${sets.join(', ')} WHERE "slug" = $${idx} RETURNING *`
  const rows = await sql.unsafe(query, [...vals, slug]) as any[]
  return mapContentType(rows[0])
}

export async function deleteContentType(sql: Sql<any>, slug: string): Promise<void> {
  await sql`DELETE FROM "_cms_content_types" WHERE "slug" = ${slug}`
}

export async function createEntry(
  sql: Sql<any>,
  data: {
    contentType: string
    slug: string
    title: string
    entryData: Record<string, unknown>
    status?: EntryStatus
    createdBy?: number
  },
): Promise<ContentEntry> {
  const rows = await sql`
    INSERT INTO "_cms_entries" ("content_type", "slug", "title", "data", "status", "created_by", "updated_by")
    VALUES (${data.contentType}, ${data.slug}, ${data.title}, ${sql.json(data.entryData)}, ${data.status ?? 'draft'}, ${data.createdBy ?? null}, ${data.createdBy ?? null})
    RETURNING *
  ` as any[]
  return mapEntry(rows[0])
}

export async function getEntry(sql: Sql<any>, id: number): Promise<ContentEntry | null> {
  const rows = await sql`SELECT * FROM "_cms_entries" WHERE "id" = ${id}` as any[]
  return rows[0] ? mapEntry(rows[0]) : null
}

export async function getEntryBySlug(
  sql: Sql<any>,
  contentType: string,
  slug: string,
  status?: EntryStatus,
): Promise<ContentEntry | null> {
  const rows = status
    ? await sql`SELECT * FROM "_cms_entries" WHERE "content_type" = ${contentType} AND "slug" = ${slug} AND "status" = ${status}` as any[]
    : await sql`SELECT * FROM "_cms_entries" WHERE "content_type" = ${contentType} AND "slug" = ${slug}` as any[]
  return rows[0] ? mapEntry(rows[0]) : null
}

export async function listEntries(
  sql: Sql<any>,
  contentType: string,
  status?: EntryStatus,
): Promise<ContentEntry[]> {
  const rows = status
    ? await sql`SELECT * FROM "_cms_entries" WHERE "content_type" = ${contentType} AND "status" = ${status} ORDER BY "updated_at" DESC` as any[]
    : await sql`SELECT * FROM "_cms_entries" WHERE "content_type" = ${contentType} ORDER BY "updated_at" DESC` as any[]
  return rows.map(mapEntry)
}

export async function updateEntry(
  sql: Sql<any>,
  id: number,
  data: { slug?: string; title?: string; entryData?: Record<string, unknown>; updatedBy?: number },
): Promise<ContentEntry> {
  const sets: string[] = []
  const vals: any[] = []
  let idx = 1

  if (data.slug !== undefined) {
    sets.push(`"slug" = $${idx++}`)
    vals.push(data.slug)
  }
  if (data.title !== undefined) {
    sets.push(`"title" = $${idx++}`)
    vals.push(data.title)
  }
  if (data.entryData !== undefined) {
    sets.push(`"data" = $${idx++}::jsonb`)
    vals.push(JSON.stringify(data.entryData))
  }
  if (data.updatedBy !== undefined) {
    sets.push(`"updated_by" = $${idx++}`)
    vals.push(data.updatedBy)
  }

  if (sets.length === 0) {
    const existing = await getEntry(sql, id)
    return existing!
  }

  sets.push(`"updated_at" = NOW()`)

  const query = `UPDATE "_cms_entries" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
  const rows = await sql.unsafe(query, [...vals, id]) as any[]
  return mapEntry(rows[0])
}

export async function publishEntry(sql: Sql<any>, id: number, userId?: number): Promise<ContentEntry> {
  const rows = await sql`
    UPDATE "_cms_entries"
    SET "status" = 'published', "published_at" = NOW(), "updated_by" = ${userId ?? null}, "updated_at" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  ` as any[]
  return mapEntry(rows[0])
}

export async function archiveEntry(sql: Sql<any>, id: number): Promise<ContentEntry> {
  const rows = await sql`
    UPDATE "_cms_entries"
    SET "status" = 'archived', "updated_at" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  ` as any[]
  return mapEntry(rows[0])
}

export async function deleteEntry(sql: Sql<any>, id: number): Promise<void> {
  await sql`DELETE FROM "_cms_entries" WHERE "id" = ${id}`
}

export async function searchEntries(
  sql: Sql<any>,
  contentType: string,
  query: string,
  status?: EntryStatus,
): Promise<ContentEntry[]> {
  const q = `%${query}%`
  const rows = status
    ? await sql`
        SELECT * FROM "_cms_entries"
        WHERE "content_type" = ${contentType}
          AND "status" = ${status}
          AND ("title" ILIKE ${q} OR "data"::text ILIKE ${q})
        ORDER BY "updated_at" DESC
        LIMIT 50
      ` as any[]
    : await sql`
        SELECT * FROM "_cms_entries"
        WHERE "content_type" = ${contentType}
          AND ("title" ILIKE ${q} OR "data"::text ILIKE ${q})
        ORDER BY "updated_at" DESC
        LIMIT 50
      ` as any[]
  return rows.map(mapEntry)
}

export async function createVersion(
  sql: Sql<any>,
  entryId: number,
  entryData: Record<string, unknown>,
  userId?: number,
): Promise<ContentVersion> {
  const maxVer = await sql`SELECT COALESCE(MAX("version"), 0) + 1 AS next FROM "_cms_versions" WHERE "entry_id" = ${entryId}` as any[]
  const nextVer = maxVer[0].next
  const rows = await sql`
    INSERT INTO "_cms_versions" ("entry_id", "version", "data", "created_by")
    VALUES (${entryId}, ${nextVer}, ${sql.json(entryData)}, ${userId ?? null})
    RETURNING *
  ` as any[]
  return mapVersion(rows[0])
}

export async function listVersions(sql: Sql<any>, entryId: number): Promise<ContentVersion[]> {
  const rows = await sql`
    SELECT * FROM "_cms_versions" WHERE "entry_id" = ${entryId} ORDER BY "version" DESC
  ` as any[]
  return rows.map(mapVersion)
}

export async function getVersion(sql: Sql<any>, entryId: number, version: number): Promise<ContentVersion | null> {
  const rows = await sql`
    SELECT * FROM "_cms_versions" WHERE "entry_id" = ${entryId} AND "version" = ${version}
  ` as any[]
  return rows[0] ? mapVersion(rows[0]) : null
}

function mapContentType(row: any): ContentType {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description ?? '',
    fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config ?? {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEntry(row: any): ContentEntry {
  return {
    id: row.id,
    contentType: row.content_type,
    slug: row.slug,
    title: row.title,
    status: row.status,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {}),
    locale: row.locale ?? null,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVersion(row: any): ContentVersion {
  return {
    id: row.id,
    entryId: row.entry_id,
    version: row.version,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {}),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}
