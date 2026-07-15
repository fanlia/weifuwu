/**
 * KB — RAG knowledge base module.
 *
 * Splits documents into chunks, embeds them via DashScope text-embedding-v4,
 * stores vectors in PostgreSQL with pgvector, and provides similarity search.
 *
 * Depends on `postgres()` middleware registered first.
 *
 * ```ts
 * import { serve, Router, postgres, kb } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(kb())
 *
 * // Import
 * await ctx.kb.importText('Getting Started', 'First, install the package...')
 *
 * // Search
 * const results = await ctx.kb.search('how to install?', { limit: 5 })
 * ```
 */

import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  KBAPI,
  KBOptions,
  Document,
  Chunk,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════

const DEFAULT_DIMENSIONS = 1536
const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_CHUNK_OVERLAP = 64
const DEFAULT_TOP_K = 5

// ═══════════════════════════════════════════════════════════════
// Default embedding: DashScope text-embedding-v4
// ═══════════════════════════════════════════════════════════════

async function dashscopeEmbed(text: string): Promise<number[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) throw new Error(
    'DASHSCOPE_API_KEY not set. Provide an embedding function in kb() options, ' +
    'or set the DASHSCOPE_API_KEY environment variable.',
  )
  const baseURL = process.env.DASHSCOPE_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-v4',
      input: text,
      dimensions: DEFAULT_DIMENSIONS,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DashScope embedding error (${res.status}): ${body}`)
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

// ═══════════════════════════════════════════════════════════════
// Text chunker
// ═══════════════════════════════════════════════════════════════

/** Rough token count (t≈chars/4 for English, ≈chars/1.5 for mixed). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  // Split by paragraphs first, then merge
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    // If a single paragraph exceeds chunkSize, split it by sentences
    if (estimateTokens(para) > chunkSize) {
      if (current) {
        chunks.push(current.trim())
        current = ''
      }

      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para]
      let sub = ''

      for (const sent of sentences) {
        const combined = sub ? `${sub} ${sent}` : sent
        if (estimateTokens(combined) > chunkSize) {
          if (sub) chunks.push(sub.trim())
          sub = sent
        } else {
          sub = combined
        }
      }
      if (sub) current = sub
      continue
    }

    const combined = current ? `${current}\n\n${para}` : para
    if (estimateTokens(combined) > chunkSize) {
      chunks.push(current.trim())
      current = para
    } else {
      current = combined
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  // Apply overlap by prepending last n chunks tokens
  if (overlap > 0 && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]
      const prevWords = prev.split(/\s+/)
      const overlapWords: string[] = []
      let overlapTokens = 0

      for (let j = prevWords.length - 1; j >= 0 && overlapTokens < overlap; j--) {
        overlapWords.unshift(prevWords[j])
        overlapTokens += Math.ceil(prevWords[j].length / 3.5)
      }

      if (overlapWords.length > 0) {
        chunks[i] = overlapWords.join(' ') + '\n\n' + chunks[i]
      }
    }
  }

  return chunks
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function getSql(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) throw new Error('kb() requires postgres() middleware')
  return sql
}

function toDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    title: row.title as string,
    source: row.source as string | null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    chunk_count: row.chunk_count as number,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function toChunk(row: Record<string, unknown>): Chunk {
  return {
    id: row.id as string,
    document_id: row.document_id as string | null,
    content: row.content as string,
    chunk_index: row.chunk_index as number,
    tokens: row.tokens as number,
    created_at: row.created_at as Date,
  }
}

// ═══════════════════════════════════════════════════════════════
// KB implementation
// ═══════════════════════════════════════════════════════════════

export class KB {
  private migrated = false
  private embedFn: (text: string) => Promise<number[]>
  private dimensions: number
  private chunkSize: number
  private chunkOverlap: number

  constructor(opts?: KBOptions) {
    this.embedFn = opts?.embed ?? dashscopeEmbed
    this.dimensions = opts?.dimensions ?? DEFAULT_DIMENSIONS
    this.chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK_SIZE
    this.chunkOverlap = opts?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP
  }

  private ms(name: string): string {
    return `"public"."${name}"`
  }

  // ── Migration ──────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    // Enable pgvector if available
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector')

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('kb_documents')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title       TEXT NOT NULL,
        source      TEXT,
        metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
        chunk_count INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('kb_chunks')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES ${this.ms('kb_documents')}(id) ON DELETE CASCADE,
        content     TEXT NOT NULL,
        chunk_index INT NOT NULL,
        embedding   VECTOR(${this.dimensions}) NOT NULL,
        tokens      INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS kb_chunks_doc_idx
        ON ${this.ms('kb_chunks')} (document_id)
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS kb_chunks_content_idx
        ON ${this.ms('kb_chunks')} USING GIN (to_tsvector('simple', content))
    `)

    this.migrated = true
  }

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  // ── Per-request bound API ──────────────────────────────────

  bind(ctx: Context): KBAPI {
    const self = this
    const sql = getSql(ctx)

    if (!this.migrated) {
      this.migrate(sql).catch(() => {})
    }

    return {
      // ── Import text ─────────────────────────────────────

      async importText(title, text, opts) {
        await self.ensureMigrated(sql)
        const chunkSize = opts?.chunkSize ?? self.chunkSize
        const overlap = opts?.chunkOverlap ?? self.chunkOverlap

        // Split into chunks
        const chunks = splitIntoChunks(text, chunkSize, overlap)
        if (chunks.length === 0) throw new Error('No content to import')

        // Create document record
        const meta = opts?.metadata ?? {}
        const [docRow] = await sql.unsafe(`
          INSERT INTO ${self.ms('kb_documents')} (title, source, metadata)
          VALUES ($1, $2, $3) RETURNING *
        `, [title, opts?.source ?? null, meta],
        ) as unknown as Record<string, unknown>[]

        // Embed and store each chunk
        const chunkRows: Chunk[] = []
        for (let i = 0; i < chunks.length; i++) {
          const content = chunks[i]
          const tokens = estimateTokens(content)

          const [chunkRow] = await sql.unsafe(`
            INSERT INTO ${self.ms('kb_chunks')} (document_id, content, chunk_index, embedding, tokens)
            VALUES ($1, $2, $3, $4::vector, $5) RETURNING *
          `, [
            docRow.id, content, i,
            JSON.stringify(await self.embedFn(content)),
            tokens,
          ]) as unknown as Record<string, unknown>[]
          chunkRows.push(toChunk(chunkRow))
        }

        // Update chunk count
        await sql.unsafe(
          `UPDATE ${self.ms('kb_documents')} SET chunk_count = $1 WHERE id = $2`,
          [chunks.length, docRow.id],
        )

        const doc = toDocument(docRow)
        doc.chunk_count = chunks.length
        return { document: doc, chunks: chunkRows }
      },

      // ── Import documents ─────────────────────────────────

      async importDocuments(docs) {
        const results: Document[] = []
        for (const doc of docs) {
          const { document } = await this.importText(doc.title, doc.content, {
            source: doc.source,
            metadata: doc.metadata,
            chunkSize: doc.chunkSize,
            chunkOverlap: doc.chunkOverlap,
          })
          results.push(document)
        }
        return results
      },

      // ── Search ─────────────────────────────────────────

      async search(query, opts) {
        await self.ensureMigrated(sql)
        const limit = Math.min(opts?.limit ?? DEFAULT_TOP_K, 50)
        const minScore = opts?.minScore ?? 0

        // Embed the query
        const queryVec = await self.embedFn(query)

        // Build metadata filter if provided
        const filterJoin = opts?.filter
          ? Object.entries(opts.filter).map(([k, v]) =>
              `AND d.metadata @> '${JSON.stringify({ [k]: v })}'::jsonb`
            ).join(' ')
          : ''

        const rows = await sql.unsafe(`
          SELECT
            c.id AS chunk_id,
            c.document_id,
            c.content,
            1 - (c.embedding <=> $1::vector) AS score,
            d.title,
            d.source
          FROM ${self.ms('kb_chunks')} c
          LEFT JOIN ${self.ms('kb_documents')} d ON d.id = c.document_id
          WHERE (1 - (c.embedding <=> $1::vector)) >= $2
            ${filterJoin}
          ORDER BY score DESC
          LIMIT $3
        `, [JSON.stringify(queryVec), minScore, limit]) as unknown as Record<string, unknown>[]

        return rows.map(r => ({
          chunk_id: r.chunk_id as string,
          document_id: r.document_id as string | null,
          content: r.content as string,
          score: r.score as number,
          title: r.title as string | undefined,
          source: r.source as string | undefined,
        }))
      },

      // ── List documents ───────────────────────────────────

      async list() {
        await self.ensureMigrated(sql)
        const rows = await sql.unsafe(
          `SELECT * FROM ${self.ms('kb_documents')} ORDER BY created_at DESC`,
        ) as unknown as Record<string, unknown>[]
        return rows.map(toDocument)
      },

      // ── Get document ─────────────────────────────────────

      async get(id) {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `SELECT * FROM ${self.ms('kb_documents')} WHERE id = $1 LIMIT 1`, [id],
        ) as unknown as Record<string, unknown>[]
        return row ? toDocument(row) : null
      },

      // ── Get chunks ───────────────────────────────────────

      async getChunks(documentId) {
        await self.ensureMigrated(sql)
        const rows = await sql.unsafe(
          `SELECT * FROM ${self.ms('kb_chunks')} WHERE document_id = $1 ORDER BY chunk_index`,
          [documentId],
        ) as unknown as Record<string, unknown>[]
        return rows.map(toChunk)
      },

      // ── Delete document ──────────────────────────────────

      async delete(id) {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `DELETE FROM ${self.ms('kb_documents')} WHERE id = $1 RETURNING id`, [id],
        ) as unknown as Record<string, unknown>[]
        return !!row
      },
    }
  }

  // ── Middleware ─────────────────────────────────────────────

  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    ctx.kb = this.bind(ctx)
    return next(req, ctx)
  }
}
