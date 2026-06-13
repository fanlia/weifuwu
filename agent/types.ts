import type { Router } from '../router.ts'
import type { LanguageModel, EmbeddingModel, Tool } from 'ai'
import type { AIProvider } from '../ai/provider.ts'

export interface AgentConfig {
  id: number
  tenant_id: string | null
  name: string
  description: string
  type: 'chat' | 'tool-use'
  model: string
  system_prompt: string
  owner_id: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface KnowledgeDoc {
  id: number
  agent_id: number
  title: string
  content: string
  embedding?: number[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface RunParams {
  input: string
  stream?: boolean
  messages?: Array<{ role: string; content: string }>
}

export type RunResult =
  | { output: string; elapsed: number }
  | { stream: ReadableStream<Uint8Array> }

export interface AgentOptions {
  pg: import('../postgres/types.ts').PostgresClient
  /** AI provider for model and embedding resolution. Overridden by explicit model/embeddingModel. */
  provider?: AIProvider
  model?: LanguageModel
  embeddingModel?: EmbeddingModel
  embeddingDimension?: number
  tools?: Record<string, Tool>
}

export interface AgentModule extends Router {
  migrate: () => Promise<void>
  run: (agentId: number, params: RunParams) => Promise<RunResult>
  addKnowledge: (agentId: number, title: string, content: string) => Promise<KnowledgeDoc>
  close: () => Promise<void>
}
