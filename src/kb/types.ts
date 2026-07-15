import type { Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /** KB — RAG knowledge base module. */
    kb: import('./types.ts').KBAPI
  }
}

// ═══════════════════════════════════════════════════════════════
// Data models
// ═══════════════════════════════════════════════════════════════

export interface Document {
  id: string
  title: string
  source: string | null
  metadata: Record<string, unknown>
  chunk_count: number
  created_at: Date
  updated_at: Date
}

export interface Chunk {
  id: string
  document_id: string | null
  content: string
  chunk_index: number
  tokens: number
  created_at: Date
}

export interface SearchResult {
  chunk_id: string
  document_id: string | null
  content: string
  score: number
  source?: string
  title?: string
}

// ═══════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════

export interface ImportOptions {
  /** Source identifier (e.g. URL, filename). */
  source?: string
  /** Arbitrary metadata stored in the document. */
  metadata?: Record<string, unknown>
  /** Chunk size in tokens (default: 512). */
  chunkSize?: number
  /** Chunk overlap in tokens (default: 64). */
  chunkOverlap?: number
}

export interface SearchOptions {
  /** Number of results (default: 5, max: 50). */
  limit?: number
  /** Minimum similarity score filter (0-1). */
  minScore?: number
  /** Optional metadata filter. */
  filter?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// Options
// ═══════════════════════════════════════════════════════════════

export interface KBOptions {
  /** Embedding function. Defaults to DashScope text-embedding-v4. */
  embed?: (text: string) => Promise<number[]>
  /** Embedding dimensions (default: 1536 for text-embedding-v4). */
  dimensions?: number
  /** Default chunk size in tokens (default: 512). */
  chunkSize?: number
  /** Chunk overlap in tokens (default: 64). */
  chunkOverlap?: number
  /** User table name for reference (default: 'users'). */
  usersTable?: string
}

// ═══════════════════════════════════════════════════════════════
// Per-request API
// ═══════════════════════════════════════════════════════════════

export interface KBAPI {
  /** Import text: split into chunks, embed, and store. Returns document + chunks. */
  importText(title: string, text: string, opts?: ImportOptions): Promise<{ document: Document; chunks: Chunk[] }>

  /** Import multiple documents at once. */
  importDocuments(docs: Array<{ title: string; content: string } & ImportOptions>): Promise<Document[]>

  /** RAG search: embed query → vector similarity search → return chunks. */
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>

  /** List all documents. */
  list(): Promise<Document[]>

  /** Get a document by id. */
  get(id: string): Promise<Document | null>

  /** Get chunks for a document. */
  getChunks(documentId: string): Promise<Chunk[]>

  /** Delete a document and its chunks. */
  delete(id: string): Promise<boolean>
}
