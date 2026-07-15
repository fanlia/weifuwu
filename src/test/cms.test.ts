import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { user } from '../user/index.ts'
import { cms } from '../cms/index.ts'
import type { Context, Handler } from '../types.ts'

const TABLE_PREFIX = '__test_cms_' + Math.random().toString(36).slice(2, 6) + '_'
const USER_TABLE = '__test_cms_users_' + Math.random().toString(36).slice(2, 6)
const TEST_SECRET = 'test-secret-for-cms'

describe('cms module', () => {
  const pg = postgres()
  const userMw = user({ secret: TEST_SECRET, table: USER_TABLE })
  const cm = cms({ tablePrefix: TABLE_PREFIX, usersTable: USER_TABLE })

  async function withCtx(role: string = 'admin'): Promise<{
    api: import('../cms/types.ts').CMSAPI
    ctx: Context
    userId: string
  }> {
    const name = `User_${role}_${Math.random().toString(36).slice(2, 6)}`
    const email = `${name}@cms.test`

    // Create user in user module's table
    const userCtx: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwUser = userMw as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    let userId = ''
    await mwUser(new Request('http://localhost/'), userCtx, async (_, c2) => {
      const u = await c2.userModule.register({ email, name, password: 'pw', role })
      userId = u.user.id
      return new Response('ok')
    })

    // Now create CMS context with this user
    const c: Context = {
      params: {}, query: {},
      sql: pg.sql,
      user: { id: userId, name, email, role },
    } as unknown as Context
    let api!: import('../cms/types.ts').CMSAPI
    const mwCms = cm as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwCms(new Request('http://localhost/'), c, async (_, c2) => {
      api = c2.cms
      return new Response('ok')
    })

    return { api, ctx: c, userId }
  }

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}contents_tags"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}tags"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}contents"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${USER_TABLE}"`)
    await pg.close()
  })

  // ═══════════════════════════════════════════════════════════
  // Create
  // ═══════════════════════════════════════════════════════════

  it('creates a published post', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({
      title: 'Hello World',
      type: 'post',
      body: 'This is my first post.',
      status: 'published',
      tags: ['intro', 'hello'],
    })

    assert.ok(post.id)
    assert.equal(post.slug, 'hello-world')
    assert.equal(post.title, 'Hello World')
    assert.equal(post.type, 'post')
    assert.equal(post.body, 'This is my first post.')
    assert.equal(post.status, 'published')
    assert.ok(post.published_at)
    assert.ok(post.tags)
    assert.equal(post.tags!.length, 2)
  })

  it('creates a draft post', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({
      title: 'Draft Post',
      type: 'post',
      body: 'Not ready yet.',
    })

    assert.equal(post.status, 'draft')
    assert.equal(post.published_at, null)
  })

  it('non-admin cannot create content', async () => {
    const { api } = await withCtx('user')
    await assert.rejects(
      () => api.create({ title: 'Hack', type: 'post', body: 'evil' }),
    )
  })

  it('auto-generates slug from title', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({
      title: 'My Awesome Post!',
      type: 'post',
      body: 'Content',
    })
    assert.equal(post.slug, 'my-awesome-post')
  })

  it('appends suffix for duplicate slug within same type', async () => {
    const { api } = await withCtx('admin')
    const p1 = await api.create({ title: 'Same Title', type: 'post', body: 'one' })
    const p2 = await api.create({ title: 'Same Title', type: 'post', body: 'two' })
    assert.equal(p1.slug, 'same-title')
    assert.match(p2.slug, /^same-title-\d+$/)
  })

  // ═══════════════════════════════════════════════════════════
  // List
  // ═══════════════════════════════════════════════════════════

  it('lists published posts', async () => {
    const { api } = await withCtx('admin')
    // Use a different user for list to test isolation
    const posts = await api.list({ type: 'post', status: 'published' })
    assert.ok(posts.length >= 1)
    for (const p of posts) {
      assert.equal(p.status, 'published')
    }
  })

  it('non-admin only sees published content', async () => {
    const { api } = await withCtx('user') // non-admin
    const posts = await api.list({ type: 'post' })
    for (const p of posts) {
      assert.equal(p.status, 'published')
    }
  })

  it('filters by tag', async () => {
    const { api } = await withCtx('admin')
    const tagged = await api.list({ type: 'post', tag: 'intro' })
    assert.ok(tagged.length >= 1)
    for (const p of tagged) {
      assert.ok(p.tags?.some(t => t.slug === 'intro'))
    }
  })

  it('paginates with cursor', async () => {
    const { api } = await withCtx('admin')
    const page1 = await api.list({ type: 'post', limit: 1 })
    assert.ok(page1.length <= 1)

    if (page1.length === 1) {
      const page2 = await api.list({ type: 'post', before: page1[0].id, limit: 10 })
      assert.ok(Array.isArray(page2))
    }
  })

  // ═══════════════════════════════════════════════════════════
  // Get
  // ═══════════════════════════════════════════════════════════

  it('gets content by slug', async () => {
    const { api } = await withCtx('admin')
    const post = await api.get('hello-world')
    assert.ok(post)
    assert.equal(post!.title, 'Hello World')
    assert.ok(post!.tags)
  })

  it('returns null for non-existent slug', async () => {
    const { api } = await withCtx('admin')
    const result = await api.get('non-existent-slug')
    assert.equal(result, null)
  })

  it('non-admin cannot see drafts', async () => {
    const { api: apiAdmin } = await withCtx('admin')
    const draft = await apiAdmin.create({ title: 'Secret', type: 'post', body: 'shh' })

    const { api: apiUser } = await withCtx('user')
    const result = await apiUser.get(draft.slug)
    assert.equal(result, null)
  })

  it('gets content by id', async () => {
    const { api } = await withCtx('admin')
    const posts = await api.list({ type: 'post', limit: 1 })
    if (posts.length > 0) {
      const found = await api.getById(posts[0].id)
      assert.ok(found)
      assert.equal(found!.id, posts[0].id)
    }
  })

  // ═══════════════════════════════════════════════════════════
  // Update
  // ═══════════════════════════════════════════════════════════

  it('updates content fields', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({ title: 'To Update', type: 'post', body: 'original' })

    const updated = await api.update(post.id, { title: 'Updated Title', body: 'new body' })
    assert.ok(updated)
    assert.equal(updated!.title, 'Updated Title')
    assert.equal(updated!.body, 'new body')
  })

  it('updates tags', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({ title: 'Tag Test', type: 'post', body: 'tags', tags: ['old'] })

    const updated = await api.update(post.id, { tags: ['new', 'updated'] })
    assert.ok(updated)
    assert.equal(updated!.tags!.length, 2)
    assert.ok(updated!.tags!.some(t => t.slug === 'new'))
  })

  it('returns null when updating non-existent id', async () => {
    const { api } = await withCtx('admin')
    const result = await api.update('00000000-0000-0000-0000-000000000000', { title: 'Nope' })
    assert.equal(result, null)
  })

  it('non-admin cannot update', async () => {
    const { api: apiAdmin } = await withCtx('admin')
    const post = await apiAdmin.create({ title: 'Protected', type: 'post', body: 'x' })

    const { api: apiUser } = await withCtx('user')
    await assert.rejects(
      () => apiUser.update(post.id, { title: 'Hacked' }),
    )
  })

  // ═══════════════════════════════════════════════════════════
  // Delete
  // ═══════════════════════════════════════════════════════════

  it('deletes content', async () => {
    const { api } = await withCtx('admin')
    const post = await api.create({ title: 'To Delete', type: 'post', body: 'bye' })
    const deleted = await api.delete(post.id)
    assert.equal(deleted, true)

    const found = await api.getById(post.id)
    assert.equal(found, null)
  })

  it('non-admin cannot delete', async () => {
    const { api: apiAdmin } = await withCtx('admin')
    const post = await apiAdmin.create({ title: 'Safe', type: 'post', body: 'x' })

    const { api: apiUser } = await withCtx('user')
    await assert.rejects(
      () => apiUser.delete(post.id),
    )
  })

  it('returns false when deleting non-existent', async () => {
    const { api } = await withCtx('admin')
    const result = await api.delete('00000000-0000-0000-0000-000000000000')
    assert.equal(result, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Publish / Unpublish
  // ═══════════════════════════════════════════════════════════

  it('publishes a draft', async () => {
    const { api } = await withCtx('admin')
    const draft = await api.create({ title: 'To Publish', type: 'post', body: 'draft' })
    assert.equal(draft.status, 'draft')

    const published = await api.publish(draft.id)
    assert.ok(published)
    assert.equal(published!.status, 'published')
    assert.ok(published!.published_at)
  })

  it('unpublishes a post', async () => {
    const { api } = await withCtx('admin')
    const published = await api.create({ title: 'To Unpublish', type: 'post', body: 'x', status: 'published' })
    assert.equal(published.status, 'published')

    const draft = await api.unpublish(published.id)
    assert.ok(draft)
    assert.equal(draft!.status, 'draft')
  })

  // ═══════════════════════════════════════════════════════════
  // Tags
  // ═══════════════════════════════════════════════════════════

  it('lists all tags with content count', async () => {
    const { api } = await withCtx('admin')
    const tags = await api.listTags()

    assert.ok(Array.isArray(tags))
    const introTag = tags.find(t => t.slug === 'intro')
    assert.ok(introTag)
    assert.ok(introTag!.content_count >= 1)
  })

  it('creates a tag', async () => {
    const { api } = await withCtx('admin')
    const tag = await api.createTag('New Tag')
    assert.ok(tag.id)
    assert.equal(tag.slug, 'new-tag')

    // Idempotent
    const tag2 = await api.createTag('New Tag')
    assert.equal(tag.id, tag2.id)
  })

  it('deletes a tag', async () => {
    const { api } = await withCtx('admin')
    const tag = await api.createTag('Temp Tag')
    const deleted = await api.deleteTag(tag.id)
    assert.equal(deleted, true)

    const result = await api.deleteTag(tag.id)
    assert.equal(result, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Tree / parent-child
  // ═══════════════════════════════════════════════════════════

  it('creates content with parent', async () => {
    const { api } = await withCtx('admin')
    const parent = await api.create({ title: 'Parent', type: 'doc', body: 'parent' })
    const child = await api.create({ title: 'Child', type: 'doc', body: 'child', parent_id: parent.id })

    assert.equal(child.parent_id, parent.id)

    // List children
    const children = await api.list({ type: 'doc', parent_id: parent.id })
    assert.equal(children.length, 1)
    assert.equal(children[0].id, child.id)
  })

  // ═══════════════════════════════════════════════════════════
  // Auth failure
  // ═══════════════════════════════════════════════════════════

  it('throws when ctx.user is missing on write operations', async () => {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwCms = cm as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwCms(new Request('http://localhost/'), c, async (_, c2) => {
      await assert.rejects(
        () => c2.cms.create({ title: 'No User', type: 'post', body: 'x' }),
      )
      return new Response('ok')
    })
  })
})
