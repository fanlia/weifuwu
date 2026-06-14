import type { Router } from '../router.ts'
import type { AgentModule } from '../agent/types.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { Redis } from '../vendor.ts'
import type { Closeable } from '../types.ts'

export interface MessagerOptions {
  pg: PostgresClient
  agents?: AgentModule
  webhookTimeout?: number
  redis?: Redis
}

export interface Channel {
  id: number
  tenant_id: string | null
  name: string
  type: 'channel' | 'dm'
  created_by: number
  created_at: string
}

export interface ChannelMember {
  id: number
  channel_id: number
  member_id: number
  member_type: 'user' | 'agent' | 'webhook'
  role: 'admin' | 'member'
  last_read_id: number | null
}

export interface Message {
  id: number
  channel_id: number
  sender_id: number
  sender_type: 'user' | 'agent' | 'webhook'
  type: 'text' | 'image' | 'file' | 'system'
  content: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export interface MessagerModule extends Router, Closeable {
  migrate: () => Promise<void>
  wsHandler: () => any
  send: (
    channelId: number,
    content: string,
    opts?: {
      sender_type?: string
      sender_id?: number
      type?: string
    },
  ) => Promise<Message>
  close: () => Promise<void>
}

export interface WSMessage {
  type: 'message' | 'typing' | 'read'
  channel_id: number
  content?: string
  is_typing?: boolean
  last_message_id?: number
}
