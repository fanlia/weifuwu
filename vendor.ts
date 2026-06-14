// centralized re-exports of third-party types
import type postgres from 'postgres'

/** Untyped postgres.js SQL client. Use typed `Sql<{ table: { col: type } }>` for schemas. */
export type SqlClient = postgres.Sql<Record<string, unknown>>

/** Re-export for downstream usage. */
export type { Sql } from 'postgres'
export type { WebSocket } from 'ws'
export type { Redis, RedisOptions } from 'ioredis'
