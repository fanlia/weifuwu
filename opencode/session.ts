import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Sql } from '../vendor.ts'
import type { Session, Message } from './types.ts'

export async function createSession(
  sql: Sql<{}>,
  opts: { userId?: number; title?: string; model?: string; systemPrompt?: string },
): Promise<Session> {
  const [row] = await sql`
    INSERT INTO "_opencode_sessions" ("user_id", "title", "model", "system_prompt")
    VALUES (${opts.userId ?? 0}, ${opts.title ?? null}, ${opts.model ?? 'deepseek-v4-flash'}, ${opts.systemPrompt ?? null})
    RETURNING *
  `
  return row as Session
}

export function computeSessionWorkspace(cwd: string, mountPath: string, sessionId: number): string {
  const name = !mountPath || mountPath === '/' ? 'default' : mountPath.replace(/^\//, '')
  return join(cwd, '.sessions', name, String(sessionId))
}

export async function initSessionWorkspace(sql: Sql<{}>, sessionId: number, cwd: string, mountPath: string): Promise<string> {
  const ws = computeSessionWorkspace(cwd, mountPath, sessionId)
  await mkdir(ws, { recursive: true })
  await sql`UPDATE "_opencode_sessions" SET workspace = ${ws} WHERE id = ${sessionId}`
  return ws
}

export async function getSession(sql: Sql<{}>, id: number): Promise<Session | null> {
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

export async function deleteSession(sql: Sql<{}>, id: number): Promise<void> {
  await sql`UPDATE "_opencode_sessions" SET active = false, updated_at = NOW() WHERE id = ${id}`
}

export async function getHistory(sql: Sql<{}>, sessionId: number, limit = 50): Promise<SessionMessage[]> {
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
  session_id: number
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
  sessionId: number,
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
  sessionId: number,
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

export async function updateSessionTitle(sql: Sql<{}>, id: number, title: string): Promise<void> {
  await sql`UPDATE "_opencode_sessions" SET title = ${title}, updated_at = NOW() WHERE id = ${id}`
}
