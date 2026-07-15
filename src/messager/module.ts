/**
 * Messager — instant messaging module for weifuwu.
 *
 * Depends on `postgres()` and `user()` middleware registered first.
 *
 * ```ts
 * import { serve, Router, postgres, user, messager } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 *
 * app.ws('/ws', {
 *   async open(ws, ctx) {
 *     for (const c of await ctx.messager.getConversations()) {
 *       ctx.ws.join(`conversation:${c.id}`)
 *     }
 *   },
 * })
 *
 * app.post('/api/messages', async (req, ctx) => {
 *   const { conversationId, body } = await req.json()
 *   const msg = await ctx.messager.sendMessage(conversationId, body)
 *   return Response.json(msg, { status: 201 })
 * })
 * ```
 */

import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  MessagerAPI,
  MessagerOptions,
  Conversation,
  ConversationType,
  Participant,
  ParticipantUser,
  Message,
  MessagePreview,
  CreateGroupInput,
  GetMessagesOptions,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

// ═══════════════════════════════════════════════════════════════
// Row mapping helpers
// ═══════════════════════════════════════════════════════════════

function toConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    type: row.type as ConversationType,
    title: row.title as string | null,
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    participant_count: row.participant_count as number | undefined,
    last_message: row.last_message ? (row.last_message as unknown as MessagePreview) : undefined,
    unread_count: row.unread_count as number | undefined,
  }
}

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    sender_id: row.sender_id as string,
    sender_name: row.sender_name as string | undefined,
    body: row.body as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    edited: row.edited as boolean,
    deleted_at: row.deleted_at as Date | null,
  }
}

function toParticipantUser(row: Record<string, unknown>): ParticipantUser {
  return {
    conversation_id: row.conversation_id as string,
    user_id: row.user_id as string,
    role: row.role as 'member' | 'admin',
    last_read_at: row.last_read_at as Date | null,
    joined_at: row.joined_at as Date,
    is_active: row.is_active as boolean,
    user_name: row.user_name as string,
    user_email: row.user_email as string,
    user_avatar: row.user_avatar as string | undefined,
  }
}

function getSql(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) {
    throw new Error(
      'messager() requires postgres() middleware to be registered first.',
    )
  }
  return sql
}

// ═══════════════════════════════════════════════════════════════
// Messager implementation
// ═══════════════════════════════════════════════════════════════

export class Messager {
  private migrated = false
  private prefix: string
  private usersTable: string

  constructor(opts?: MessagerOptions) {
    this.prefix = opts?.tablePrefix ?? ''
    this.usersTable = opts?.usersTable ?? 'users'
  }

  // ── Table names ────────────────────────────────────────────

  private get tConversations() { return `"${this.prefix}conversations"` }
  private get tParticipants() { return `"${this.prefix}participants"` }
  private get tMessages() { return `"${this.prefix}messages"` }
  private get tUsers() { return `"${this.usersTable}"` }

  private q(name: string): string {
    return `"${this.prefix}${name}"`
  }

  // ── Migration ──────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('conversations')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type        TEXT NOT NULL CHECK (type IN ('direct', 'group')),
        title       TEXT,
        created_by  UUID NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('conversations_updated_idx')}
        ON ${this.q('conversations')} (updated_at DESC)
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('participants')} (
        conversation_id UUID NOT NULL REFERENCES ${this.q('conversations')}(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL,
        role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
        last_read_at    TIMESTAMPTZ,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (conversation_id, user_id)
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('participants_user_idx')}
        ON ${this.q('participants')} (user_id, is_active)
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('messages')} (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES ${this.q('conversations')}(id) ON DELETE CASCADE,
        sender_id       UUID NOT NULL,
        body            TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        edited          BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at      TIMESTAMPTZ
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('messages_conv_idx')}
        ON ${this.q('messages')} (conversation_id, created_at DESC)
    `)

    this.migrated = true
  }

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  // ── Per-request bound API ──────────────────────────────────

  bind(ctx: Context): MessagerAPI {
    const self = this
    const sql = getSql(ctx)

    // Auto-migrate on first request
    if (!this.migrated) {
      this.migrate(sql).catch(() => {})
    }

    // Helper: get current user id from ctx
    function currentUserId(): string {
      const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
      if (!u?.id) throw new Error('messager() requires user() middleware — ctx.user is missing')
      return u.id as string
    }

    // Helper: broadcast to WebSocket room
    function broadcast(conversationId: string, event: string, data: unknown): void {
      try {
        const ws = (ctx as Record<string, unknown>).ws as Record<string, unknown> | undefined
        if (ws && typeof ws.sendRoom === 'function') {
          ;(ws.sendRoom as (room: string, data: unknown) => void)(`conversation:${conversationId}`, {
            type: event,
            ...(data as Record<string, unknown>),
          })
        }
      } catch {
        // Broadcast is best-effort — no WS connection is fine
      }
    }

    return {
      // ── Conversations ──────────────────────────────────────

      async createDirectConversation(otherUserId: string) {
        const me = currentUserId()
        const [meId, otherId] = me < otherUserId ? [me, otherUserId] : [otherUserId, me]

        await self.ensureMigrated(sql)

        // Check if direct conversation already exists between these two users
        const existing = await sql.unsafe(`
          SELECT c.id FROM ${self.q('conversations')} c
          WHERE c.type = 'direct'
            AND EXISTS (SELECT 1 FROM ${self.q('participants')} p1
                        WHERE p1.conversation_id = c.id AND p1.user_id = $1 AND p1.is_active = TRUE)
            AND EXISTS (SELECT 1 FROM ${self.q('participants')} p2
                        WHERE p2.conversation_id = c.id AND p2.user_id = $2 AND p2.is_active = TRUE)
          ORDER BY c.created_at ASC LIMIT 1
        `, [me, otherId]) as unknown as Record<string, unknown>[]

        if (existing.length > 0) {
          return self._getConversationById(existing[0].id as string, sql, me) as Promise<Conversation>
        }

        // Create new direct conversation
        const [conv] = await sql.unsafe(`
          INSERT INTO ${self.q('conversations')} (type, created_by) VALUES ('direct', $1) RETURNING *
        `, [me]) as unknown as Record<string, unknown>[]

        await sql.unsafe(`
          INSERT INTO ${self.q('participants')} (conversation_id, user_id, role)
          VALUES ($1, $2, 'member'), ($1, $3, 'member')
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `, [conv.id, me, otherId])

        return toConversation(conv)
      },

      async createGroupConversation(title: string, userIds: string[]) {
        const me = currentUserId()
        const all = [me, ...userIds.filter(id => id !== me)]

        await self.ensureMigrated(sql)

        const [conv] = await sql.unsafe(`
          INSERT INTO ${self.q('conversations')} (type, title, created_by)
          VALUES ('group', $1, $2) RETURNING *
        `, [title, me]) as unknown as Record<string, unknown>[]

        const values = all.map((uid, i) =>
          `($${i * 2 + 1}, $${i * 2 + 2}, ${uid === me ? "'admin'" : "'member'"})`
        ).join(', ')
        await sql.unsafe(`
          INSERT INTO ${self.q('participants')} (conversation_id, user_id, role)
          VALUES ${values}
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `, all.flatMap(uid => [conv.id, uid]))

        return toConversation(conv)
      },

      async getConversation(conversationId: string) {
        const me = currentUserId()
        await self.ensureMigrated(sql)
        return self._getConversationById(conversationId, sql, me)
      },

      async getConversations() {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT
            c.*,
            (SELECT COUNT(*) FROM ${self.q('participants')} p
             WHERE p.conversation_id = c.id AND p.is_active = TRUE) AS participant_count,
            (SELECT row_to_json(msg.*) FROM (
              SELECT m.id, m.body, m.sender_id, m.created_at,
                (SELECT u.name FROM ${self.tUsers} u WHERE u.id = m.sender_id) AS sender_name
              FROM ${self.q('messages')} m
              WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
              ORDER BY m.created_at DESC LIMIT 1
            ) msg) AS last_message,
            (SELECT COUNT(*) FROM ${self.q('messages')} m
             WHERE m.conversation_id = c.id
               AND m.deleted_at IS NULL
               AND m.created_at > COALESCE(p.last_read_at, '1970-01-01'::timestamptz)
               AND m.sender_id != $1) AS unread_count
          FROM ${self.q('conversations')} c
          JOIN ${self.q('participants')} p ON p.conversation_id = c.id AND p.user_id = $1 AND p.is_active = TRUE
          ORDER BY c.updated_at DESC
        `, [me]) as unknown as Record<string, unknown>[]

        return rows.map(toConversation)
      },

      async addParticipants(conversationId: string, userIds: string[]) {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        // Verify caller is an admin of this group conversation
        const [caller] = await sql.unsafe(`
          SELECT role FROM ${self.q('participants')}
          WHERE conversation_id = $1 AND user_id = $2 AND is_active = TRUE
        `, [conversationId, me]) as unknown as Record<string, unknown>[]

        if (!caller) throw new Error('Not a participant')
        if (caller.role !== 'admin') throw new Error('Only admins can add participants')

        const values = userIds.map((uid, i) =>
          `($1, $${i + 2}, 'member')`
        ).join(', ')
        await sql.unsafe(`
          INSERT INTO ${self.q('participants')} (conversation_id, user_id, role)
          VALUES ${values}
          ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_active = TRUE
        `, [conversationId, ...userIds])

        // Update conversation timestamp
        await sql.unsafe(`UPDATE ${self.q('conversations')} SET updated_at = NOW() WHERE id = $1`, [conversationId])
      },

      async removeParticipant(conversationId: string, targetUserId?: string) {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        const targetId = targetUserId ?? me

        // If removing someone else, caller must be admin
        if (targetId !== me) {
          const [caller] = await sql.unsafe(`
            SELECT role FROM ${self.q('participants')}
            WHERE conversation_id = $1 AND user_id = $2 AND is_active = TRUE
          `, [conversationId, me]) as unknown as Record<string, unknown>[]

          if (!caller || caller.role !== 'admin') throw new Error('Only admins can remove participants')
        }

        const [row] = await sql.unsafe(`
          UPDATE ${self.q('participants')} SET is_active = FALSE
          WHERE conversation_id = $1 AND user_id = $2 AND is_active = TRUE
          RETURNING user_id
        `, [conversationId, targetId]) as unknown as Record<string, unknown>[]

        if (row) {
          await sql.unsafe(`UPDATE ${self.q('conversations')} SET updated_at = NOW() WHERE id = $1`, [conversationId])
        }

        return !!row
      },

      // ── Messages ───────────────────────────────────────────

      async sendMessage(conversationId: string, body: string) {
        const me = currentUserId()
        if (!body.trim()) throw new Error('Message body cannot be empty')
        await self.ensureMigrated(sql)

        // Verify participant
        const [part] = await sql.unsafe(`
          SELECT user_id FROM ${self.q('participants')}
          WHERE conversation_id = $1 AND user_id = $2 AND is_active = TRUE
        `, [conversationId, me]) as unknown as Record<string, unknown>[]

        if (!part) throw new Error('Not a participant in this conversation')

        const [msg] = await sql.unsafe(`
          INSERT INTO ${self.q('messages')} (conversation_id, sender_id, body)
          VALUES ($1, $2, $3) RETURNING *
        `, [conversationId, me, body.trim()]) as unknown as Record<string, unknown>[]

        // Update conversation timestamp
        await sql.unsafe(`UPDATE ${self.q('conversations')} SET updated_at = NOW() WHERE id = $1`, [conversationId])

        const message = toMessage(msg)
        message.sender_name = (ctx as Record<string, unknown>).user
          ? ((ctx as Record<string, unknown>).user as Record<string, unknown>).name as string
          : undefined

        // Broadcast via WebSocket
        broadcast(conversationId, 'new_message', { message })

        return message
      },

      async getMessages(conversationId: string, opts?: GetMessagesOptions) {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        // Verify participant
        const [part] = await sql.unsafe(`
          SELECT user_id FROM ${self.q('participants')}
          WHERE conversation_id = $1 AND user_id = $2 AND is_active = TRUE
        `, [conversationId, me]) as unknown as Record<string, unknown>[]

        if (!part) return []

        const limit = Math.min(opts?.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

        let rows: Record<string, unknown>[]
        if (opts?.before) {
          // Get the created_at of the cursor message
          const [cursor] = await sql.unsafe(`
            SELECT created_at FROM ${self.q('messages')} WHERE id = $1
          `, [opts.before]) as unknown as Record<string, unknown>[]

          if (cursor) {
            rows = await sql.unsafe(`
              SELECT m.*, (SELECT u.name FROM ${self.tUsers} u WHERE u.id = m.sender_id) AS sender_name
              FROM ${self.q('messages')} m
              WHERE m.conversation_id = $1 AND m.deleted_at IS NULL AND m.created_at < $2
              ORDER BY m.created_at DESC LIMIT $3
            `, [conversationId, cursor.created_at, limit]) as unknown as Record<string, unknown>[]
          } else {
            rows = []
          }
        } else {
          rows = await sql.unsafe(`
            SELECT m.*, (SELECT u.name FROM ${self.tUsers} u WHERE u.id = m.sender_id) AS sender_name
            FROM ${self.q('messages')} m
            WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC LIMIT $2
          `, [conversationId, limit]) as unknown as Record<string, unknown>[]
        }

        return rows.map(toMessage).reverse()
      },

      async editMessage(messageId: string, body: string) {
        const me = currentUserId()
        if (!body.trim()) throw new Error('Message body cannot be empty')
        await self.ensureMigrated(sql)

        const [msg] = await sql.unsafe(`
          SELECT * FROM ${self.q('messages')} WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
        `, [messageId, me]) as unknown as Record<string, unknown>[]

        if (!msg) return null

        // Enforce 24h edit window
        const elapsed = Date.now() - new Date(msg.created_at as Date).getTime()
        if (elapsed > EDIT_WINDOW_MS) return null

        const [updated] = await sql.unsafe(`
          UPDATE ${self.q('messages')} SET body = $1, edited = TRUE, updated_at = NOW()
          WHERE id = $2 RETURNING *
        `, [body.trim(), messageId]) as unknown as Record<string, unknown>[]

        const message = toMessage(updated)
        broadcast(msg.conversation_id as string, 'edit_message', { message })

        return message
      },

      async deleteMessage(messageId: string) {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        const [msg] = await sql.unsafe(`
          SELECT * FROM ${self.q('messages')} WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
        `, [messageId, me]) as unknown as Record<string, unknown>[]

        if (!msg) return false

        await sql.unsafe(`
          UPDATE ${self.q('messages')} SET deleted_at = NOW() WHERE id = $1
        `, [messageId])

        broadcast(msg.conversation_id as string, 'delete_message', { messageId })

        return true
      },

      // ── Read state ──────────────────────────────────────

      async markRead(conversationId: string) {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        await sql.unsafe(`
          INSERT INTO ${self.q('participants')} (conversation_id, user_id, role, last_read_at)
          VALUES ($1, $2, 'member', NOW())
          ON CONFLICT (conversation_id, user_id)
          DO UPDATE SET last_read_at = NOW()
        `, [conversationId, me])
      },

      async getUnreadCount() {
        const me = currentUserId()
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT
            p.conversation_id,
            COUNT(m.id)::INT AS cnt
          FROM ${self.q('participants')} p
          JOIN ${self.q('messages')} m ON m.conversation_id = p.conversation_id
            AND m.deleted_at IS NULL
            AND m.created_at > COALESCE(p.last_read_at, '1970-01-01'::timestamptz)
            AND m.sender_id != $1
          WHERE p.user_id = $1 AND p.is_active = TRUE
          GROUP BY p.conversation_id
        `, [me]) as unknown as Record<string, unknown>[]

        const byConversation: Record<string, number> = {}
        let total = 0
        for (const row of rows) {
          const cnt = row.cnt as number
          byConversation[row.conversation_id as string] = cnt
          total += cnt
        }

        return { total, byConversation }
      },
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private async _getConversationById(id: string, sql: SqlClient, userId: string): Promise<Conversation | null> {
    const [row] = await sql.unsafe(`
      SELECT c.*,
        (SELECT COUNT(*) FROM ${this.q('participants')} p
         WHERE p.conversation_id = c.id AND p.is_active = TRUE) AS participant_count
      FROM ${this.q('conversations')} c
      JOIN ${this.q('participants')} p ON p.conversation_id = c.id AND p.user_id = $1 AND p.is_active = TRUE
      WHERE c.id = $2
    `, [userId, id]) as unknown as Record<string, unknown>[]

    return row ? toConversation(row) : null
  }

  // ── Middleware ─────────────────────────────────────────────

  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    ctx.messager = this.bind(ctx)
    return next(req, ctx)
  }
}
