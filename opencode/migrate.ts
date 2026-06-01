import type { Sql } from '../vendor.ts'

export async function migrate(sql: Sql<{}>): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_opencode_sessions" (
      "id" SERIAL PRIMARY KEY,
      "tenant_id" TEXT,
      "user_id" INTEGER NOT NULL DEFAULT 0,
      "title" TEXT,
      "agent_type" TEXT NOT NULL DEFAULT 'build',
      "model" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
      "system_prompt" TEXT,
      "workspace" TEXT,
      "metadata" JSONB NOT NULL DEFAULT '{}',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_opencode_sessions_user_idx" ON "_opencode_sessions" ("user_id")
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_opencode_messages" (
      "id" SERIAL PRIMARY KEY,
      "session_id" INTEGER NOT NULL REFERENCES "_opencode_sessions"("id") ON DELETE CASCADE,
      "role" TEXT NOT NULL,
      "content" TEXT,
      "tool_calls" JSONB,
      "tool_results" JSONB,
      "tokens_in" INTEGER NOT NULL DEFAULT 0,
      "tokens_out" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_opencode_messages_session_idx" ON "_opencode_messages" ("session_id", "created_at")
  `)
}
