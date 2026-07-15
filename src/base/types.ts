declare module '../types.ts' {
  interface Context {
    /** Base module — dynamic data storage engine. */
    base: import('./types.ts').BaseAPI
  }
}

// ═══════════════════════════════════════════════════════════════
// Data models
// ═══════════════════════════════════════════════════════════════

export type FieldType =
  | 'string' | 'text' | 'number' | 'boolean'
  | 'date' | 'datetime'
  | 'vector'
  | 'search'
  | 'relation'
  | 'json'

export interface FieldSchema {
  type: FieldType
  required?: boolean
  unique?: boolean
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: string[]
  dimensions?: number // for vector
  target?: string    // for relation: target table name
  description?: string
}

export interface TableSchema {
  name: string
  fields: Record<string, FieldSchema>
}

export interface BaseDef {
  id: string
  name: string
  slug: string
  description: string | null
  tables: TableSchema[]
  created_by: string
  created_at: Date
  updated_at: Date
}

// ═══════════════════════════════════════════════════════════════
// Column map (internal)
// ═══════════════════════════════════════════════════════════════

export interface ColumnMap {
  field_name: string
  physical: string  // e.g. 'text001' or 'ext'
  field_type: FieldType
}

// ═══════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════

export interface CreateBaseInput {
  name: string
  slug?: string
  description?: string
  tables?: TableSchema[]
}

export interface UpdateBaseInput {
  name?: string
  description?: string
}

export interface QueryOptions {
  filter?: Record<string, unknown>
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
  include?: string[] // relation field names to eagerly load
}

export interface BaseOptions {
  /** Schema name for management tables (default: 'public'). */
  managementSchema?: string
  /** User table name (default: 'users'). */
  usersTable?: string
}

// ═══════════════════════════════════════════════════════════════
// Per-request API
// ═══════════════════════════════════════════════════════════════

export interface BaseAPI {
  // ── Base management ──────────────────────────────────────

  /** Create a new base with optional table definitions. */
  create(input: CreateBaseInput): Promise<BaseDef>

  /** List all bases. */
  list(): Promise<BaseDef[]>

  /** Get a base by id. */
  get(id: string): Promise<BaseDef | null>

  /** Get a base by slug. */
  getBySlug(slug: string): Promise<BaseDef | null>

  /** Update base metadata. */
  update(id: string, input: UpdateBaseInput): Promise<BaseDef | null>

  /** Delete a base and all its data. */
  delete(id: string): Promise<boolean>

  // ── Table management ─────────────────────────────────────

  /** Define a new table in a base. */
  defineTable(baseId: string, schema: TableSchema): Promise<BaseDef>

  /** Update a table's schema (adds new fields, updates metadata). */
  updateTable(baseId: string, tableName: string, schema: TableSchema): Promise<BaseDef | null>

  /** Remove a table and all its data. */
  removeTable(baseId: string, tableName: string): Promise<BaseDef | null>

  // ── Data operations ──────────────────────────────────────

  /** Insert a row into a table. */
  insert(baseId: string, table: string, data: Record<string, unknown>): Promise<Record<string, unknown> & { id: string }>

  /** Get a row by id. */
  getRow(baseId: string, table: string, id: string): Promise<(Record<string, unknown> & { id: string }) | null>

  /** Update a row by id. */
  updateRow(baseId: string, table: string, id: string, data: Partial<Record<string, unknown>>): Promise<(Record<string, unknown> & { id: string }) | null>

  /** Delete a row by id. */
  deleteRow(baseId: string, table: string, id: string): Promise<boolean>

  /** Query rows with filtering, sorting, and pagination. */
  query(baseId: string, table: string, opts?: QueryOptions): Promise<(Record<string, unknown> & { id: string })[]>

  /** Vector similarity search. */
  similaritySearch(baseId: string, table: string, field: string, vector: number[], opts?: { limit?: number }): Promise<(Record<string, unknown> & { id: string; distance: number })[]>

  /** Full-text search. */
  search(baseId: string, table: string, field: string, query: string, opts?: { limit?: number; offset?: number }): Promise<(Record<string, unknown> & { id: string; rank: number; headline?: string })[]>
}
