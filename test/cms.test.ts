import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { cms } from '../cms/client.ts'
import type { CmsModule } from '../cms/types.ts'
import { createTestServer } from '../serve.ts'
import {
  getContentType, listContentTypes, createContentType, updateContentType, deleteContentType,
  getEntry, getEntryBySlug, listEntries, createEntry, updateEntry, publishEntry, archiveEntry, deleteEntry,
  createVersion, listVersions, getVersion,
} from '../cms/content.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('cms', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  let cmsModule: CmsModule

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    cmsModule = cms({ pg })
    await cmsModule.migrate()
  })

  after(async () => {
    const tables = ['_cms_redirects', '_cms_webhooks', '_cms_media', '_cms_versions', '_cms_entries', '_cms_content_types']
    for (const t of tables) {
      try { await pg.sql.unsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`) } catch {}
    }
    await pg.close()
  })

  // ── Content Types ──────────────────────────────────────────

  describe('content types', () => {
    beforeEach(async () => {
      try { await pg.sql.unsafe(`DELETE FROM "_cms_content_types"`) } catch {}
    })

    it('creates a content type', async () => {
      const ct = await createContentType(pg.sql, 'post', 'Post', [
        { name: 'body', type: 'richtext' },
        { name: 'author', type: 'string' },
      ])
      assert.ok(ct.id > 0)
      assert.equal(ct.slug, 'post')
      assert.equal(ct.label, 'Post')
      assert.equal(ct.fields.length, 2)
    })

    it('lists content types', async () => {
      await createContentType(pg.sql, 'page', 'Page', [])
      await createContentType(pg.sql, 'product', 'Product', [])
      const list = await listContentTypes(pg.sql)
      assert.equal(list.length, 2)
    })

    it('gets a content type by slug', async () => {
      await createContentType(pg.sql, 'post', 'Post', [])
      const ct = await getContentType(pg.sql, 'post')
      assert.ok(ct)
      assert.equal(ct.label, 'Post')
    })

    it('returns null for missing type', async () => {
      const ct = await getContentType(pg.sql, 'nonexistent')
      assert.equal(ct, null)
    })

    it('updates a content type', async () => {
      await createContentType(pg.sql, 'post', 'Post', [])
      const updated = await updateContentType(pg.sql, 'post', {
        label: 'Article',
        fields: [{ name: 'summary', type: 'string' }],
      })
      assert.equal(updated.label, 'Article')
      assert.equal(updated.fields.length, 1)
    })

    it('deletes a content type', async () => {
      await createContentType(pg.sql, 'post', 'Post', [])
      await deleteContentType(pg.sql, 'post')
      const ct = await getContentType(pg.sql, 'post')
      assert.equal(ct, null)
    })
  })

  // ── Entries ────────────────────────────────────────────────

  describe('entries', () => {
    beforeEach(async () => {
      try { await pg.sql.unsafe(`DELETE FROM "_cms_versions"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_entries"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_content_types"`) } catch {}
      await createContentType(pg.sql, 'post', 'Post', [
        { name: 'body', type: 'richtext' },
        { name: 'author', type: 'string' },
        { name: 'views', type: 'integer' },
      ])
    })

    it('creates an entry', async () => {
      const entry = await createEntry(pg.sql, {
        contentType: 'post',
        slug: 'hello-world',
        title: 'Hello World',
        entryData: { body: 'Welcome!', author: 'Admin', views: 42 },
      })
      assert.ok(entry.id > 0)
      assert.equal(entry.slug, 'hello-world')
      assert.equal(entry.title, 'Hello World')
      assert.equal(entry.status, 'draft')
      assert.equal(entry.data.body, 'Welcome!')
      assert.equal(entry.data.views, 42)
    })

    it('gets entry by id', async () => {
      const created = await createEntry(pg.sql, {
        contentType: 'post', slug: 'test', title: 'Test', entryData: {},
      })
      const entry = await getEntry(pg.sql, created.id)
      assert.ok(entry)
      assert.equal(entry.id, created.id)
    })

    it('gets entry by slug', async () => {
      await createEntry(pg.sql, {
        contentType: 'post', slug: 'my-slug', title: 'My Slug', entryData: {},
      })
      const entry = await getEntryBySlug(pg.sql, 'post', 'my-slug')
      assert.ok(entry)
      assert.equal(entry.slug, 'my-slug')
    })

    it('lists entries for a content type', async () => {
      await createEntry(pg.sql, { contentType: 'post', slug: 'a', title: 'A', entryData: {} })
      await createEntry(pg.sql, { contentType: 'post', slug: 'b', title: 'B', entryData: {} })
      const list = await listEntries(pg.sql, 'post')
      assert.equal(list.length, 2)
    })

    it('updates an entry', async () => {
      const entry = await createEntry(pg.sql, {
        contentType: 'post', slug: 'update', title: 'Before', entryData: { body: 'old' },
      })
      const updated = await updateEntry(pg.sql, entry.id, {
        title: 'After',
        entryData: { body: 'new' },
      })
      assert.equal(updated.title, 'After')
      assert.equal(updated.data.body, 'new')
    })

    it('publishes an entry', async () => {
      const entry = await createEntry(pg.sql, {
        contentType: 'post', slug: 'pub', title: 'Pub', entryData: {},
      })
      assert.equal(entry.status, 'draft')
      const published = await publishEntry(pg.sql, entry.id)
      assert.equal(published.status, 'published')
      assert.ok(published.publishedAt)
    })

    it('archives an entry', async () => {
      const entry = await createEntry(pg.sql, {
        contentType: 'post', slug: 'arch', title: 'Arch', entryData: {},
      })
      await publishEntry(pg.sql, entry.id)
      const archived = await archiveEntry(pg.sql, entry.id)
      assert.equal(archived.status, 'archived')
    })

    it('deletes an entry', async () => {
      const entry = await createEntry(pg.sql, {
        contentType: 'post', slug: 'del', title: 'Del', entryData: {},
      })
      await deleteEntry(pg.sql, entry.id)
      const found = await getEntry(pg.sql, entry.id)
      assert.equal(found, null)
    })

    it('filters entries by status', async () => {
      const a = await createEntry(pg.sql, { contentType: 'post', slug: 'status-a', title: 'A', entryData: {} })
      const b = await createEntry(pg.sql, { contentType: 'post', slug: 'status-b', title: 'B', entryData: {} })
      await publishEntry(pg.sql, a.id)

      const published = await listEntries(pg.sql, 'post', 'published')
      const drafts = await listEntries(pg.sql, 'post', 'draft')

      assert.equal(published.length, 1)
      assert.equal(published[0].id, a.id)
      assert.equal(drafts.length, 1)
      assert.equal(drafts[0].id, b.id)
    })
  })

  // ── Versioning ─────────────────────────────────────────────

  describe('versioning', () => {
    let entryId: number

    beforeEach(async () => {
      try { await pg.sql.unsafe(`DELETE FROM "_cms_versions"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_entries"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_content_types"`) } catch {}
      await createContentType(pg.sql, 'page', 'Page', [{ name: 'content', type: 'richtext' }])
      const entry = await createEntry(pg.sql, {
        contentType: 'page', slug: 'ver', title: 'Version Test', entryData: { content: 'v1' },
      })
      entryId = entry.id
    })

    it('creates a version', async () => {
      const v = await createVersion(pg.sql, entryId, { content: 'v2' })
      assert.ok(v.id > 0)
      assert.equal(v.version, 1)
      assert.deepEqual(v.data, { content: 'v2' })
    })

    it('auto-increments version number', async () => {
      await createVersion(pg.sql, entryId, { content: 'v2' })
      const v2 = await createVersion(pg.sql, entryId, { content: 'v3' })
      assert.equal(v2.version, 2)
    })

    it('lists versions in descending order', async () => {
      await createVersion(pg.sql, entryId, { content: 'v2' })
      await createVersion(pg.sql, entryId, { content: 'v3' })
      const versions = await listVersions(pg.sql, entryId)
      assert.equal(versions.length, 2)
      assert.ok(versions[0].version > versions[1].version)
    })

    it('gets a specific version', async () => {
      await createVersion(pg.sql, entryId, { content: 'v2' })
      const v = await getVersion(pg.sql, entryId, 1)
      assert.ok(v)
      assert.equal(v.version, 1)
      assert.deepEqual(v.data, { content: 'v2' })
    })

    it('versions saved before update can be listed', async () => {
      const old = await getEntry(pg.sql, entryId)
      await createVersion(pg.sql, entryId, old.data)
      await updateEntry(pg.sql, entryId, { entryData: { content: 'v3' } })

      const versions = await listVersions(pg.sql, entryId)
      assert.equal(versions.length, 1)
      assert.deepEqual(versions[0].data, { content: 'v1' })
    })
  })

  // ── Public API ─────────────────────────────────────────────

  describe('API', () => {
    beforeEach(async () => {
      try { await pg.sql.unsafe(`DELETE FROM "_cms_versions"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_entries"`) } catch {}
      try { await pg.sql.unsafe(`DELETE FROM "_cms_content_types"`) } catch {}
      await createContentType(pg.sql, 'api-post', 'API Post', [
        { name: 'body', type: 'richtext' },
        { name: 'author', type: 'string' },
      ])
    })

    it('returns published entries for a content type', async () => {
      const a = await createEntry(pg.sql, { contentType: 'api-post', slug: 'api-a', title: 'A', entryData: { body: 'a' } })
      await createEntry(pg.sql, { contentType: 'api-post', slug: 'api-b', title: 'B', entryData: { body: 'b' } })
      await publishEntry(pg.sql, a.id)

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/api/api-post`)
        assert.equal(res.status, 200)
        const json = await res.json() as any
        assert.equal(json.meta.total, 1)
        assert.equal(json.data[0].slug, 'api-a')
      } finally {
        server.stop()
      }
    })

    it('returns a single published entry by slug', async () => {
      const e = await createEntry(pg.sql, { contentType: 'api-post', slug: 'api-single', title: 'Single', entryData: { body: 'hello' } })
      await publishEntry(pg.sql, e.id)

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/api/api-post/api-single`)
        assert.equal(res.status, 200)
        const json = await res.json() as any
        assert.equal(json.data.title, 'Single')
        assert.equal(json.data.body, 'hello')
      } finally {
        server.stop()
      }
    })

    it('returns 404 for unpublished entry via API', async () => {
      await createEntry(pg.sql, { contentType: 'api-post', slug: 'draft-only', title: 'Draft', entryData: {} })

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/api/api-post/draft-only`)
        assert.equal(res.status, 404)
      } finally {
        server.stop()
      }
    })

    it('returns 404 for unknown content type', async () => {
      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/api/unknown-type`)
        assert.equal(res.status, 404)
      } finally {
        server.stop()
      }
    })
  })

  // ── Admin Panel ────────────────────────────────────────────

  describe('admin panel', () => {
    it('dashboard returns HTML', async () => {
      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/admin`)
        assert.equal(res.status, 200)
        const html = await res.text()
        assert.match(html, /Dashboard/)
        assert.match(html, /Content Types/)
      } finally {
        server.stop()
      }
    })

    it('content types list returns HTML', async () => {
      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/admin/content-types`)
        assert.equal(res.status, 200)
        const html = await res.text()
        assert.match(html, /Content Types/)
        assert.match(html, /New Type/)
      } finally {
        server.stop()
      }
    })

    it('new content type form returns HTML', async () => {
      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/admin/content-types/new`)
        assert.equal(res.status, 200)
        const html = await res.text()
        assert.match(html, /New Content Type/)
        assert.match(html, /<form/)
      } finally {
        server.stop()
      }
    })

    it('create content type via form POST', async () => {
      await createContentType(pg.sql, 'press-release', 'Press Release', [])

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const fd = new FormData()
        fd.append('slug', 'press-release-2')
        fd.append('label', 'Press Release 2')
        fd.append('fields', JSON.stringify([
          { name: 'content', type: 'richtext' },
        ]))
        fd.append('config', '{}')

        const res = await fetch(`${url}/admin/content-types`, {
          method: 'POST',
          body: fd,
          redirect: 'manual',
        })
        assert.equal(res.status, 303)

        const ct = await getContentType(pg.sql, 'press-release-2')
        assert.ok(ct)
        assert.equal(ct.label, 'Press Release 2')
      } finally {
        server.stop()
      }
    })

    it('entry list page returns HTML', async () => {
      await createContentType(pg.sql, 'list-page', 'List Page', [])
      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/admin/content/list-page`)
        assert.equal(res.status, 200)
        const html = await res.text()
        assert.match(html, /List Page/)
      } finally {
        server.stop()
      }
    })

    it('create entry via form', async () => {
      await createContentType(pg.sql, 'form-entry', 'Form Entry', [
        { name: 'body', type: 'richtext' },
        { name: 'count', type: 'integer' },
      ])

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const fd = new FormData()
        fd.append('title', 'My Form Entry')
        fd.append('slug', 'my-form-entry')
        fd.append('data[body]', 'Hello World')
        fd.append('data[count]', '42')

        const res = await fetch(`${url}/admin/content/form-entry`, {
          method: 'POST',
          body: fd,
          redirect: 'manual',
        })
        assert.equal(res.status, 303)

        const entry = await getEntryBySlug(pg.sql, 'form-entry', 'my-form-entry')
        assert.ok(entry)
        assert.equal(entry.title, 'My Form Entry')
        assert.equal(entry.data.body, 'Hello World')
        assert.equal(entry.data.count, 42)
      } finally {
        server.stop()
      }
    })

    it('publish entry via admin', async () => {
      await createContentType(pg.sql, 'pub-admin', 'Pub Admin', [])
      const e = await createEntry(pg.sql, { contentType: 'pub-admin', slug: 'pub-me', title: 'Pub Me', entryData: {} })

      const handler = cmsModule.handler()
      const { server, url } = await createTestServer(handler)
      try {
        await server.ready
        const res = await fetch(`${url}/admin/content/pub-admin/${e.id}/publish`, {
          method: 'POST',
          redirect: 'manual',
        })
        assert.equal(res.status, 303)

        const entry = await getEntry(pg.sql, e.id)
        assert.equal(entry!.status, 'published')
      } finally {
        server.stop()
      }
    })
  })
})
