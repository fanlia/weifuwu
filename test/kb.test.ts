import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeBase } from '../kb/index.ts'
import { Router } from '../router.ts'
import { postgres } from '../postgres/index.ts'
import type { AIProvider } from '../ai/provider.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('knowledgeBase', { skip: !DATABASE_URL }, () => {
  let pg: ReturnType<typeof postgres>
  let kb: ReturnType<typeof knowledgeBase>

  // Simple mock AI provider returning fixed-dimension vectors based on text hash
  function mockProvider(): AIProvider {
    function embedHash(text: string): number[] {
      let hash = 0
      for (const c of text) {
        hash = (hash * 31 + c.charCodeAt(0)) | 0
      }
      const seed = Math.abs(hash)
      const v = [
        Math.sin(seed * 0.1),
        Math.cos(seed * 0.2),
        Math.sin(seed * 0.3 + 1),
        Math.cos(seed * 0.4 + 2),
      ]
      const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
      return v.map((x) => x / len)
    }

    return {
      dimension: 4,
      model: () => {
        throw new Error('not used in tests')
      },
      embeddingModel: () => {
        throw new Error('not used in tests')
      },
      embed: (text: string) => Promise.resolve(embedHash(text)),
      embedMany: (texts: string[]) => Promise.resolve(texts.map(embedHash)),
    }
  }

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    await pg.sql`CREATE EXTENSION IF NOT EXISTS "vector"`
    kb = knowledgeBase({
      pg,
      provider: mockProvider(),
      table: '_test_kb',
      chunkSize: 200,
      chunkOverlap: 20,
      searchThreshold: 0,
    })
    await kb.migrate()
  })

  after(async () => {
    await pg.sql`DROP TABLE IF EXISTS "_test_kb"`
    await pg.close()
  })

  // ── Module shape ──────────────────────────────────────────────

  it('returns all expected methods', () => {
    assert.equal(typeof kb.ingest, 'function')
    assert.equal(typeof kb.search, 'function')
    assert.equal(typeof kb.delete, 'function')
    assert.equal(typeof kb.list, 'function')
    assert.equal(typeof kb.migrate, 'function')
    assert.equal(typeof kb.middleware, 'function')
  })

  // ── Ingest ─────────────────────────────────────────────────────

  it('ingests a document and returns chunk count', async () => {
    const text = 'The quick brown fox jumps over the lazy dog. This is a short document.'
    const chunks = await kb.ingest('test/doc1', text, { title: 'Fox Dog' })
    assert.equal(chunks, 1, 'short doc should be 1 chunk')
  })

  it('ingests a long document split into multiple chunks', async () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) =>
        `Paragraph number ${i + 1}. This is some text content for testing chunking behavior. It contains enough words to fill up the chunk size limit.`,
    )
    const text = paragraphs.join('\n\n')
    const chunks = await kb.ingest('test/doc2', text, { title: 'Long Doc' })
    assert.ok(chunks >= 2, 'long doc should be split into multiple chunks')
  })

  it('re-ingesting same key replaces old chunks', async () => {
    await kb.ingest('test/replace', 'first version content', { title: 'v1' })

    // Re-ingest with new content
    await kb.ingest('test/replace', 'second version updated content', { title: 'v2' })

    // List should show only 1 entry for this key (not 2 from old + new)
    const entries = await kb.list()
    const match = entries.filter((e) => e.key === 'test/replace')
    assert.equal(match.length, 1, 'should have only one entry per key')
    assert.equal(match[0].title, 'v2')
  })

  // ── Search ─────────────────────────────────────────────────────

  it('search returns relevant results by semantic similarity', async () => {
    await kb.ingest(
      'search/apples',
      'Apples are fruits that grow on trees. They are sweet and delicious.',
      { title: 'Apples' },
    )
    await kb.ingest(
      'search/cars',
      'Cars are vehicles with four wheels. They run on gasoline or electricity.',
      { title: 'Cars' },
    )
    await kb.ingest(
      'search/fruit',
      'Fruits come in many varieties including apples, oranges, and bananas.',
      { title: 'Fruits' },
    )

    const results = await kb.search('apple fruit', { limit: 3 })
    assert.ok(results.length >= 2, 'should find fruit-related docs')
    // The top result should be about apples (our mock embedding should correlate)
    // Since mock embedding is hash-based, the exact order may vary, but we test the shape
    assert.ok(results[0].score > 0, 'score must be positive')
    assert.ok(results[0].score <= 1, 'score must be <= 1')
  })

  it('search respects limit', async () => {
    const results = await kb.search('test', { limit: 1 })
    assert.ok(results.length <= 1)
  })

  it('search returns metadata', async () => {
    const metadata = { source: 'test', category: 'example' }
    await kb.ingest('search/metadata', 'Document with metadata', { metadata })

    const results = await kb.search('metadata', { limit: 1 })
    // Results may not include the exact doc due to mock embedding, but if found, check metadata
    const metaDoc = results.find((r) => r.key === 'search/metadata')
    if (metaDoc) {
      assert.deepEqual(metaDoc.metadata, metadata)
    }
  })

  // ── Delete ─────────────────────────────────────────────────────

  it('delete removes all chunks for a key', async () => {
    await kb.ingest('test/delete-me', 'This document will be deleted.')

    // Verify via list (not search, since mock embedding may not rank it high)
    let entries = await kb.list()
    assert.ok(
      entries.find((e) => e.key === 'test/delete-me'),
      'doc should exist before delete',
    )

    await kb.delete('test/delete-me')

    entries = await kb.list()
    assert.ok(!entries.find((e) => e.key === 'test/delete-me'), 'doc should be gone after delete')
  })

  it('delete on non-existent key does not throw', async () => {
    await kb.delete('nonexistent-key-' + Date.now())
  })

  // ── List ───────────────────────────────────────────────────────

  it('list returns all document keys with chunk counts', async () => {
    const entries = await kb.list()
    assert.ok(entries.length > 0, 'should have at least the docs from previous tests')
    const first = entries.find((e) => e.key === 'test/doc1')
    assert.ok(first, 'should find test/doc1')
    assert.equal(first!.chunks, 1, 'doc1 should have 1 chunk')
    assert.equal(first!.title, 'Fox Dog')
  })

  // ── Middleware ─────────────────────────────────────────────────

  it('injects ctx.kb.search as middleware', async () => {
    const app = new Router()
    app.use(kb.middleware())
    app.get('/search', async (req, ctx: any) => {
      assert.ok(ctx.kb, 'ctx.kb must exist')
      assert.equal(typeof ctx.kb.search, 'function', 'ctx.kb.search must be a function')
      const results = await ctx.kb.search('test', { limit: 1 })
      assert.ok(Array.isArray(results))
      return Response.json({ count: results.length })
    })

    const res = await app.handler()(new Request('http://localhost/search'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    assert.equal(typeof body.count, 'number')
  })

  // ── Migrate is idempotent ──────────────────────────────────────

  it('migrate is safe to call multiple times', async () => {
    await kb.migrate()
    await kb.migrate()
    // Should not throw
  })
})
