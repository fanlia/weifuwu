import type { Middleware, Context } from '../types.ts'
import {
  serial,
  text,
  integer,
  jsonb,
  vector,
  timestamptz,
  sql as schemaSql,
} from '../postgres/schema/index.ts'
import { chunkContent } from '../ai/utils.ts'
import type {
  KBOptions,
  KBModule,
  KBIngestOptions,
  KBSearchOptions,
  KBSearchResult,
  KBListEntry,
  KBInjected,
} from './types.ts'

export type { KBOptions, KBIngestOptions, KBSearchResult, KBSearchOptions, KBListEntry, KBModule }

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

// ── Knowledge Base factory ──────────────────────────────────────────────────

export function knowledgeBase(options: KBOptions): KBModule {
  const {
    pg,
    provider,
    table = '_kb_docs',
    chunkSize = 512,
    chunkOverlap = 64,
    searchLimit = 5,
    searchThreshold = 0,
  } = options
  const sql = pg.sql
  const dimension = provider.dimension

  const docsTable = pg.table(table, {
    id: serial('id').primaryKey(),
    doc_key: text('doc_key').notNull(),
    title: text('title').notNull().default(''),
    content: text('content').notNull(),
    chunk_index: integer('chunk_index').notNull().default(0),
    metadata: jsonb('metadata')
      .notNull()
      .default(schemaSql`'{}'::jsonb`),
    embedding: vector('embedding', dimension),
    created_at: timestamptz('created_at')
      .notNull()
      .default(schemaSql`NOW()`),
  })

  async function migrate(): Promise<void> {
    // Enable pgvector extension
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "vector"`)

    // Create table via BoundTable for clean DDL
    await docsTable.create()

    // Index for doc_key lookups
    await docsTable.createIndex('doc_key')

    // HNSW index for fast vector search
    await docsTable.createIndex('embedding', { type: 'hnsw', operator: 'vector_cosine_ops' })
  }

  async function ingest(
    key: string,
    content: string,
    ingestOpts?: KBIngestOptions,
  ): Promise<number> {
    const title = ingestOpts?.title ?? key
    const meta = ingestOpts?.metadata ?? {}
    const cs = ingestOpts?.chunkSize ?? chunkSize
    const co = ingestOpts?.chunkOverlap ?? chunkOverlap

    const chunks = chunkContent(content, cs, co)
    const metaJson = JSON.stringify(meta)

    // Delete existing chunks for this key (re-ingest)
    await sql.unsafe(`DELETE FROM ${escapeIdent(table)} WHERE doc_key = $1`, [key])

    // Compute embeddings in parallel, then insert
    const embeddings = await Promise.all(chunks.map((c) => provider.embed(c)))

    for (let i = 0; i < chunks.length; i++) {
      const vec = `[${embeddings[i].join(',')}]`
      await sql.unsafe(
        `INSERT INTO ${escapeIdent(table)} (doc_key, title, content, chunk_index, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
        [key, title, chunks[i], i, metaJson, vec],
      )
    }

    return chunks.length
  }

  async function search(query: string, searchOpts?: KBSearchOptions): Promise<KBSearchResult[]> {
    const limit = searchOpts?.limit ?? searchLimit
    const threshold = searchOpts?.threshold ?? searchThreshold

    const embedding = await provider.embed(query)
    const vec = `[${embedding.join(',')}]`

    // Cosine distance (<=>) returns 0–2. Convert to similarity 0–1: (1 - distance/2)
    const whereClause =
      threshold > 0 ? `WHERE (1 - (embedding <=> $1::vector) / 2) >= ${threshold}` : ''

    const rows = (await sql.unsafe(
      `SELECT id, doc_key, title, content, chunk_index, metadata,
              1 - (embedding <=> $1::vector) / 2 AS _score
       FROM ${escapeIdent(table)}
       ${whereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT ${limit}`,
      [vec],
    )) as any[]

    return rows.map((r: any) => ({
      id: r.id,
      key: r.doc_key,
      title: r.title,
      content: r.content,
      score: r._score as number,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {}),
    }))
  }

  async function del(key: string): Promise<void> {
    await sql.unsafe(`DELETE FROM ${escapeIdent(table)} WHERE doc_key = $1`, [key])
  }

  async function list(): Promise<KBListEntry[]> {
    const rows = (await sql.unsafe(`
      SELECT doc_key, title, COUNT(*) AS chunks
      FROM ${escapeIdent(table)}
      GROUP BY doc_key, title
      ORDER BY doc_key
    `)) as any[]
    return rows.map((r: any) => ({
      key: r.doc_key,
      title: r.title,
      chunks: Number(r.chunks),
    }))
  }

  function mw(): Middleware {
    return (req, ctx, next) => {
      ;(ctx as Context & { kb: KBInjected }).kb = { search }
      return next(req, ctx)
    }
  }

  return {
    ingest,
    search,
    delete: del,
    list,
    migrate,
    middleware: mw,
  }
}
