import { pgTable, serial, text, integer, boolean, timestamptz, textArray, sql } from '../postgres/schema/index.ts'

export interface MigrateOptions {
  usersTable: string
  pg: any
  oauth2?: boolean
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { pg, usersTable: name, oauth2 } = opts

  const users = pgTable(name, {
    id: serial('id').primaryKey(),
    email: text('email').unique().notNull(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    role: text('role').default('user'),
    created_at: timestamptz('created_at').default(sql`NOW()`),
    updated_at: timestamptz('updated_at').default(sql`NOW()`),
  })
  await users.create(pg.sql)

  if (!oauth2) return

  const clients = pgTable('_oauth2_clients', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    client_id: text('client_id').unique().notNull(),
    client_secret: text('client_secret').notNull(),
    redirect_uris: textArray('redirect_uris').notNull(),
    scopes: text('scopes').default(''),
    created_at: timestamptz('created_at').default(sql`NOW()`),
  })
  await clients.create(pg.sql)

  const codes = pgTable('_oauth2_codes', {
    id: serial('id').primaryKey(),
    code: text('code').unique().notNull(),
    client_id: text('client_id').notNull(),
    user_id: integer('user_id').notNull().references(name, 'id'),
    redirect_uri: text('redirect_uri').notNull(),
    code_challenge: text('code_challenge'),
    code_challenge_method: text('code_challenge_method'),
    scope: text('scope'),
    expires_at: timestamptz('expires_at').notNull(),
    used: boolean('used').default(false),
  })
  await codes.create(pg.sql)

  const tokens = pgTable('_oauth2_tokens', {
    id: serial('id').primaryKey(),
    token: text('token').unique().notNull(),
    client_id: text('client_id').notNull(),
    user_id: integer('user_id').references(name, 'id'),
    scope: text('scope'),
    expires_at: timestamptz('expires_at').notNull(),
    revoked: boolean('revoked').default(false),
  })
  await tokens.create(pg.sql)
}
