import type { Context } from '../types.ts'
import type { Router } from '../router.ts'
import type { PostgresClient } from '../postgres/types.ts'

declare module '../types.ts' {
  interface Context {
    tenant: TenantContext
  }
}

export interface TenantContext {
  id: string
  name: string
  role: string
}

export type FieldType = 'string' | 'integer' | 'float' | 'boolean' | 'text'
  | 'datetime' | 'date' | 'enum' | 'json' | 'vector'

export interface RelationDef {
  table: string
  field?: string
  onDelete?: 'cascade' | 'restrict' | 'setnull'
}

export interface FieldDef {
  name: string
  type: FieldType
  required?: boolean
  unique?: boolean
  index?: boolean | 'desc' | 'gin' | 'hnsw'
  default?: unknown
  options?: string[]
  dimensions?: number
  relation?: RelationDef
}

export interface UserTableRow {
  id: number
  tenant_id: string
  slug: string
  label: string
  fields: FieldDef[]
  created_at: string
}

export interface TenantOptions {
  pg: PostgresClient
  usersTable: string
}

export interface TenantModule extends Router {
  migrate: () => Promise<void>
  middleware: () => (req: Request, ctx: Context, next: any) => Promise<Response>
  graphql: () => any
  close: () => Promise<void>
}
