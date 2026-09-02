/**
 * 单条消息组件（P1 从 Chat.tsx 拆分——686 行 → 组件集）
 *
 * 职责：消息渲染（内容/工具步骤/审批/操作/编辑态）——纯展示 + 回调上抛，
 * 状态与 WS 逻辑留在 Chat 页（createStore 化 P2）。
 */
import type { Component } from 'weifuwu/vdom'
import { Ava } from '../../components/ui'
import { Alert, Badge, Button, CopyButton, Icon, Img, Input, Markdown, MessageBubble } from 'weifuwu/components'
import { inputValue } from '../../lib/types'
import type { ChatMessage, MessageTool } from '../../lib/types'
import { detectTaskMarker } from '../../../src/services/task-markers.ts'

/** B-下载（2026-08）：聊天流文件卡片带鉴权下载（<a href> 无 Bearer → 401 实证） */
async function downloadFileCard(deptId: string, rel: string): Promise<void> {
  const { downloadFileAuthorized } = await import('../../lib/download.ts')
  await downloadFileAuthorized(
    `/api/departments/${deptId}/workspace/file?path=${encodeURIComponent(rel)}&download=1`,
    rel.split('/').pop() ?? rel,
  )
}

/** 聊天图片预览（2026-09——三态统一走 Img 组件：
 * - loading：占位块（300×300——布局恒定——chat hydrate 先行挂载）
 * - ready：<Img preview>——占位→图（组件内 onLoad 替换）——点击放大预览
 * - error：占位块失败文案（fetch 失败——解码失败由 Img errorText 兜底）
 * 注意：普通函数返回 vnode——**不能作为 JSX 组件**（组件契约 = 工厂→renderFn——
 * 误用 seg.renderFn is not a function 实证）——调用点 {ChatImagePreview(...)} */
function ChatImagePreview(preview: NonNullable<ChatMessage['preview']>): any {
  const common = { width: 300, height: 300, className: 'wf-radius wf-border' }
  if (preview.state === 'ready' && preview.url) {
    return <Img src={preview.url} alt="AI 生成图片" preview {...common} style={{ objectFit: 'cover' }} />
  }
  return <Img {...common} placeholder
    placeholderText={preview.state === 'error' ? '图片加载失败' : '图片加载中…'} />
}

export interface MessageItemProps {
  msg: ChatMessage
  departmentId: string
  own: boolean
  canEditMsg: boolean
  isAdmin: boolean
  approving: boolean
  editing: boolean
  editValue: string
  expandedToolKey: string | null
  onToggleTool: (key: string) => void
  onReply: (msg: ChatMessage) => void
  onEdit: (msg: ChatMessage) => void
  onDelete: (msg: ChatMessage) => void
  onFeedback: (msg: ChatMessage, v: 'like' | 'dislike' | null) => void
  /** CHAT-INTERACTION 波次 2：快捷确认 chip（仅最后一条 AI 消息渲染——Chat 侧计算） */
  showQuickReplies?: boolean
  onQuickReply?: (msg: ChatMessage, text: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRetry: (id: string) => void
  onContinue: (id: string) => void
  /** 产物审批（2026-12）：聊天流内直接批准/拒绝待审产物 */
  onReview: (action: 'approve' | 'reject', path: string) => void
  reviewBusy: boolean
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
}

// CHAT-UX 波次 3（D3）：绝对时间 HH:mm（相对时间「N 分钟前」需重渲染才更新——
// 死状态 timeVersion 已删；日期由分隔线表达——时间用稳定 HH:mm）
function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = { 'search-knowledge-base': '搜索知识库', 'get-current-time': '获取当前时间', list_files: '列出文件', read: '读取文件', write: '写入文件', edit: '编辑文件', grep: '搜索文件', bash: '执行命令' }
  return labels[name] ?? name.replace(/_/g, ' ')
}

export const MessageItem: Component<MessageItemProps> = (_init) => {
  return (props: MessageItemProps) => {
    const { msg } = props
    const st = msg.status
    const isActive = st === 'thinking' || st === 'generating'
    const isError = st === 'error'
    const showTools = msg.sender_type === 'ai' && (msg.tools ?? []).length > 0

    if (msg.msg_type === 'system') {
      return <div class="wf-center"><span class="wf-pill wf-bg-tertiary wf-text-secondary wf-padding-x-sm wf-padding-y-xs wf-font-xs">{msg.content}</span></div>
    }

    // P2-4：交付物文件卡片（AI 刚生成的文件——可点击下载；进场动效 wf-panel-in）
    // 产物审批（2026-12）：pending 待审——显示徽标 + 批准/拒绝按钮（聊天流内直接审批）
    if (msg.msg_type === 'file_card') {
      const rel = props.msg.content
      const already = rel.includes('（已发布）') || rel.includes('（已拒绝）')
      return (
        <div class="wf-row wf-gap-sm wf-items-center wf-panel-in">
          <Ava name={msg.sender_name ?? 'AI'} type="ai" small />
          <button type="button" class="wf-pill wf-bg-tertiary wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-row wf-gap-xs wf-items-center"
            style="text-decoration: none"
            onClick={() => { void downloadFileCard(props.departmentId, rel.replace(/（已发布|已拒绝）$/, '')) }}>
            <Icon name="file-text" size={12} /> {msg.sender_name ?? 'AI'} 刚生成了 <b class="wf-text-primary">{rel}</b> 下载 ↓
          </button>
          {msg.pending && !already && (
            <>
              <span class="wf-pill wf-bg-warning wf-text-on-warning wf-padding-x-sm wf-padding-y-xs wf-font-xs">⏳ 待审批</span>
              <Button size="sm" variant="primary" disabled={props.reviewBusy} onClick={() => props.onReview('approve', rel)}>批准发布</Button>
              <Button size="sm" variant="danger-ghost" disabled={props.reviewBusy} onClick={() => props.onReview('reject', rel)}>拒绝</Button>
            </>
          )}
          {/* 图片产物卡片直显（2026-09——与 AI 回复文本同链路：hydrate → blob 预览） */}
          {msg.preview && (
            <div class="wf-margin-top-sm">
              {ChatImagePreview(msg.preview)}
            </div>
          )}
        </div>
      )
    }

    return (
      <div data-msgid={String(msg.id).slice(0, 8)} data-msgtype={msg.msg_type} class={`wf-row wf-items-start wf-gap-sm${props.own ? ' wf-row-reverse' : ''}`}>
        <Ava name={msg.sender_name ?? '未知'} type={msg.sender_type ?? 'user'} small />
        <div class={`wf-stack wf-gap-xs wf-shrink${props.own ? ' wf-items-end' : ''}`}>
          <div class={`ap-msg-meta wf-row wf-gap-xs wf-font-xs wf-text-tertiary${props.own ? ' wf-row-reverse' : ''}`}>
            <span>{msg.sender_name ?? '未知'}</span>
            {msg.sender_type === 'ai' && st === 'complete' && (() => { const mk = detectTaskMarker(msg.content); return mk.marker ? <span class="wf-pill wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-text-secondary">{mk.label}</span> : null })()}
            {msg.sender_type === 'ai' && msg.routed_to && st === 'complete' && <span class="wf-pill wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-text-tertiary">任务派给 {msg.routed_to}</span>}
            <span>{fmtTime(msg.created_at)}</span>
            {isActive && <span class="wf-text-primary">{st === 'thinking' ? '思考中...' : '生成中...'}</span>}
            {isError && <span class="wf-text-error">出错了</span>}
            {/* CHAT-UX 波次 3（D1）：操作行 hover 化（ap-msg-actions——触屏常驻、
                键盘 focus-within 展开——A8 可交互红线不影响键盘路径） */}
            {!props.editing && !isActive && (
              <span class="ap-msg-actions wf-row wf-gap-xs">
                <Button size="sm" variant="ghost" onClick={() => props.onReply(msg)}>回复</Button>
                {props.canEditMsg && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => props.onEdit(msg)}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => props.onDelete(msg)}>撤回</Button>
                  </>
                )}
                {!props.own && props.isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => props.onDelete(msg)}>删除</Button>
                )}
              </span>
            )}
            {st === 'complete' && msg.sender_type === 'ai' && msg.content && (
              <span class="ap-msg-actions wf-row wf-gap-xs"><CopyButton size="sm" variant="ghost" value={msg.content} label="复制" /></span>
            )}
            {st === 'complete' && msg.sender_type === 'ai' && !isActive && (
              <span class="ap-msg-actions wf-row wf-gap-xs">
                <button type="button" class="wf-btn wf-btn--ghost wf-btn--sm" aria-label="赞" title="有帮助"
                  style={msg.feedback === 'like' ? { background: 'var(--wf-color-primary-bg)', opacity: 1 } : { opacity: 0.6 }}
                  onClick={() => props.onFeedback(msg, msg.feedback === 'like' ? null : 'like')}>👍</button>
                <button type="button" class="wf-btn wf-btn--ghost wf-btn--sm" aria-label="踩" title="需改进"
                  style={msg.feedback === 'dislike' ? { background: 'var(--wf-color-error-bg)', opacity: 1 } : { opacity: 0.6 }}
                  onClick={() => props.onFeedback(msg, msg.feedback === 'dislike' ? null : 'dislike')}>👎</button>
              </span>
            )}
          </div>

          {msg.reply_content && !props.editing && (
            <div class="wf-border-left wf-padding-left-sm wf-font-xs wf-text-tertiary">
              <span class="wf-text-secondary">↩ {msg.reply_sender ?? '消息'}</span> {String(msg.reply_content ?? '').slice(0, 40)}
            </div>
          )}

          {/* CHAT-INTERACTION 波次 2：HITL 快捷确认 chip（AI 确认型提问——点击即发送；
              仅最后一条 AI 消息渲染——Chat 侧 showQuickReplies 计算，已答/新消息自动消失）。
              不卡 st：历史消息 status 为 null（GET 无此列）——只在流式进行中（isActive）隐藏 */}
          {props.showQuickReplies && !props.editing && !isActive && (msg.quick_replies ?? []).length > 0 && (
            <div class="wf-row wf-gap-xs wf-wrap" role="group" aria-label="快捷回复选项">
              {(msg.quick_replies ?? []).map((qr: string) => (
                <Button key={qr} size="sm" variant="ghost" class="ap-quick-chip"
                  onClick={() => { props.onQuickReply?.(msg, qr) }}>{qr}</Button>
              ))}
            </div>
          )}

          {msg.attachments && msg.attachments.length > 0 && (
            <div class="wf-row wf-gap-xs">
              {msg.attachments.map((att: { name: string; size: number }, i: number) => (
                <span key={i} class="wf-pill wf-bg-tertiary wf-padding-x-sm wf-padding-y-xs wf-font-xs">
                  📎 {att.name}{att.size >= 1024 ? `（${Math.round(att.size / 1024)}KB）` : `（${att.size}B）`}
                </span>
              ))}
            </div>
          )}

          {showTools && (
            <div class="wf-stack wf-gap-xs">
              {(msg.tools ?? []).map((t: MessageTool, i: number) => {
                const tk = `${msg.id}:${i}`
                const expanded = props.expandedToolKey === tk
                return (
                  <div key={i} class="wf-stack wf-gap-none">
                    <button type="button" class="wf-pill wf-bg-primary wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-text-primary wf-text-left"
                      style="background: none; border: none; cursor: pointer"
                      onClick={() => props.onToggleTool(tk)}>
                      <Icon name={t.status === 'running' ? 'clock' : t.status === 'error' ? 'warning' : 'check'} size={12} /> {toolLabel(t.name)}
                      {expanded ? ' ▾' : ' ▸'}
                    </button>
                    {expanded && (
                      <div class="wf-stack wf-gap-xs wf-margin-left-xs wf-margin-top-xs wf-padding-x-sm wf-padding-y-sm wf-radius wf-bg-tertiary">
                        {t.args !== undefined && t.args !== null && (
                          <div class="wf-font-xs">
                            <span class="wf-text-tertiary">参数 </span>
                            <pre class="wf-margin-top-none wf-font-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{typeof t.args === 'string' ? t.args : JSON.stringify(t.args)}</pre>
                          </div>
                        )}
                        {t.result !== undefined && t.result !== null && (
                          <div class="wf-font-xs">
                            <span class="wf-text-tertiary">结果 </span>
                            <pre class="wf-margin-top-none wf-font-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{String(t.result).slice(0, 500)}</pre>
                          </div>
                        )}
                        {t.status === 'error' && <span class="wf-text-error wf-font-xs">执行失败</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!props.editing && (
            <div>
              <MessageBubble
                role={props.own ? 'user' : 'assistant'}
                status={isActive ? 'streaming' : isError ? 'error' : 'complete'}
                className={isActive ? 'wf-dim' : ''}
                content={msg.sender_type === 'ai'
                  ? <Markdown content={msg.content || ''} />
                  : (msg.content || '')}
              />
              {st === 'complete' && msg.usage && (
                <div class="wf-text-right wf-margin-top-xs">
                  <Badge variant="default"><Icon name="zap" size={12} /> {msg.usage.total_tokens} tokens</Badge>
                </div>
              )}
              {/* 图片预览：API 加载的历史消息无 status 字段——以 preview 存在为准
              · 三态统一走 Img 组件（placeholder 下沉——占位/失败/预览组件内自理） */}
              {msg.preview && (
                <div class="wf-margin-top-sm">
                  {ChatImagePreview(msg.preview)}
                </div>
              )}
              {isError && (
                <div class="wf-row wf-gap-xs wf-margin-top-xs">
                  <Button size="sm" variant="ghost" onClick={() => props.onRetry(msg.id)}><Icon name="refresh" size={12} /> 重新生成</Button>
                  <Button size="sm" variant="primary" onClick={() => props.onContinue(msg.id)}><Icon name="arrow-right" size={12} /> 断点续跑</Button>
                </div>
              )}

              {msg.ai_draft && msg.ai_approved === null && (
                <div class="wf-margin-top-sm">
                  <Alert variant="warning">
                    <div class="wf-font-xs wf-semibold wf-margin-bottom-xs"><Icon name="clock" size={12} /> AI 草稿待审批</div>
                    {msg.ai_draft}
                  </Alert>
                  <div class="wf-row wf-gap-xs wf-margin-top-xs">
                    <Button size="sm" disabled={props.approving}
                      onClick={() => props.onApprove(msg.id)}>{props.approving ? '处理中...' : (<><Icon name="check" size={12} /> 批准</>)}
                    </Button>
                    <Button size="sm" variant="danger" disabled={props.approving}
                      onClick={() => props.onReject(msg.id)}><Icon name="close" size={12} /> 拒绝</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {props.editing && (
            <form onSubmit={(e: Event) => { e.preventDefault(); props.onEditSave() }} class="wf-row wf-gap-xs wf-items-start">
              <div class="wf-fill">
                <Input value={props.editValue} onInput={(e: Event) => { props.onEditChange(inputValue(e)) }}
                  onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') props.onEditCancel() }} />
              </div>
              <Button type="submit" size="sm"><Icon name="check" size={14} /></Button>
              <Button type="button" size="sm" variant="secondary" onClick={props.onEditCancel}><Icon name="close" size={14} /></Button>
            </form>
          )}
        </div>
      </div>
    )
  }
}
