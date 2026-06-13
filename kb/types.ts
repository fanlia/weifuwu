import type { Middleware } from '../types.ts'
import type { AIProvider } from '../ai/provider.ts'
import type { PostgresClient } from '../postgres/types.ts'

export interface KBOptions {
  /** Postgres client instance. */
  pg: PostgresClient
  /** AI provider for embedding. */
  provider: AIProvider
  /** Table name (default: '_kb_docs'). */
  table?: string
  /** Default chunk size in characters (default: 512). */
  chunkSize?: number
  /** Default chunk overlap in characters (default: 64). */
  chunkOverlap?: number
  /** Default search limit (default: 5). */
  searchLimit?: number
  /** Minimum similarity score threshold (0–1, default: 0). Set higher for stricter matches. */
  searchThreshold?: number
}

export interface KBIngestOptions {
  title?: string
  metadata?: Record<string, unknown>
  chunkSize?: number
  chunkOverlap?: number
}

export interface KBSearchResult {
  id: number
  key: string
  title: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface KBSearchOptions {
  limit?: number
  /** Minimum cosine similarity score (0–1). Results below this are excluded. */
  threshold?: number
}

export interface KBListEntry {
  key: string
  title: string
  chunks: number
}

export interface KBModule {
  /**
   * Ingest a document: chunk → embed → store.
   * If a document with the same key exists, it is replaced (delete + re-insert).
   * Returns the number of chunks created.
   */
  ingest(key: string, content: string, options?: KBIngestOptions): Promise<number>
  /**
   * Search the knowledge base by semantic similarity.
   * Query is embedded, then vector similarity search returns top results.
   */
  search(query: string, searchOptions?: KBSearchOptions): Promise<KBSearchResult[]>
  /** Delete all chunks for a document key. */
  delete(key: string): Promise<void>
  /** List all document keys with title and chunk count. */
  list(): Promise<KBListEntry[]>
  /** Create the table and HNSW index. Safe to call multiple times. */
  migrate(): Promise<void>
  /** Middleware that injects `ctx.kb` with `.search()` method. */
  middleware(): Middleware
}
