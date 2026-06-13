/**
 * Database migration for the blog example.
 * Run once before starting the app:
 *   node migrate.ts
 */
import { postgres } from '../../index.ts'
import { loadEnv } from '../../env.ts'

loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Copy .env.example to .env or set the env var.')
  process.exit(1)
}

const pg = postgres({ connection: DATABASE_URL })

await pg.sql`
  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

// Seed some sample posts if the table is empty
const [{ count }] = await pg.sql`SELECT COUNT(*)::int AS count FROM posts`
if (count === 0) {
  await pg.sql`
    INSERT INTO posts (title, content) VALUES
      ('Welcome to weifuwu', 'weifuwu is a web-standard HTTP framework for Node.js. It uses (req, ctx) => Response — no framework-specific objects, no magic.'),
      ('SSR with React', 'Server-side rendering with React 19 and streaming. Pages are `.tsx` files in `ui/app/`. Dynamic routes use `[param]` directories.'),
      ('Built-in i18n', 'Internationalization with JSON translation files. Locale detection via cookie, Accept-Language header, or programmatic set.'),
      ('Theme Switching', 'Light/dark/system theme support. Persisted via cookie. Uses Tailwind CSS dark mode classes.'),
      ('PostgreSQL Integration', 'Type-safe SQL queries with the `postgres` module. Auto-connects, pools connections, supports transactions.')
  `
  console.log('Seeded 5 sample posts')
}

console.log('Migration complete')
await pg.close()
