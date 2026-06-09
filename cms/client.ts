import type { Sql } from 'postgres'
import type { PostgresClient } from '../postgres/types.ts'
import type { CmsOptions, CmsModule } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { Router } from '../router.ts'
import { registerAdminRoutes } from './admin.ts'
import { registerApiRoutes } from './api.ts'
import { registerMediaRoutes, createMediaTable } from './media.ts'

export function cms(options: CmsOptions): CmsModule {
  const pg = options.pg
  const sql = pg.sql
  const base = new PgModule(pg)
  const mediaDir = options.mediaDir ?? './cms-media'

  async function migrate(): Promise<void> {
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_cms_content_types" (
        "id" SERIAL PRIMARY KEY,
        "slug" TEXT NOT NULL UNIQUE,
        "label" TEXT NOT NULL,
        "description" TEXT DEFAULT '',
        "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "config" JSONB DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_cms_entries" (
        "id" SERIAL PRIMARY KEY,
        "content_type" TEXT NOT NULL REFERENCES "_cms_content_types"("slug") ON DELETE CASCADE,
        "slug" TEXT NOT NULL DEFAULT '',
        "title" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "locale" TEXT DEFAULT NULL,
        "created_by" INTEGER DEFAULT NULL,
        "updated_by" INTEGER DEFAULT NULL,
        "published_at" TIMESTAMPTZ DEFAULT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_cms_entries_unique_idx" ON "_cms_entries" ("content_type", "slug")`)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "_cms_entries_content_type_idx" ON "_cms_entries" ("content_type")`)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "_cms_entries_status_idx" ON "_cms_entries" ("status")`)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "_cms_entries_data_gin_idx" ON "_cms_entries" USING GIN ("data" jsonb_path_ops)`)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_cms_versions" (
        "id" SERIAL PRIMARY KEY,
        "entry_id" INTEGER NOT NULL REFERENCES "_cms_entries"("id") ON DELETE CASCADE,
        "version" INTEGER NOT NULL,
        "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_by" INTEGER DEFAULT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("entry_id", "version")
      )
    `)

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "_cms_versions_entry_idx" ON "_cms_versions" ("entry_id")
    `)

    await createMediaTable(sql)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_cms_webhooks" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "events" TEXT[] NOT NULL DEFAULT '{}',
        "secret" TEXT DEFAULT '',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_cms_redirects" (
        "id" SERIAL PRIMARY KEY,
        "from_path" TEXT NOT NULL UNIQUE,
        "to_path" TEXT NOT NULL,
        "type" INTEGER NOT NULL DEFAULT 301,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  const r = new Router()

  registerAdminRoutes(r, sql)
  registerApiRoutes(r, sql)
  registerMediaRoutes(r, sql, mediaDir)

  const mod = r as CmsModule
  mod.migrate = migrate
  mod.close = () => base.close()

  return mod
}
