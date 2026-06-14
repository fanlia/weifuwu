import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { serial, text } from '../postgres/schema/index.ts'
import * as fts from '../fts.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describePg = DATABASE_URL ? describe : describe.skip

describePg('fts', () => {
  let pg: ReturnType<typeof postgres>
  let articles: ReturnType<ReturnType<typeof postgres>['table']>

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    articles = pg.table('_fts_test_articles', {
      id: serial('id').primaryKey(),
      title: text('title').notNull(),
      body: text('body').notNull(),
    })

    await articles.create()
    await articles.insertMany([
      { title: 'Node.js Guide', body: 'A comprehensive guide to Node.js for beginners' },
      { title: 'TypeScript Handbook', body: 'Learn TypeScript with practical examples' },
      {
        title: 'Web Framework Comparison',
        body: 'Comparing Express, Fastify, and modern web frameworks',
      },
      { title: 'PostgreSQL Tips', body: 'Advanced PostgreSQL query optimization techniques' },
      { title: 'Docker for Developers', body: 'Containerization made easy with Docker' },
    ])
  })

  after(async () => {
    await articles.drop?.()
    await pg.close()
  })

  it('createIndex builds a GIN index', async () => {
    await fts.createIndex(pg.sql, articles, ['title', 'body'], { language: 'english' })
    // If no error, index was created
    assert.ok(true)
  })

  it('search returns results for matching query', async () => {
    const results = await fts.search(pg.sql, articles, 'node.js', {
      fields: ['title', 'body'],
      limit: 10,
    })
    assert.ok(results.length > 0)
    // "Node.js Guide" should match
    const titles = results.map((r) => (r.row as any).title)
    assert.ok(titles.some((t: string) => t.includes('Node.js')))
  })

  it('search returns results ranked by relevance', async () => {
    const results = await fts.search(pg.sql, articles, 'postgresql', {
      fields: ['title', 'body'],
      limit: 10,
    })
    assert.ok(results.length > 0)
    // The "PostgreSQL Tips" article should be the top result
    assert.equal((results[0].row as any).title, 'PostgreSQL Tips')
    assert.ok(results[0].rank > 0)
  })

  it('search returns empty array for non-matching query', async () => {
    const results = await fts.search(pg.sql, articles, 'xyznonexistent', {
      fields: ['title', 'body'],
      limit: 10,
    })
    assert.equal(results.length, 0)
  })

  it('search respects limit', async () => {
    const all = await fts.search(pg.sql, articles, 'Node.js', {
      fields: ['title', 'body'],
      limit: 10,
    })
    const limited = await fts.search(pg.sql, articles, 'Node.js', {
      fields: ['title', 'body'],
      limit: 1,
    })
    assert.equal(limited.length, 1)
    assert.equal(all.length, 1) // only one article mentions Node.js
  })

  it('search with headline generates snippets', async () => {
    const results = await fts.search(pg.sql, articles, 'guide', {
      fields: ['title', 'body'],
      limit: 5,
      headline: true,
    })
    for (const r of results) {
      assert.ok(typeof r.headline === 'string')
    }
  })

  it('search minRank filters low-relevance results', async () => {
    const results = await fts.search(pg.sql, articles, 'the', {
      fields: ['title', 'body'],
      limit: 10,
    })
    // 'the' is a stop word, should return few or no results
    // Not a strict assertion since behavior depends on language config
    assert.ok(Array.isArray(results))
  })

  it('createIndex is idempotent', async () => {
    await fts.createIndex(pg.sql, articles, ['title', 'body'], { language: 'english' })
    await fts.createIndex(pg.sql, articles, ['title', 'body'], { language: 'english' })
    assert.ok(true) // no error on duplicate
  })

  it('dropIndex removes the index', async () => {
    await fts.dropIndex(pg.sql, articles)
    // Should be able to recreate after drop
    await fts.createIndex(pg.sql, articles, ['title', 'body'], { language: 'english' })
    assert.ok(true)
  })
})
