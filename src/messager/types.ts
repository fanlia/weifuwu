declare module '../types.ts' {
  interface Context {
    /** Messager instance for conversations and messages. */
    messager: import('./types.ts').MessagerAPI
  }
}

// ═══════════════════════════════════════════════════════════════
// Data models
// ═══════════════════════════════════════════════════════════════

export type ConversationType = 'direct' | 'group'

export interface Conversation {
  id: string
  type: ConversationType
  title: string | null
  created_by: string
  created_at: Date
  updated_at: Date
  /** Number of participants (convenience field) */
  participant_count?: number
  /** Last message preview (for list display) */
  last_message?: MessagePreview | null
  /** Current user's unread count in this conversation */
  unread_count?: number
}

export interface Participant {
  conversation_id: string
  user_id: string
  role: 'member' | 'admin'
  last_read_at: Date | null
  joined_at: Date
  is_active: boolean
}

/** A user in a conversation (includes user_name for display). */
export interface ParticipantUser extends Participant {
  user_name: string
  user_email: string
  user_avatar?: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  sender_name?: string
  body: string
  created_at: Date
  updated_at: Date
  edited: boolean
  deleted_at: Date | null
}

/** Lightweight message used for conversation last_message preview. */
export interface MessagePreview {
  id: string
  body: string
  sender_id: string
  sender_name: string
  created_at: Date
}

// ═══════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════

export interface CreateGroupInput {
  title: string
  userIds: string[]
}

export interface GetMessagesOptions {
  /** Return messages created before this ID (cursor pagination). */
  before?: string
  /** Number of messages (default: 50, max: 200). */
  limit?: number
}

export interface MessagerOptions {
  /** PostgreSQL table prefix for messager tables (default: '' — 'conversations', 'participants', 'messages'). */
  tablePrefix?: string
  /** User table name for sender name lookups (default: 'users'). */
  usersTable?: string
}

// ═══════════════════════════════════════════════════════════════
// Per-request API
// ═══════════════════════════════════════════════════════════════

export interface MessagerAPI {
  // ── Conversations ─────────────────────────────────────

  /** Find or create a direct conversation with another user. */
  createDirectConversation(otherUserId: string): Promise<Conversation>

  /** Create a group conversation. */
  createGroupConversation(title: string, userIds: string[]): Promise<Conversation>

  /** Get conversation by ID. Returns null if not found or caller is not a participant. */
  getConversation(conversationId: string): Promise<Conversation | null>

  /** List current user's active conversations, most recent first. */
  getConversations(): Promise<Conversation[]>

  /** Add participants to a group conversation. Only group admin can do this. */
  addParticipants(conversationId: string, userIds: string[]): Promise<void>

  /** Remove yourself or (as admin) another participant from a group conversation. */
  removeParticipant(conversationId: string, userId?: string): Promise<boolean>

  // ── Messages ──────────────────────────────────────────

  /** Send a message to a conversation. Returns the created message. */
  sendMessage(conversationId: string, body: string): Promise<Message>

  /** Get messages in a conversation, newest first (cursor pagination). */
  getMessages(conversationId: string, opts?: GetMessagesOptions): Promise<Message[]>

  /** Edit a message (only by the original sender, within 24h). */
  editMessage(messageId: string, body: string): Promise<Message | null>

  /** Soft-delete a message (only by the original sender). */
  deleteMessage(messageId: string): Promise<boolean>

  // ── Read state ────────────────────────────────────────

  /** Mark all messages in a conversation as read. */
  markRead(conversationId: string): Promise<void>

  /** Get unread message count across all conversations. */
  getUnreadCount(): Promise<{ total: number; byConversation: Record<string, number> }>
}
