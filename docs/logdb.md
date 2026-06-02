# LogDB — Structured Event Logging

> [Home](../README.md) → LogDB

PostgreSQL-backed structured logging with monthly partitioning, metadata search, and built-in REST API.

```ts
import { serve, Router, logdb, postgres } from 'weifuwu'

const pg = postgres()
const logger = logdb({ pg })

await logger.migrate()                    // create table + partitions
app.use('/logs', logger.router())         // mount REST API
```

## Module API

```ts
const logger = logdb({
  pg: PostgresClient,
  table?: string           // default: '_log_entries'
})
```

| Method | Returns | Description |
|--------|---------|-------------|
| `log(input)` | `LogEntry` | Insert a log entry programmatically |
| `router()` | `Router` | REST API routes: `POST /`, `GET /`, `GET /:id` |
| `migrate()` | `Promise<void>` | Create partitioned table + month partitions |
| `clean(n)` | `Promise<number>` | Drop partitions older than `n` months |
| `close()` | `Promise<void>` | Close database connection |

## Log entries

```ts
interface LogEntryInput {
  level: string                    // info, warn, error, debug
  source: string                   // api, ui, system, or custom
  message: string
  metadata?: Record<string, unknown>
}

interface LogEntry {
  id: number
  level: string
  source: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
}
```

### Auto-captured fields

When `ctx.user` is set (e.g. by the `auth` middleware), the `POST /` handler automatically injects `metadata.user_id`:

```ts
app.use(auth({ verify: (token) => auth.verify(token) }))
// POST /logs — metadata.user_id is auto-populated from ctx.user.id
```

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST /` | Create a log entry | Returns `LogEntry` with status 201 |
| `GET /` | Query log entries | Returns `{ entries: LogEntry[], total: number }` |
| `GET /:id` | Get single entry | Returns `LogEntry` or 404 |

### Query parameters (`GET /`)

| Param | Example | Description |
|-------|---------|-------------|
| `level` | `?level=error` | Filter by level (exact match) |
| `source` | `?source=api` | Filter by source (exact match) |
| `after` | `?after=2026-01-01` | Entries on or after this timestamp |
| `before` | `?before=2026-03-01` | Entries before this timestamp |
| `meta.*` | `?meta.service=auth&meta.env=prod` | Filter by metadata key/value |
| `limit` | `?limit=20` | Page size (default: 50) |
| `offset` | `?offset=40` | Page offset (default: 0) |

Results are ordered by `created_at DESC`.

### Examples

```bash
# Create a log entry
curl -X POST /logs \
  -H 'Content-Type: application/json' \
  -d '{"level":"error","source":"api","message":"Connection refused","metadata":{"service":"auth","userId":42}}'

# Search by metadata
curl '/logs?meta.service=auth&meta.env=production'

# Time range
curl '/logs?after=2026-01-01&before=2026-03-01&level=warn'

# Pagination
curl '/logs?limit=20&offset=0'
```

## Partitioning

Logs are stored in a PostgreSQL range-partitioned table by `created_at`. Partitions are pre-created for the current month + 12 months ahead:

```sql
_log_entries                          ← parent (PARTITION BY RANGE created_at)
├── _log_entries_2026_01              ← Jan 2026
├── _log_entries_2026_02              ← Feb 2026
├── ...
└── _log_entries_2027_06              ← Jun 2027
```

This keeps each partition small, enables partition-pruning for time-range queries, and allows instant retention via `DROP TABLE`.

### Retention

```ts
// Drop all partitions older than 12 months
const dropped = await logger.clean(12)
console.log(`Dropped ${dropped} old partitions`)
```

### Partition creation

The `migrate()` method creates the parent table and pre-creates partitions. The `log()` method checks for the current month's partition and creates it if missing — safe across month boundaries without re-running migration.

## Programmatic logging

```ts
// Direct insert (bypasses REST API)
await logger.log({
  level: 'info',
  source: 'system',
  message: 'Server started',
  metadata: { version: '1.0.0' },
})
```

## Notes

- The REST API is **append-only** (no `PUT`/`PATCH`/`DELETE` routes)
- For production audit use, `REVOKE UPDATE, DELETE ON _log_entries FROM app_user` at the DB level
- Indexes on `level`, `source`, `(created_at DESC)` auto-propagate to all partitions
