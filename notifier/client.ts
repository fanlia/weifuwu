/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Context, Middleware } from '../types.ts'
import type {
  Notifier,
  NotifierOptions,
  NotifierInjected,
  NotifyMessage,
  Notification,
  NotifyPreferences,
  NotifyChannel,
} from './types.ts'

const DEFAULT_CHANNELS: NotifyChannel[] = ['inbox']

export function notifier(opts: NotifierOptions): Notifier {
  const { sql, mailer, hub } = opts
  const table = opts.table ?? '_notifications'
  const fromName = opts.fromName ?? 'System'
  const pageSize = opts.pageSize ?? 50

  function escapeIdent(s: string): string {
    return `"${s.replace(/"/g, '""')}"`
  }

  const tbl = escapeIdent(table)

  // ── Database setup ──────────────────────────────────────────────────

  async function migrate(): Promise<void> {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${tbl} (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        title       TEXT NOT NULL,
        body        TEXT NOT NULL DEFAULT '',
        action_url  TEXT,
        action_text TEXT,
        type        TEXT NOT NULL DEFAULT 'default',
        metadata    JSONB NOT NULL DEFAULT '{}',
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "${table}_user_unread"
      ON ${tbl} (user_id, created_at DESC)
      WHERE read_at IS NULL
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "${table}_user_all"
      ON ${tbl} (user_id, created_at DESC)
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_notify_prefs" (
        user_id  INTEGER PRIMARY KEY,
        channels JSONB NOT NULL DEFAULT '["inbox"]'::jsonb
      )
    `)
  }

  // ── Send notification ──────────────────────────────────────────────

  async function insertNotification(userId: number, message: NotifyMessage): Promise<void> {
    await sql.unsafe(
      `INSERT INTO ${tbl} (user_id, title, body, action_url, action_text, type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        message.title,
        message.body ?? '',
        message.actionUrl ?? null,
        message.actionText ?? null,
        message.type ?? 'default',
        message.metadata ?? {},
      ],
    )
  }

  async function send(
    to: { userId: number; email?: string },
    message: NotifyMessage,
  ): Promise<void> {
    const prefs = await getPreferences(to.userId)

    if (prefs.channels.includes('inbox')) {
      await insertNotification(to.userId, message)
    }

    if (prefs.channels.includes('email') && mailer && to.email) {
      const html = renderEmail(message)
      mailer
        .send({
          to: to.email,
          subject: message.title,
          text: message.body ?? '',
          html,
        })
        .catch((err) => console.error('[notifier] email send failed:', err.message))
    }

    if (prefs.channels.includes('ws') && hub) {
      hub.broadcast(`notify:${to.userId}`, {
        type: 'notification',
        data: {
          title: message.title,
          body: message.body,
          actionUrl: message.actionUrl,
          actionText: message.actionText,
          type: message.type ?? 'default',
          metadata: message.metadata,
          created_at: new Date().toISOString(),
        },
      })
    }
  }

  // ── Broadcast ───────────────────────────────────────────────────────

  async function broadcast(message: NotifyMessage): Promise<void> {
    // Use sql.json() for proper JSONB handling with @> operator
    const rows = await sql`
      SELECT user_id FROM "_notify_prefs"
      WHERE channels @> ${sql.json(['inbox'])}
    `

    for (const row of rows as any[]) {
      await insertNotification(row.user_id, message)

      if (hub) {
        hub.broadcast(`notify:${row.user_id}`, {
          type: 'notification',
          data: {
            title: message.title,
            body: message.body,
            actionUrl: message.actionUrl,
            actionText: message.actionText,
            type: message.type ?? 'default',
            metadata: message.metadata,
            created_at: new Date().toISOString(),
          },
        })
      }
    }
  }

  // ── Read operations ─────────────────────────────────────────────────

  async function unreadCount(userId: number): Promise<number> {
    const [row] = (await sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM ${tbl} WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    )) as { count: number }[]
    return row?.count ?? 0
  }

  async function count(userId: number, unreadOnly = false): Promise<number> {
    if (unreadOnly) return unreadCount(userId)
    const [row] = (await sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM ${tbl} WHERE user_id = $1`,
      [userId],
    )) as { count: number }[]
    return row?.count ?? 0
  }

  async function markRead(userId: number, notificationIds?: number[]): Promise<void> {
    if (notificationIds && notificationIds.length > 0) {
      const ids = notificationIds.map((_, i) => `$${i + 2}`).join(', ')
      await sql.unsafe(
        `UPDATE ${tbl} SET read_at = NOW() WHERE user_id = $1 AND id IN (${ids}) AND read_at IS NULL`,
        [userId, ...notificationIds],
      )
    } else {
      await sql.unsafe(`UPDATE ${tbl} SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [
        userId,
      ])
    }
  }

  async function list(
    userId: number,
    opts?: { limit?: number; offset?: number; unreadOnly?: boolean },
  ): Promise<Notification[]> {
    const limit = opts?.limit ?? pageSize
    const offset = opts?.offset ?? 0

    let where = `user_id = $1`
    const params: unknown[] = [userId]
    const paramIdx = 2

    if (opts?.unreadOnly) {
      where += ` AND read_at IS NULL`
    }

    const rows = (await sql.unsafe(
      `SELECT id, user_id, title, body, action_url, action_text, type, metadata, read_at, created_at
       FROM ${tbl}
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    )) as Notification[]

    return rows.map(normalizeNotification)
  }

  function normalizeNotification(row: any): Notification {
    return {
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {}),
    }
  }

  // ── Preferences ────────────────────────────────────────────────────

  async function getPreferences(userId: number): Promise<NotifyPreferences> {
    const [row] = (await sql.unsafe(`SELECT channels FROM "_notify_prefs" WHERE user_id = $1`, [
      userId,
    ])) as { channels: any }[] | undefined[]

    if (!row) {
      return { channels: [...DEFAULT_CHANNELS] }
    }

    let channels: NotifyChannel[]
    if (typeof row.channels === 'string') {
      channels = JSON.parse(row.channels)
    } else if (Array.isArray(row.channels)) {
      channels = row.channels
    } else {
      channels = [...DEFAULT_CHANNELS]
    }

    return { channels }
  }

  async function setPreferences(userId: number, prefs: NotifyPreferences): Promise<void> {
    // Use sql.json() NOT JSON.stringify — the postgres.js library handles
    // JSONB serialization correctly only through sql.json(). JSON.stringify
    // stores the value as a JSON string, not a JSON array, breaking @> queries.
    await sql`
      INSERT INTO "_notify_prefs" (user_id, channels)
      VALUES (${userId}, ${sql.json(prefs.channels)})
      ON CONFLICT (user_id)
      DO UPDATE SET channels = ${sql.json(prefs.channels)}
    `
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  async function clean(days: number): Promise<number> {
    const result = await sql.unsafe(`DELETE FROM ${tbl} WHERE created_at < NOW() - $1::interval`, [
      `${days} days`,
    ])
    return Array.isArray(result) ? result.length : 0
  }

  // ── Email rendering ─────────────────────────────────────────────────

  function renderEmail(message: NotifyMessage): string {
    const actionHtml = message.actionUrl
      ? `\n<p><a href="${escapeHtml(message.actionUrl)}" style="display:inline-block;padding:10px 20px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px">${escapeHtml(message.actionText ?? 'View')}</a></p>`
      : ''

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:20px;max-width:600px">
  <h2>${escapeHtml(message.title)}</h2>
  ${message.body ? `<p>${escapeHtml(message.body)}</p>` : ''}
  ${actionHtml}
  <hr style="margin-top:30px;border:none;border-top:1px solid #eee">
  <p style="color:#999;font-size:12px">${escapeHtml(fromName)}</p>
</body>
</html>`
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Middleware ──────────────────────────────────────────────────────

  const mw: Middleware<Context, Context & NotifierInjected> = async (req, ctx, next) => {
    ;(ctx as Context & NotifierInjected).notifier = api
    return next(req, ctx as Context & NotifierInjected)
  }

  const api: Notifier = {
    send,
    broadcast,
    unreadCount,
    count,
    markRead,
    list,
    getPreferences,
    setPreferences,
    clean,
    migrate,
    close: async () => {},
  }

  return Object.assign(mw, api) as unknown as Notifier
}
