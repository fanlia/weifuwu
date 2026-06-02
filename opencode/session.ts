import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Sql } from '../vendor.ts'
import type { Session, Message } from './types.ts'

export async function createSession(
  sql: Sql<{}>,
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
  return row as Session
}

function computeSessionWorkspace(cwd: string, mountPath: string, sessionId: string): string {
  const name = !mountPath || mountPath === '/' ? 'default' : mountPath.replace(/^\//, '')
  return join(cwd, '.sessions', name, sessionId)
}

export async function getSession(sql: Sql<{}>, id: string): Promise<Session | null> {
  const [row] = await sql`SELECT * FROM "_opencode_sessions" WHERE id = ${id} AND active = true LIMIT 1`
  return (row as any as Session) ?? null
}

export async function listSessions(sql: Sql<{}>, userId?: number): Promise<Session[]> {
  if (userId !== undefined) {
    const rows = await sql`SELECT * FROM "_opencode_sessions" WHERE user_id = ${userId} AND active = true ORDER BY updated_at DESC`
    return rows as any as Session[]
  }
  const rows = await sql`SELECT * FROM "_opencode_sessions" WHERE active = true ORDER BY updated_at DESC`
  return rows as any as Session[]
}

export async function deleteSession(sql: Sql<{}>, id: string): Promise<void> {
  await sql`UPDATE "_opencode_sessions" SET active = false, updated_at = NOW() WHERE id = ${id}`
}

export async function getHistory(sql: Sql<{}>, sessionId: string, limit = 50): Promise<SessionMessage[]> {
  const rows = await sql`
    SELECT * FROM "_opencode_messages"
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
  return rows as any as SessionMessage[]
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
  sql: Sql<{}>,
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
  return row as Message
}

export async function addToolMessages(
  sql: Sql<{}>,
  sessionId: string,
  toolCalls: unknown[],
  toolResults: unknown[],
): Promise<Message> {
  const [row] = await sql`
    INSERT INTO "_opencode_messages" ("session_id", "role", "tool_calls", "tool_results")
    VALUES (${sessionId}, 'tool', ${JSON.stringify(toolCalls)}, ${JSON.stringify(toolResults)})
    RETURNING *
  `
  return row as Message
}

export async function updateSessionTitle(sql: Sql<{}>, id: string, title: string): Promise<void> {
  await sql`UPDATE "_opencode_sessions" SET title = ${title}, updated_at = NOW() WHERE id = ${id}`
}
