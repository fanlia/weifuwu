import type { Router } from '../router.ts'
import type { PostgresClient } from '../postgres/types.ts'

export interface Session {
  id: string
  tenant_id: string | null
  user_id: number
  title: string | null
  agent_type: string
  model: string
  system_prompt: string | null
  workspace: string | null
  metadata: Record<string, unknown>
  active: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls: unknown[] | null
  tool_results: unknown[] | null
  tokens_in: number
  tokens_out: number
  created_at: string
}

export interface SkillDef {
  name: string
  description: string
  content: string
  license?: string
  compatibility?: string
  path?: string
}

export interface SkillRegistry {
  all: SkillDef[]
  get(name: string): SkillDef | undefined
  list(): SkillDef[]
}

export interface ToolPermission {
  allow: boolean
  timeout?: number
  maxSize?: number
}

export interface OpencodePermissions {
  bash?: ToolPermission & { allowPaths?: string[]; denyPaths?: string[] }
  read?: ToolPermission & { denyPaths?: string[] }
  write?: ToolPermission & { denyPaths?: string[] }
  edit?: ToolPermission & { denyPaths?: string[] }
  grep?: ToolPermission & { allowPaths?: string[] }
  glob?: ToolPermission
  web?: ToolPermission
  skill?: Record<string, ToolPermission>
}

export interface OpencodeOptions {
  pg: PostgresClient
  model?: string
  baseURL?: string
  apiKey?: string
  workspace?: string
  systemPrompt?: string
  skills?: SkillDef[]
  permissions?: OpencodePermissions
}

export interface OpencodeModule {
  migrate: () => Promise<void>
  router: () => Router | Promise<Router>
  wsHandler: () => any
  close: () => Promise<void>
}

export interface WsClientInfo {
  sessionId?: string
  abortController?: AbortController
}

export interface PendingQuestion {
  resolve: (answer: string) => void
  reject: (err: Error) => void
}
