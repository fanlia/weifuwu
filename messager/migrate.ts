import type { Sql } from '../vendor.ts'

export async function migrate(sql: Sql<{}>): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_channels" (
      "id" SERIAL PRIMARY KEY,
      "tenant_id" TEXT,
      "name" TEXT NOT NULL DEFAULT '',
      "type" TEXT NOT NULL DEFAULT 'channel',
      "created_by" INTEGER NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_channels_tenant_id_idx" ON "_channels" ("tenant_id")
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_channel_members" (
      "id" SERIAL PRIMARY KEY,
      "channel_id" INTEGER NOT NULL REFERENCES "_channels"("id") ON DELETE CASCADE,
      "member_id" INTEGER NOT NULL,
      "member_type" TEXT NOT NULL DEFAULT 'user',
      "role" TEXT NOT NULL DEFAULT 'member',
      "last_read_id" INTEGER DEFAULT NULL,
      "last_read_at" TIMESTAMPTZ DEFAULT NULL,
      UNIQUE("channel_id", "member_id", "member_type")
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_channel_members_user_idx" ON "_channel_members" ("member_id")
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_messages" (
      "id" SERIAL PRIMARY KEY,
      "channel_id" INTEGER NOT NULL REFERENCES "_channels"("id") ON DELETE CASCADE,
      "sender_id" INTEGER NOT NULL,
      "sender_type" TEXT NOT NULL DEFAULT 'user',
      "type" TEXT NOT NULL DEFAULT 'text',
      "content" TEXT NOT NULL DEFAULT '',
      "file_url" TEXT DEFAULT NULL,
      "file_name" TEXT DEFAULT NULL,
      "file_size" INTEGER DEFAULT NULL,
      "mime_type" TEXT DEFAULT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_messages_channel_created_idx" ON "_messages" ("channel_id", "created_at" DESC)
  `)
}
