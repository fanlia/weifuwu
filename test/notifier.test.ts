 
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { notifier } from '../notifier/index.ts'
import { postgres } from '../postgres/index.ts'

const TEST_DB = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

describe('notifier', { skip: !TEST_DB }, () => {
  let pg: ReturnType<typeof postgres>
  let n: ReturnType<typeof notifier>

  before(async () => {
    pg = postgres({ connection: TEST_DB })
    n = notifier({ sql: pg.sql })
    await n.migrate()
  })

  after(async () => {
    // Clean up test data
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_notifications" CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_notify_prefs" CASCADE`)
    await pg.close()
  })

  it('should send and retrieve notifications', async () => {
    await n.send(
      { userId: 1, email: 'test@example.com' },
      { title: 'Welcome!', body: 'Thanks for joining', type: 'onboarding' },
    )

    const list = await n.list(1)
    assert.equal(list.length, 1)
    assert.equal(list[0].title, 'Welcome!')
    assert.equal(list[0].body, 'Thanks for joining')
    assert.equal(list[0].type, 'onboarding')
    assert.equal(list[0].read_at, null)
  })

  it('should track unread count', async () => {
    await n.send({ userId: 2 }, { title: 'Alert', body: 'Something happened' })
    await n.send({ userId: 2 }, { title: 'Reminder', body: 'Check your inbox' })

    const count = await n.unreadCount(2)
    assert.equal(count, 2)
  })

  it('should mark notifications as read', async () => {
    await n.send({ userId: 3 }, { title: 'Read me', body: 'Please read' })

    const before = await n.unreadCount(3)
    assert.equal(before, 1)

    const list = await n.list(3)
    await n.markRead(3, [list[0].id])

    const after = await n.unreadCount(3)
    assert.equal(after, 0)
  })

  it('should mark all notifications as read when no ids given', async () => {
    await n.send({ userId: 4 }, { title: 'A' })
    await n.send({ userId: 4 }, { title: 'B' })

    assert.equal(await n.unreadCount(4), 2)
    await n.markRead(4)
    assert.equal(await n.unreadCount(4), 0)
  })

  it('should list only unread notifications', async () => {
    await n.send({ userId: 5 }, { title: 'Unread item' })
    await n.send({ userId: 5 }, { title: 'Will be read' })

    const all = await n.list(5)
    await n.markRead(5, [all[0].id])

    const unread = await n.list(5, { unreadOnly: true })
    assert.equal(unread.length, 1)
    assert.equal(unread[0].title, 'Unread item')
  })

  it('should support pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await n.send({ userId: 6 }, { title: `Notification ${i}` })
    }

    const page1 = await n.list(6, { limit: 2, offset: 0 })
    assert.equal(page1.length, 2)
    assert.equal(page1[0].title, 'Notification 4')

    const page2 = await n.list(6, { limit: 2, offset: 2 })
    assert.equal(page2.length, 2)
    assert.equal(page2[0].title, 'Notification 2')
  })

  it('should get and set preferences', async () => {
    const prefs = await n.getPreferences(100)
    assert.deepEqual(prefs.channels, ['inbox'])

    await n.setPreferences(100, { channels: ['inbox', 'email'] })
    const updated = await n.getPreferences(100)
    assert.deepEqual(updated.channels, ['inbox', 'email'])
  })

  it('should respect channel preferences (only inbox)', async () => {
    await n.setPreferences(200, { channels: ['inbox'] })
    await n.send({ userId: 200 }, { title: 'Inbox only', body: 'test' })

    const items = await n.list(200)
    assert.equal(items.length, 1)
    assert.equal(items[0].title, 'Inbox only')
  })

  it('should count total and unread', async () => {
    await n.send({ userId: 7 }, { title: 'Total count test' })

    const total = await n.count(7)
    const unread = await n.count(7, true)
    assert.equal(total, 1)
    assert.equal(unread, 1)

    const all = await n.list(7)
    await n.markRead(7, [all[0].id])

    const totalAfter = await n.count(7)
    const unreadAfter = await n.count(7, true)
    assert.equal(totalAfter, 1)
    assert.equal(unreadAfter, 0)
  })

  it('should handle metadata as JSON', async () => {
    await n.send(
      { userId: 8 },
      {
        title: 'With metadata',
        metadata: { source: 'test', priority: 'high', tags: ['a', 'b'] },
      },
    )

    const items = await n.list(8)
    assert.equal(items.length, 1)
    assert.deepEqual(items[0].metadata, { source: 'test', priority: 'high', tags: ['a', 'b'] })
  })

  it('should broadcast to all users with inbox enabled', async () => {
    await n.setPreferences(300, { channels: ['inbox'] })
    await n.setPreferences(301, { channels: ['inbox', 'email'] })
    await n.setPreferences(302, { channels: ['ws'] }) // no inbox

    await n.broadcast({ title: 'Announcement', body: 'System update' })

    const u300 = await n.list(300)
    const u301 = await n.list(301)
    const u302 = await n.list(302)

    assert.equal(u300.length, 1, 'user with inbox should get it')
    assert.equal(u301.length, 1, 'user with inbox+email should get it')
    assert.equal(u302.length, 0, 'user without inbox should NOT get it')
  })
})
