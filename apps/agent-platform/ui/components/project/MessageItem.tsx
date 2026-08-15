/**
 * 单条消息组件（P1 从 Chat.tsx 拆分——686 行 → 组件集）
 *
 * 职责：消息渲染（内容/工具步骤/审批/操作/编辑态）——纯展示 + 回调上抛，
 * 状态与 WS 逻辑留在 Chat 页（createStore 化 P2）。
 */
import type { Component } from 'weifuwu/ui-dom'
import { Ava } from '../../components/ui'
import { Alert, Badge, Button, CopyButton, Icon, Input, Markdown, MessageBubble } from 'weifuwu/components'
import { inputValue } from '../../lib/types'
import type { ChatMessage, MessageTool } from '../../lib/types'
import { detectTaskMarker } from '../../../src/services/task-markers.ts'

export interface MessageItemProps {
  msg: ChatMessage
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
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRetry: (id: string) => void
  onContinue: (id: string) => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = { 'search-knowledge-base': '搜索知识库', 'get-current-time': '获取当前时间', list_files: '列出文件', read: '读取文件', write: '写入文件', edit: '编辑文件', grep: '搜索文件', bash: '执行命令' }
  return labels[name] ?? name.replace(/_/g, ' ')
}

export const MessageItem: Component<MessageItemProps> = async (_init) => {
  return async (props: MessageItemProps) => {
    const { msg } = props
    const st = msg.status
    const isActive = st === 'thinking' || st === 'generating'
    const isError = st === 'error'
    const showTools = msg.sender_type === 'ai' && (msg.tools ?? []).length > 0

    if (msg.msg_type === 'system') {
      return <div class="wf-center"><span class="wf-pill wf-bg-tertiary wf-text-secondary wf-px-sm wf-py-xs wf-text-xs">{msg.content}</span></div>
    }

    return (
      <div data-msgid={String(msg.id).slice(0, 8)} data-msgtype={msg.msg_type} class={`wf-row wf-top wf-gap-sm${props.own ? ' wf-row-reverse' : ''}`}>
        <Ava name={msg.sender_name ?? '未知'} type={msg.sender_type ?? 'user'} small />
        <div class={`wf-stack wf-gap-xs wf-shrink${props.own ? ' wf-bottom' : ''}`}>
          <div class={`wf-row wf-gap-xs wf-text-xs wf-text-tertiary${props.own ? ' wf-row-reverse' : ''}`}>
            <span>{msg.sender_name ?? '未知'}</span>
            {msg.sender_type === 'ai' && st === 'complete' && (() => { const mk = detectTaskMarker(msg.content); return mk.marker ? <span class="wf-pill wf-px-sm wf-py-xs wf-text-xs wf-text-secondary">{mk.label}</span> : null })()}
            <span>{fmtTime(msg.created_at)}</span>
            {isActive && <span class="wf-text-brand">{st === 'thinking' ? '思考中...' : '生成中...'}</span>}
            {isError && <span class="wf-text-error">出错了</span>}
            {!props.editing && !isActive && (
              <span class="wf-row wf-gap-xs">
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
              <CopyButton size="sm" variant="ghost" value={msg.content} label="复制" />
            )}
            {st === 'complete' && msg.sender_type === 'ai' && !isActive && (
              <span class="wf-row wf-gap-xs">
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
            <div class="wf-border-l wf-pl-sm wf-text-xs wf-text-tertiary">
              <span class="wf-text-secondary">↩ {msg.reply_sender ?? '消息'}</span> {String(msg.reply_content ?? '').slice(0, 40)}
            </div>
          )}

          {msg.attachments && msg.attachments.length > 0 && (
            <div class="wf-row wf-gap-xs wf-wrap">
              {msg.attachments.map((att: { name: string; size: number }, i: number) => (
                <span key={i} class="wf-pill wf-bg-tertiary wf-px-sm wf-py-xs wf-text-xs">
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
                    <button type="button" class="wf-pill wf-bg-brand wf-px-sm wf-py-xs wf-text-xs wf-text-brand wf-text-left"
                      style="background: none; border: none; cursor: pointer"
                      onClick={() => props.onToggleTool(tk)}>
                      <Icon name={t.status === 'running' ? 'clock' : t.status === 'error' ? 'warning' : 'check'} size={12} /> {toolLabel(t.name)}
                      {expanded ? ' ▾' : ' ▸'}
                    </button>
                    {expanded && (
                      <div class="wf-stack wf-gap-xs wf-ml-xs wf-mt-xs wf-px-sm wf-py-sm wf-rounded wf-bg-tertiary">
                        {t.args !== undefined && t.args !== null && (
                          <div class="wf-text-xs">
                            <span class="wf-text-tertiary">参数 </span>
                            <pre class="wf-mt-none wf-text-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{typeof t.args === 'string' ? t.args : JSON.stringify(t.args)}</pre>
                          </div>
                        )}
                        {t.result !== undefined && t.result !== null && (
                          <div class="wf-text-xs">
                            <span class="wf-text-tertiary">结果 </span>
                            <pre class="wf-mt-none wf-text-xs" style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-all">{String(t.result).slice(0, 500)}</pre>
                          </div>
                        )}
                        {t.status === 'error' && <span class="wf-text-error wf-text-xs">执行失败</span>}
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
                <div class="wf-text-right wf-mt-xs">
                  <Badge variant="default"><Icon name="zap" size={12} /> {msg.usage.total_tokens} tokens</Badge>
                </div>
              )}
              {isError && (
                <div class="wf-row wf-gap-xs wf-mt-xs">
                  <Button size="sm" variant="ghost" onClick={() => props.onRetry(msg.id)}><Icon name="refresh" size={12} /> 重新生成</Button>
                  <Button size="sm" variant="primary" onClick={() => props.onContinue(msg.id)}><Icon name="arrow-right" size={12} /> 断点续跑</Button>
                </div>
              )}

              {msg.ai_draft && msg.ai_approved === null && (
                <div class="wf-mt-sm">
                  <Alert variant="warning">
                    <div class="wf-text-xs wf-text-semibold wf-mb-xs"><Icon name="clock" size={12} /> AI 草稿待审批</div>
                    {msg.ai_draft}
                  </Alert>
                  <div class="wf-row wf-gap-xs wf-mt-xs">
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
            <form onSubmit={(e: Event) => { e.preventDefault(); props.onEditSave() }} class="wf-row wf-gap-xs wf-top">
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
