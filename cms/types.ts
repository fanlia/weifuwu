import type { Router } from '../router.ts'
import type { PostgresClient } from '../postgres/types.ts'

export type CmsFieldType =
  | 'string' | 'richtext' | 'integer' | 'float' | 'boolean'
  | 'datetime' | 'json' | 'slug' | 'enum' | 'image' | 'gallery' | 'relation'

export interface CmsFieldDef {
  name: string
  type: CmsFieldType
  required?: boolean
  unique?: boolean
  index?: boolean
  default?: unknown
  options?: string[]
  relation?: { contentType: string; field?: string }
  placeholder?: string
  helpText?: string
}

export interface ContentTypeConfig {
  workflow?: boolean
  i18n?: boolean
  slugField?: string
  titleField?: string
}

export interface ContentType {
  id: number
  slug: string
  label: string
  description: string
  fields: CmsFieldDef[]
  config: ContentTypeConfig
  createdAt: string
  updatedAt: string
}

export type EntryStatus = 'draft' | 'published' | 'archived'

export interface ContentEntry {
  id: number
  contentType: string
  slug: string
  title: string
  status: EntryStatus
  data: Record<string, unknown>
  locale: string | null
  createdBy: number | null
  updatedBy: number | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ContentVersion {
  id: number
  entryId: number
  version: number
  data: Record<string, unknown>
  createdBy: number | null
  createdAt: string
}

export interface CmsMedia {
  id: number
  filename: string
  originalName: string
  mimetype: string
  size: number
  width: number | null
  height: number | null
  alt: string
  createdBy: number | null
  createdAt: string
}

export interface CmsWebhook {
  id: number
  name: string
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: string
}

export interface CmsRedirect {
  id: number
  fromPath: string
  toPath: string
  type: number
  createdAt: string
}

export interface CmsOptions {
  pg: PostgresClient
  mediaDir?: string
}

export interface CmsModule extends Router {
  migrate: () => Promise<void>
  close: () => Promise<void>
}
