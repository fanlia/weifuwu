/**
 * 执行日志区（AgentDetail 拆分子组件——ai 类型自动加载）
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, Icon, Loading, Timeline } from 'weifuwu/components'
import type { AgentLog } from '../../lib/types'

export const LogsSection: Component<{ agentId: string }> = async (_init, ctx) => {
  let logs: AgentLog[] = []
  let logsLoading = true
  const rerender = () => ctx.render()
  const agentId = _init.agentId

  async function loadLogs() {
    logsLoading = true
    try {
      const d = await ctx.api!.get<{ logs: AgentLog[] }>(`/api/stats/agents/${agentId}/logs`)
      logs = d.logs ?? []; logsLoading = false
      rerender()
    } catch { logsLoading = false; rerender() }
  }
  await loadLogs()

  return async () => (
    <Card id="sec-logs">
      <div class="wf-split wf-margin-bottom-sm">
        <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="list" size={14} /> 执行日志</div>
        <Button size="sm" variant="ghost" onClick={loadLogs}>刷新</Button>
      </div>
      {logsLoading && <Loading />}
      {!logsLoading && logs.length === 0 && <div class="wf-font-sm wf-text-tertiary wf-padding-y-md">暂无执行日志</div>}
      {!logsLoading && logs.length > 0 && (
        <Timeline items={logs.map((log: AgentLog) => ({
          key: log.id,
          title: '🤖 AI 执行',
          time: log.created_at ? new Date(log.created_at).toLocaleTimeString() : undefined,
          status: log.success === false ? 'error' : 'success',
          content: `${log.messages_count ?? 0} 条消息 · ${log.tokens_total ?? 0} tokens · ${log.elapsed_ms ?? 0}ms`,
        }))} />
      )}
    </Card>
  )
}
