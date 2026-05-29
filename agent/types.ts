import type { LanguageModel, EmbeddingModel, Tool } from 'ai'

export interface AgentConfig {
  id: number
  tenant_id: string | null
  name: string
  description: string
  type: 'chat' | 'workflow'
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
  pg: any
  model?: LanguageModel
  embeddingModel?: EmbeddingModel
  embeddingDimension?: number
  tools?: Record<string, Tool>
}

export interface AgentModule {
  migrate: () => Promise<void>
  router: () => any
  run: (agentId: number, params: RunParams) => Promise<RunResult>
  addKnowledge: (agentId: number, title: string, content: string) => Promise<KnowledgeDoc>
  close: () => Promise<void>
}
