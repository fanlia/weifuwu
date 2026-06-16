 
import type { Context, Middleware, Closeable } from '../types.ts'
import type { Mailer } from '../mailer.ts'
import type { Hub } from '../hub.ts'
import type { SqlClient } from '../vendor.ts'

declare module '../types.ts' {
  interface Context {
    notifier: Notifier
  }
}

/** Shape injected into ctx when notifier middleware is active. */
export interface NotifierInjected {
  notifier: Notifier
}

/** Configuration for the notifier module. */
export interface NotifierOptions {
  /** SQL client (PostgreSQL) for persistent notifications. */
  sql: SqlClient
  /** Optional mailer for email channel. */
  mailer?: Mailer
  /** Optional hub for WebSocket push channel. */
  hub?: Hub
  /** Default sender name for email (default: system name). */
  fromName?: string
  /** Table name for notifications (default: '_notifications'). */
  table?: string
  /** Max notification list page size (default: 50). */
  pageSize?: number
}

/** A notification message. */
export interface NotifyMessage {
  /** Notification title. */
  title: string
  /** Notification body text. */
  body?: string
  /** Optional action URL. */
  actionUrl?: string
  /** Optional action button text. */
  actionText?: string
  /** Notification type for categorization (default: 'default'). */
  type?: string
  /** Arbitrary metadata (JSON object). */
  metadata?: Record<string, unknown>
}

/** A notification record from the database. */
export interface Notification {
  id: number
  user_id: number
  title: string
  body: string
  action_url: string | null
  action_text: string | null
  type: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

/** Supported notification channels. */
export type NotifyChannel = 'inbox' | 'email' | 'ws'

/** User's channel preferences for a notification type. */
export interface NotifyPreferences {
  /** Which channels are enabled. Default: ['inbox']. */
  channels: NotifyChannel[]
}

/** The notifier API injected into ctx. */
export interface Notifier extends Closeable {
  /**
   * Send a notification to a specific user.
   * Routes through the user's channel preferences automatically.
   */
  send(to: { userId: number; email?: string }, message: NotifyMessage): Promise<void>

  /**
   * Send a system-wide notification to all users.
   * Useful for announcements.
   */
  broadcast(message: NotifyMessage): Promise<void>

  /** Get user's unread notification count. */
  unreadCount(userId: number): Promise<number>

  /** Mark specific notifications as read. If no ids given, mark all as read. */
  markRead(userId: number, notificationIds?: number[]): Promise<void>

  /** List notifications for a user, newest first. */
  list(
    userId: number,
    opts?: { limit?: number; offset?: number; unreadOnly?: boolean },
  ): Promise<Notification[]>

  /** Get or set user's notification channel preferences. */
  getPreferences(userId: number): Promise<NotifyPreferences>
  setPreferences(userId: number, prefs: NotifyPreferences): Promise<void>

  /** Count total notifications for a user. */
  count(userId: number, unreadOnly?: boolean): Promise<number>

  /** Clean up old notifications (older than days). */
  clean(days: number): Promise<number>

  /** Create the notifications and preferences tables. Safe to call multiple times. */
  migrate(): Promise<void>

  /** Release resources. */
  close(): Promise<void>
}

/** Notifier middleware type. */
export interface NotifierMiddleware
  extends Middleware<Context, Context & NotifierInjected>, Notifier {
  /** Alias for backward compatibility. */
  middleware: () => Middleware<Context, Context & NotifierInjected>
}
