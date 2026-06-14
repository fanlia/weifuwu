import type { PostgresClient } from '../postgres/types.ts'
import type { Router } from '../router.ts'

export interface LogdbOptions {
  pg: PostgresClient
  table?: string
}

export interface LogEntry {
  id: number
  level: string
  source: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface LogEntryInput {
  level: string
  source: string
  message: string
  metadata?: Record<string, unknown>
}

export interface LogdbModule extends Router, Closeable {
  log(input: LogEntryInput): Promise<LogEntry>
  migrate(): Promise<void>
  clean(retentionMonths: number): Promise<number>
  close(): Promise<void>
}
