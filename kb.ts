import type { Sql } from './vendor.ts'
import type { Middleware } from './types.ts'

// ── Types ───────────────────────────────────────────────────────────────────

export interface KBOptions {
  /** Postgres SQL client (with pgvector extension enabled). */
  sql: Sql<{}>
  /**
   * Embedding function.
   * Takes a text string, returns a vector of numbers.
   * Example: (text) => embed({ model: openai.embedding('text-embedding-3-small'), value: text }).then(r => r.embedding)
   */
  embedding: (text: string) => Promise<number[]>
  /** Vector dimensions (default: 1536 for text-embedding-3-small). */
  dimensions?: number
  /** Table name (default: '_kb_docs'). */
  table?: string
  /** Default chunk size in characters (default: 512). */
  chunkSize?: number
  /** Default chunk overlap in characters (default: 64). */
  chunkOverlap?: number
  /** Default search limit (default: 5). */
  searchLimit?: number
  /** Minimum similarity score threshold (0–1, default: 0). Set higher for stricter matches. */
  searchThreshold?: number
}

export interface KBIngestOptions {
  title?: string
  metadata?: Record<string, unknown>
  chunkSize?: number
  chunkOverlap?: number
}

export interface KBSearchResult {
  id: number
  key: string
  title: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface KBSearchOptions {
  limit?: number
  /** Minimum cosine similarity score (0–1). Results below this are excluded. */
  threshold?: number
}

export interface KBListEntry {
  key: string
  title: string
  chunks: number
}

export interface KBModule {
  /**
   * Ingest a document: chunk → embed → store.
   * If a document with the same key exists, it is replaced (delete + re-insert).
   * Returns the number of chunks created.
   */
  ingest(key: string, content: string, options?: KBIngestOptions): Promise<number>
  /**
   * Search the knowledge base by semantic similarity.
   * Query is embedded, then vector similarity search returns top results.
   */
  search(query: string, searchOptions?: KBSearchOptions): Promise<KBSearchResult[]>
  /** Delete all chunks for a document key. */
  delete(key: string): Promise<void>
  /** List all document keys with title and chunk count. */
  list(): Promise<KBListEntry[]>
  /** Create the table and HNSW index. Safe to call multiple times. */
  migrate(): Promise<void>
  /** Middleware that injects `ctx.kb` with `.search()` method. */
  middleware(): Middleware
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function chunkContent(content: string, chunkSize: number, overlap: number): string[] {
  const paragraphs = content.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current.length + p.length > chunkSize && current.length > 0) {
      chunks.push(current)
      current = current.slice(-overlap)
    }
    current += (current ? '\n\n' : '') + p
  }
  if (current) chunks.push(current)
  return chunks
}

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

// ── Knowledge Base factory ──────────────────────────────────────────────────

export function knowledgeBase(options: KBOptions): KBModule {
  const {
    sql,
    embedding: embedFn,
    dimensions = 1536,
    table = '_kb_docs',
    chunkSize = 512,
    chunkOverlap = 64,
    searchLimit = 5,
    searchThreshold = 0,
  } = options

  // Internal row type
  interface KbRow {
    id: number
    doc_key: string
    title: string
    content: string
    chunk_index: number
    metadata: Record<string, unknown>
    embedding: number[]
    created_at: string
  }

  async function migrate(): Promise<void> {
    // Enable pgvector extension
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "vector"`)

    // Create table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${escapeIdent(table)} (
        id SERIAL PRIMARY KEY,
        doc_key TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        embedding vector(${dimensions}),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Index for doc_key lookups
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${escapeIdent(table + '_key_idx')}
      ON ${escapeIdent(table)}(doc_key)
    `)

    // HNSW index for fast vector search
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${escapeIdent(table + '_embedding_idx')}
      ON ${escapeIdent(table)}
      USING hnsw (embedding vector_cosine_ops)
    `)
  }

  async function ingest(key: string, content: string, ingestOpts?: KBIngestOptions): Promise<number> {
    // Delete existing chunks for this key (re-ingest)
    await sql.unsafe(`DELETE FROM ${escapeIdent(table)} WHERE doc_key = $1`, [key])

    const title = ingestOpts?.title ?? key
    const meta = ingestOpts?.metadata ?? {}
    const cs = ingestOpts?.chunkSize ?? chunkSize
    const co = ingestOpts?.chunkOverlap ?? chunkOverlap

    const chunks = chunkContent(content, cs, co)
    const metaJson = JSON.stringify(meta)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = await embedFn(chunk)
      const vec = `[${embedding.join(',')}]`

      await sql.unsafe(
        `INSERT INTO ${escapeIdent(table)} (doc_key, title, content, chunk_index, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
        [key, title, chunk, i, metaJson, vec],
      )
    }

    return chunks.length
  }

  async function search(query: string, searchOpts?: KBSearchOptions): Promise<KBSearchResult[]> {
    const limit = searchOpts?.limit ?? searchLimit
    const threshold = searchOpts?.threshold ?? searchThreshold

    const embedding = await embedFn(query)
    const vec = `[${embedding.join(',')}]`

    // Cosine distance (<=>) returns 0–2. Convert to similarity 0–1: (1 - distance/2)
    const whereClause = threshold > 0
      ? `WHERE (1 - (embedding <=> $1::vector) / 2) >= ${threshold}`
      : ''

    const rows = await sql.unsafe(
      `SELECT id, doc_key, title, content, chunk_index, metadata,
              1 - (embedding <=> $1::vector) / 2 AS _score
       FROM ${escapeIdent(table)}
       ${whereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT ${limit}`,
      [vec],
    ) as any[]

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
    const rows = await sql.unsafe(`
      SELECT doc_key, title, COUNT(*) AS chunks
      FROM ${escapeIdent(table)}
      GROUP BY doc_key, title
      ORDER BY doc_key
    `) as any[]
    return rows.map((r: any) => ({
      key: r.doc_key,
      title: r.title,
      chunks: Number(r.chunks),
    }))
  }

  function mw(): Middleware {
    return (req, ctx, next) => {
      ;(ctx as any).kb = { search }
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
