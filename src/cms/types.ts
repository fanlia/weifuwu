import type { Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /** CMS instance for content management. */
    cms: import('./types.ts').CMSAPI
  }
}

// ═══════════════════════════════════════════════════════════════
// Data models
// ═══════════════════════════════════════════════════════════════

export type ContentStatus = 'draft' | 'published' | 'archived'
export type ContentType = string // 'post' | 'page' | 'doc' | 'changelog' | any custom

export interface Content {
  id: string
  slug: string
  type: ContentType
  parent_id: string | null
  title: string
  body: string
  excerpt: string | null
  cover_image: string | null
  status: ContentStatus
  author_id: string
  author_name?: string
  published_at: Date | null
  created_at: Date
  updated_at: Date
  tags?: Tag[]
}

export interface Tag {
  id: string
  name: string
  slug: string
}

export interface TagWithCount extends Tag {
  content_count: number
}

// ═══════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════

export interface CreateContentInput {
  slug?: string // auto-generated from title if omitted
  type: ContentType
  parent_id?: string
  title: string
  body: string
  excerpt?: string
  cover_image?: string
  status?: ContentStatus
  tags?: string[] // tag names, created on the fly
}

export interface UpdateContentInput {
  slug?: string
  type?: ContentType
  parent_id?: string | null
  title?: string
  body?: string
  excerpt?: string | null
  cover_image?: string | null
  status?: ContentStatus
  tags?: string[]
}

export interface ListContentOptions {
  type?: ContentType
  status?: ContentStatus
  tag?: string
  author_id?: string
  parent_id?: string | null
  /** Cursor pagination: return items before this cursor (created_at DESC). */
  before?: string
  /** Page size (default: 20, max: 100). */
  limit?: number
}

export interface CMSOptions {
  /** PostgreSQL table prefix (default: ''). */
  tablePrefix?: string
  /** User table name for author name lookups (default: 'users'). */
  usersTable?: string
}

// ═══════════════════════════════════════════════════════════════
// Per-request API
// ═══════════════════════════════════════════════════════════════

export interface CMSAPI {
  // ── Content CRUD ───────────────────────────────────────

  /** List content with filters and cursor pagination. */
  list(opts?: ListContentOptions): Promise<Content[]>

  /** Get a single content by slug. Returns null if not found or not published (for non-admin). */
  get(slug: string): Promise<Content | null>

  /** Get a single content by id. */
  getById(id: string): Promise<Content | null>

  /** Create content. Requires admin role. */
  create(input: CreateContentInput): Promise<Content>

  /** Update content. Requires admin role. Returns null if not found. */
  update(id: string, input: UpdateContentInput): Promise<Content | null>

  /** Delete content (hard delete). Requires admin role. */
  delete(id: string): Promise<boolean>

  /** Publish content (set status to 'published' and set published_at). */
  publish(id: string): Promise<Content | null>

  /** Unpublish content (set status to 'draft'). */
  unpublish(id: string): Promise<Content | null>

  // ── Tags ───────────────────────────────────────────────

  /** List all tags with content count. */
  listTags(): Promise<TagWithCount[]>

  /** Create a tag. */
  createTag(name: string): Promise<Tag>

  /** Delete a tag. */
  deleteTag(id: string): Promise<boolean>
}
