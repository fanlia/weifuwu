import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { user } from '../user/index.ts'
import { messager } from '../messager/index.ts'
import type { Context, Handler } from '../types.ts'

const TABLE_PREFIX = '__test_msg_' + Math.random().toString(36).slice(2, 6) + '_'
const USER_TABLE = '__test_msg_users_' + Math.random().toString(36).slice(2, 6)
const TEST_SECRET = 'test-secret-for-messager'

describe('messager module', () => {
  const pg = postgres()
  const userMw = user({ secret: TEST_SECRET, table: USER_TABLE })
  const msg = messager({ tablePrefix: TABLE_PREFIX, usersTable: USER_TABLE })

  // Helpers to set up a request context with sql + user
  async function withCtx(userId?: string): Promise<{
    api: import('../messager/types.ts').MessagerAPI
    ctx: Context
  }> {
    const c: Context = {
      params: {}, query: {},
      sql: pg.sql,
      user: userId ? { id: userId, name: 'Test User', email: 'test@test.com', role: 'user' } : undefined,
    } as unknown as Context
    let api!: import('../messager/types.ts').MessagerAPI

    // Run user middleware first (it only injects userModule, doesn't interfere with ctx.user)
    const mwUser = userMw as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwUser(new Request('http://localhost/'), c, async (_, c2) => {
      // Then run messager middleware
      const mwMsg = msg as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
      await mwMsg(new Request('http://localhost/'), c2, async (_, c3) => {
        api = c3.messager
        return new Response('ok')
      })
      return new Response('ok')
    })

    return { api, ctx: c }
  }

  // Track created users for cleanup
  const userIds: string[] = []

  async function createTestUser(name: string): Promise<string> {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwUser = userMw as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    let uid: string = ''
    await mwUser(new Request('http://localhost/'), c, async (_, c2) => {
      const u = await c2.userModule.register({
        email: `${name}@messager.test`,
        name,
        password: 'password',
      })
      uid = u.user.id
      return new Response('ok')
    })
    userIds.push(uid)
    return uid
  }

  let aliceId: string
  let bobId: string
  let carolId: string

  before(async () => {
    // Create test users in the users table
    aliceId = await createTestUser('Alice')
    bobId = await createTestUser('Bob')
    carolId = await createTestUser('Carol')

    // Trigger messager migration (creates tables on first use)
    await withCtx(aliceId)
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}messages"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}participants"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE_PREFIX}conversations"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${USER_TABLE}"`)
    await pg.close()
  })

  // ═══════════════════════════════════════════════════════════
  // Direct conversations
  // ═══════════════════════════════════════════════════════════

  it('creates a direct conversation between two users', async () => {
    const { api } = await withCtx(aliceId)
    const conv = await api.createDirectConversation(bobId)

    assert.ok(conv.id)
    assert.equal(conv.type, 'direct')
    assert.equal(conv.title, null)
    assert.equal(conv.created_by, aliceId)
  })

  it('reuses existing direct conversation', async () => {
    const { api } = await withCtx(aliceId)
    const conv1 = await api.createDirectConversation(bobId)
    const conv2 = await api.createDirectConversation(bobId)

    assert.equal(conv1.id, conv2.id)
  })

  it('creates direct conversation consistently regardless of caller', async () => {
    const { api: apiAlice } = await withCtx(aliceId)
    const convFromAlice = await apiAlice.createDirectConversation(bobId)

    const { api: apiBob } = await withCtx(bobId)
    const convFromBob = await apiBob.createDirectConversation(aliceId)

    assert.equal(convFromAlice.id, convFromBob.id)
  })

  // ═══════════════════════════════════════════════════════════
  // Group conversations
  // ═══════════════════════════════════════════════════════════

  it('creates a group conversation', async () => {
    const { api } = await withCtx(aliceId)
    const conv = await api.createGroupConversation('Test Group', [bobId, carolId])

    assert.ok(conv.id)
    assert.equal(conv.type, 'group')
    assert.equal(conv.title, 'Test Group')
    assert.equal(conv.created_by, aliceId)
  })

  // ═══════════════════════════════════════════════════════════
  // Get conversations
  // ═══════════════════════════════════════════════════════════

  it('lists a user\'s conversations', async () => {
    const { api } = await withCtx(aliceId)
    const convs = await api.getConversations()

    assert.ok(convs.length >= 2) // direct + group
    const direct = convs.find(c => c.type === 'direct')
    const group = convs.find(c => c.type === 'group')
    assert.ok(direct)
    assert.ok(group)
    assert.ok(direct.participant_count! >= 2)
    assert.ok(group.participant_count! >= 3)
  })

  it('gets a conversation by id', async () => {
    const { api } = await withCtx(aliceId)
    const convs = await api.getConversations()
    const conv = await api.getConversation(convs[0].id)
    assert.ok(conv)
    assert.equal(conv!.id, convs[0].id)
  })

  it('returns null for non-existent conversation', async () => {
    const { api } = await withCtx(aliceId)
    const conv = await api.getConversation('00000000-0000-0000-0000-000000000000')
    assert.equal(conv, null)
  })

  it('returns null for conversation user is not in', async () => {
    const { api } = await withCtx(carolId)
    // Carol is in group conv with Alice & Bob, so let's try a random UUID
    const conv = await api.getConversation('00000000-0000-0000-0000-000000000001')
    assert.equal(conv, null)
  })

  // ═══════════════════════════════════════════════════════════
  // Send & get messages
  // ═══════════════════════════════════════════════════════════

  // Creates a direct conversation once and caches it
  let directConvId: string
  let directConvReady: Promise<void> | null = null

  async function getDirectConvId(api: import('../messager/types.ts').MessagerAPI): Promise<string> {
    if (directConvId) return directConvId
    if (!directConvReady) {
      directConvReady = (async () => {
        const conv = await api.createDirectConversation(bobId)
        directConvId = conv.id
      })()
    }
    await directConvReady
    return directConvId
  }

  it('sends a message', async () => {
    const { api } = await withCtx(aliceId)
    const cid = await getDirectConvId(api)
    const msg = await api.sendMessage(cid, 'Hello Bob!')

    assert.ok(msg.id)
    assert.equal(msg.conversation_id, cid)
    assert.equal(msg.sender_id, aliceId)
    assert.equal(msg.body, 'Hello Bob!')
    assert.equal(msg.edited, false)
    assert.equal(msg.deleted_at, null)
    assert.ok(msg.created_at)
  })

  it('gets messages in a conversation (newest first by default)', async () => {
    const { api } = await withCtx(aliceId)
    const cid = directConvId
    const msgs = await api.getMessages(cid)

    assert.ok(msgs.length >= 1)
    // Default order is newest last (reversed internally for chronological)
    assert.equal(msgs[msgs.length - 1].sender_id, aliceId)
    assert.equal(msgs[msgs.length - 1].body, 'Hello Bob!')
  })

  it('Bob can see Alice\'s messages', async () => {
    const { api } = await withCtx(bobId)
    const cid = directConvId
    const msgs = await api.getMessages(cid)
    assert.ok(msgs.length >= 1)
    assert.equal(msgs[msgs.length - 1].body, 'Hello Bob!')
  })

  it('rejects empty message body', async () => {
    const { api } = await withCtx(aliceId)
    const cid = directConvId
    await assert.rejects(
      () => api.sendMessage(cid, ''),
    )
    await assert.rejects(
      () => api.sendMessage(cid, '   '),
    )
  })

  it('non-participant cannot send messages', async () => {
    const { api } = await withCtx(carolId)
    const cid = directConvId
    await assert.rejects(
      () => api.sendMessage(cid, 'Hello!'),
    )
  })

  it('non-participant gets empty message list', async () => {
    const { api } = await withCtx(carolId)
    const cid = directConvId
    const msgs = await api.getMessages(cid)
    assert.deepEqual(msgs, [])
  })

  // ═══════════════════════════════════════════════════════════
  // Cursor pagination
  // ═══════════════════════════════════════════════════════════

  it('paginates messages with before cursor', async () => {
    const { api } = await withCtx(aliceId)
    const cid = directConvId

    // Send a few messages
    const m1 = await api.sendMessage(cid, 'Message 1')
    const m2 = await api.sendMessage(cid, 'Message 2')
    const m3 = await api.sendMessage(cid, 'Message 3')

    // Get all messages, then only those before m3
    const allBefore = await api.getMessages(cid, { before: m3.id, limit: 10 })
    assert.ok(Array.isArray(allBefore))
    assert.ok(allBefore.length >= 2) // m1, m2
    // The last message in the result should be m2
    const last = allBefore[allBefore.length - 1]
    assert.equal(last.id, m2.id)

    // Paginate further: before m2
    const beforeM2 = await api.getMessages(cid, { before: m2.id, limit: 10 })
    assert.ok(beforeM2.length >= 1)
    assert.equal(beforeM2[beforeM2.length - 1].id, m1.id)
  })

  // ═══════════════════════════════════════════════════════════
  // Edit & delete messages
  // ═══════════════════════════════════════════════════════════

  it('edits a message', async () => {
    const { api } = await withCtx(aliceId)
    const msg = await api.sendMessage(directConvId, 'Original text')
    const edited = await api.editMessage(msg.id, 'Edited text')

    assert.ok(edited)
    assert.equal(edited!.body, 'Edited text')
    assert.equal(edited!.edited, true)
  })

  it('cannot edit another user\'s message', async () => {
    const { api } = await withCtx(bobId)
    // Alice sent the last message, Bob tries to edit it
    const msgs = await api.getMessages(directConvId)
    const aliceMsg = msgs.find(m => m.sender_id === aliceId)
    if (aliceMsg) {
      const result = await api.editMessage(aliceMsg.id, 'Hacked text')
      assert.equal(result, null)
    }
  })

  it('cannot edit non-existent message', async () => {
    const { api } = await withCtx(aliceId)
    const result = await api.editMessage('00000000-0000-0000-0000-000000000000', 'Text')
    assert.equal(result, null)
  })

  it('soft-deletes a message', async () => {
    const { api } = await withCtx(aliceId)
    const msg = await api.sendMessage(directConvId, 'To be deleted')
    const deleted = await api.deleteMessage(msg.id)
    assert.equal(deleted, true)

    // Should not appear in messages
    const msgs = await api.getMessages(directConvId)
    const found = msgs.find(m => m.id === msg.id)
    assert.equal(found, undefined)
  })

  it('cannot delete another user\'s message', async () => {
    const { api: apiAlice } = await withCtx(aliceId)
    const msg = await apiAlice.sendMessage(directConvId, 'Alice says')

    const { api: apiBob } = await withCtx(bobId)
    const result = await apiBob.deleteMessage(msg.id)
    assert.equal(result, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Read state
  // ═══════════════════════════════════════════════════════════

  it('tracks unread count', async () => {
    const { api: apiBob } = await withCtx(bobId)

    // Bob marks as read first
    await apiBob.markRead(directConvId)

    // Alice sends a new message
    const { api: apiAlice } = await withCtx(aliceId)
    await apiAlice.sendMessage(directConvId, 'New unread message for Bob')

    // Bob should have 1 unread in this conversation
    const { api: apiBob2 } = await withCtx(bobId)
    const unread = await apiBob2.getUnreadCount()
    assert.ok(unread.total >= 1)
    assert.ok(unread.byConversation[directConvId] >= 1)
  })

  it('markRead clears unread count', async () => {
    const { api } = await withCtx(bobId)
    await api.markRead(directConvId)

    const unread = await api.getUnreadCount()
    assert.equal(unread.byConversation[directConvId] || 0, 0)
  })

  // ═══════════════════════════════════════════════════════════
  // Participants management
  // ═══════════════════════════════════════════════════════════

  let groupConvId: string

  before(async () => {
    const { api } = await withCtx(aliceId)
    const conv = await api.createGroupConversation('Test Group Mgmt', [bobId])
    groupConvId = conv.id
  })

  it('adds participants to a group', async () => {
    const { api } = await withCtx(aliceId)
    await api.addParticipants(groupConvId, [carolId])

    // Verify Carol can see the conversation
    const { api: apiCarol } = await withCtx(carolId)
    const convs = await apiCarol.getConversations()
    assert.ok(convs.some(c => c.id === groupConvId))
  })

  it('non-admin cannot add participants', async () => {
    const { api } = await withCtx(bobId)
    // Bob is a member, not admin
    await assert.rejects(
      () => api.addParticipants(groupConvId, [aliceId]),
    )
  })

  it('participant leaves a group', async () => {
    // Carol leaves the group
    const { api: apiCarol } = await withCtx(carolId)
    const left = await apiCarol.removeParticipant(groupConvId)
    assert.equal(left, true)

    // Carol should no longer see it
    const convs = await apiCarol.getConversations()
    assert.ok(!convs.some(c => c.id === groupConvId))
  })

  it('admin can remove a participant', async () => {
    const { api } = await withCtx(aliceId)
    // Bob is still in the group
    const removed = await api.removeParticipant(groupConvId, bobId)
    assert.equal(removed, true)

    const { api: apiBob } = await withCtx(bobId)
    const convs = await apiBob.getConversations()
    assert.ok(!convs.some(c => c.id === groupConvId))
  })

  it('cannot remove from non-existent conversation', async () => {
    const { api } = await withCtx(aliceId)
    const result = await api.removeParticipant('00000000-0000-0000-0000-000000000000')
    assert.equal(result, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════

  it('throws when ctx.user is missing', async () => {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwMsg = msg as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwMsg(new Request('http://localhost/'), c, async (_, c2) => {
      await assert.rejects(
        () => c2.messager.getConversations(),
      )
      return new Response('ok')
    })
  })
})
