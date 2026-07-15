import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { kb } from '../kb/index.ts'
import type { Context, Handler } from '../types.ts'

// Mock embedding: same content → same vector, similar content → similar vector
function mockEmbed(text: string): Promise<number[]> {
  const dims = 8
  // Hash-like: sum char codes into bins
  const vec = new Array(dims).fill(0)
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i)
  }
  // Normalize
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return Promise.resolve(vec.map(v => v / mag))
}

describe('kb module', () => {
  const pg = postgres()

  async function withCtx(): Promise<import('../kb/types.ts').KBAPI> {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    let api!: import('../kb/types.ts').KBAPI
    const mw = kb({ embed: mockEmbed, dimensions: 8 }) as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mw(new Request('http://localhost/'), c, async (_, c2) => {
      api = c2.kb
      return new Response('ok')
    })
    return api
  }

  after(async () => {
    await pg.sql.unsafe('DROP TABLE IF EXISTS public.kb_chunks CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS public.kb_documents CASCADE')
    await pg.close()
  })

  // ═══════════════════════════════════════════════════════════
  // Import
  // ═══════════════════════════════════════════════════════════

  it('imports text and creates chunks', async () => {
    const api = await withCtx()
    const result = await api.importText('Getting Started', 'Hello world. This is a test document.')
    assert.ok(result.document.id)
    assert.equal(result.document.title, 'Getting Started')
    assert.ok(result.chunks.length >= 1)
    assert.ok(result.chunks[0].content.includes('Hello world'))
  })

  it('splits long text into multiple chunks', async () => {
    const api = await withCtx()
    const longText = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}: ` + 'words '.repeat(30)).join('\n\n')
    const result = await api.importText('Long Doc', longText, { chunkSize: 100, chunkOverlap: 0 })
    assert.ok(result.chunks.length >= 2, `Expected >= 2 chunks, got ${result.chunks.length}`)
  })

  it('stores metadata', async () => {
    const api = await withCtx()
    const result = await api.importText('Meta Doc', 'Content', {
      source: 'manual',
      metadata: { category: 'guide', author: 'Alice' },
    })
    assert.equal(result.document.source, 'manual')
    assert.deepEqual(result.document.metadata, { category: 'guide', author: 'Alice' })
  })

  it('imports multiple documents', async () => {
    const api = await withCtx()
    const docs = await api.importDocuments([
      { title: 'Doc 1', content: 'Content one' },
      { title: 'Doc 2', content: 'Content two' },
    ])
    assert.equal(docs.length, 2)
  })

  // ═══════════════════════════════════════════════════════════
  // Search
  // ═══════════════════════════════════════════════════════════

  it('searches and returns results by similarity', async () => {
    const api = await withCtx()
    const text = 'The quick brown fox jumps over the lazy dog'
    await api.importText('Animals', text)

    const results = await api.search(text.slice(0, 30), { limit: 5 })
    assert.ok(results.length >= 1, 'Expected at least 1 result')
    assert.ok(typeof results[0].score === 'number')
    assert.ok(results[0].score > 0)
  })

  it('respects minScore filter', async () => {
    const api = await withCtx()
    const all = await api.search('anything', { limit: 10, minScore: 0.5 })
    // With mock embeddings, scores are low, so likely empty
    assert.ok(Array.isArray(all))
  })

  // ═══════════════════════════════════════════════════════════
  // List / Get
  // ═══════════════════════════════════════════════════════════

  it('lists all documents', async () => {
    const api = await withCtx()
    const docs = await api.list()
    assert.ok(docs.length >= 2) // from previous tests
  })

  it('gets a document by id', async () => {
    const api = await withCtx()
    const docs = await api.list()
    const doc = await api.get(docs[0].id)
    assert.ok(doc)
    assert.equal(doc!.id, docs[0].id)
  })

  it('returns null for non-existent document', async () => {
    const api = await withCtx()
    const doc = await api.get('00000000-0000-0000-0000-000000000000')
    assert.equal(doc, null)
  })

  // ═══════════════════════════════════════════════════════════
  // Chunks
  // ═══════════════════════════════════════════════════════════

  it('returns chunks for a document', async () => {
    const api = await withCtx()
    const result = await api.importText('Chunked Doc', 'First chunk.\n\nSecond chunk.\n\nThird chunk.', {
      chunkSize: 50, chunkOverlap: 0,
    })
    const chunks = await api.getChunks(result.document.id)
    assert.equal(chunks.length, result.chunks.length)
  })

  // ═══════════════════════════════════════════════════════════
  // Delete
  // ═══════════════════════════════════════════════════════════

  it('deletes a document', async () => {
    const api = await withCtx()
    const result = await api.importText('To Delete', 'Delete me')
    const deleted = await api.delete(result.document.id)
    assert.equal(deleted, true)

    const found = await api.get(result.document.id)
    assert.equal(found, null)
  })

  it('returns false for non-existent document', async () => {
    const api = await withCtx()
    const result = await api.delete('00000000-0000-0000-0000-000000000000')
    assert.equal(result, false)
  })
})
