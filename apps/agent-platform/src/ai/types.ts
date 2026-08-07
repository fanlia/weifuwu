/**
 * AI 类型兼容层 — 自研 AI 引擎已迁移到框架 ai()，
 * 这里 re-export 框架同构类型，保持 services 的既有 import 路径不破。
 */
export type { MessageRole, ChatMessage, ChatParams, ChatResponse, ToolCall, ToolDefinition } from 'weifuwu'
