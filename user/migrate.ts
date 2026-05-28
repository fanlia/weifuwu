export interface MigrateOptions {
  usersTable: string
  pg: any
  oauth2?: boolean
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { pg, usersTable, oauth2 } = opts

  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${usersTable}" (
      "id" SERIAL PRIMARY KEY,
      "email" TEXT UNIQUE NOT NULL,
      "password" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  if (!oauth2) return

  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_oauth2_clients" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "client_id" TEXT UNIQUE NOT NULL,
      "client_secret" TEXT NOT NULL,
      "redirect_uris" TEXT[] NOT NULL,
      "scopes" TEXT DEFAULT '',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_oauth2_codes" (
      "id" SERIAL PRIMARY KEY,
      "code" TEXT UNIQUE NOT NULL,
      "client_id" TEXT NOT NULL,
      "user_id" INTEGER NOT NULL REFERENCES "${usersTable}"("id"),
      "redirect_uri" TEXT NOT NULL,
      "code_challenge" TEXT,
      "code_challenge_method" TEXT,
      "scope" TEXT,
      "expires_at" TIMESTAMPTZ NOT NULL,
      "used" BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)

  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_oauth2_tokens" (
      "id" SERIAL PRIMARY KEY,
      "token" TEXT UNIQUE NOT NULL,
      "client_id" TEXT NOT NULL,
      "user_id" INTEGER REFERENCES "${usersTable}"("id"),
      "scope" TEXT,
      "expires_at" TIMESTAMPTZ NOT NULL,
      "revoked" BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
}
