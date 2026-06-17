import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { SqlClient } from '../vendor.ts'
import type { Session, Message } from './types.ts'
import {
  pgTable,
  uuid,
  serial,
  text,
  integer,
  boolean,
  timestamptz,
  jsonb,
  sql as schemaSql,
} from '../postgres/schema/index.ts'

const sessions = pgTable('_opencode_sessions', {
  id: uuid('id'),
  user_id: integer('user_id'),
  title: text('title'),
  model: text('model'),
  workspace: text('workspace'),
  system_prompt: text('system_prompt'),
  active: boolean('active'),
  updated_at: timestamptz('updated_at'),
  created_at: timestamptz('created_at'),
})

const messages = pgTable('_opencode_messages', {
  id: serial('id'),
  session_id: uuid('session_id'),
  role: text('role'),
  content: text('content'),
  tool_calls: jsonb('tool_calls'),
  tool_results: jsonb('tool_results'),
  tokens_in: integer('tokens_in'),
  tokens_out: integer('tokens_out'),
  created_at: timestamptz('created_at'),
})

export async function createSession(
  sql: SqlClient,
  opts: { userId?: number; title?: string; model?: string; systemPrompt?: string },
  cwd: string,
  mountPath: string,
): Promise<Session> {
  const id = randomUUID()
  const ws = computeSessionWorkspace(cwd, mountPath, id)
  await mkdir(ws, { recursive: true })
  const [row] = await sql`
    INSERT INTO "_opencode_sessions" ("id", "user_id", "title", "model", "workspace", "system_prompt")
    VALUES (${id}, ${opts.userId ?? 0}, ${opts.title ?? null}, ${opts.model ?? 'deepseek-v4-flash'}, ${ws}, ${opts.systemPrompt ?? null})
    RETURNING *
  `
  return row as unknown as Session
}

function computeSessionWorkspace(cwd: string, mountPath: string, sessionId: string): string {
  const name = !mountPath || mountPath === '/' ? 'default' : mountPath.replace(/^\//, '')
  return join(cwd, '.sessions', name, sessionId)
}

export async function getSession(sql: SqlClient, id: string): Promise<Session | null> {
  const { data: rows } = await sessions.readMany(sql, { id, active: true } as Partial<
    Record<string, unknown>
  >)
  return (rows[0] as unknown as Session) ?? null
}

export async function listSessions(sql: SqlClient, userId?: number): Promise<Session[]> {
  const opts = { orderBy: { updated_at: 'desc' as const } }
  const filter: Partial<Record<string, unknown>> =
    userId !== undefined ? { user_id: userId, active: true } : { active: true }
  const { data: rows } = await sessions.readMany(sql, filter, opts)
  return rows as unknown as Session[]
}

export async function deleteSession(sql: SqlClient, id: string): Promise<void> {
  await sessions.update(sql, id, { active: false, updated_at: schemaSql`NOW()` } as Partial<
    Record<string, unknown>
  >)
}

export async function getHistory(
  sql: SqlClient,
  sessionId: string,
  limit = 50,
): Promise<SessionMessage[]> {
  const { data: rows } = await messages.readMany(
    sql,
    { session_id: sessionId } as Partial<Record<string, unknown>>,
    {
      orderBy: { created_at: 'asc' },
      limit,
    },
  )
  return rows as unknown as SessionMessage[]
}

export interface SessionMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls: unknown[] | null
  tool_results: unknown[] | null
  tokens_in: number
  tokens_out: number
  created_at: string
}

export async function addTextMessage(
  sql: SqlClient,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  tokensIn = 0,
  tokensOut = 0,
): Promise<Message> {
  const [row] = await sql`
    INSERT INTO "_opencode_messages" ("session_id", "role", "content", "tokens_in", "tokens_out")
    VALUES (${sessionId}, ${role}, ${content}, ${tokensIn}, ${tokensOut})
    RETURNING *
  `
  return row as unknown as Message
}

export async function addToolMessages(
  sql: SqlClient,
  sessionId: string,
  toolCalls: unknown[],
  toolResults: unknown[],
): Promise<Message> {
  const [row] = await sql`
    INSERT INTO "_opencode_messages" ("session_id", "role", "tool_calls", "tool_results")
    VALUES (${sessionId}, 'tool', ${JSON.stringify(toolCalls)}, ${JSON.stringify(toolResults)})
    RETURNING *
  `
  return row as unknown as Message
}

export async function updateSessionTitle(sql: SqlClient, id: string, title: string): Promise<void> {
  await sessions.update(sql, id, { title, updated_at: schemaSql`NOW()` } as Partial<
    Record<string, unknown>
  >)
}
