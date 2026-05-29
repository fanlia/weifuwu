import type { Sql } from 'postgres'

export interface MigrateOptions {
  sql: Sql<{}>
  embeddingDimension: number
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { sql, embeddingDimension } = opts

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_agents" (
      "id" SERIAL PRIMARY KEY,
      "tenant_id" TEXT,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "type" TEXT NOT NULL DEFAULT 'chat',
      "model" TEXT NOT NULL DEFAULT '',
      "system_prompt" TEXT NOT NULL DEFAULT '',
      "owner_id" INTEGER NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_agents_tenant_id_idx" ON "_agents" ("tenant_id")
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_knowledge_documents" (
      "id" SERIAL PRIMARY KEY,
      "agent_id" INTEGER NOT NULL REFERENCES "_agents"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL DEFAULT '',
      "content" TEXT NOT NULL,
      "embedding" vector(${embeddingDimension}),
      "metadata" JSONB NOT NULL DEFAULT '{}',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_knowledge_documents_agent_id_idx" ON "_knowledge_documents" ("agent_id")
  `)
}
