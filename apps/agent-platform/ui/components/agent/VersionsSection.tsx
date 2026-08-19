/**
 * 版本管理区（AgentDetail 拆分子组件——保存快照/回滚）
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, Icon, Input } from 'weifuwu/components'
import { inputValue, type AgentVersion } from '../../lib/types'

export const VersionsSection: Component<{ agentId: string }> = async (_init, ctx) => {
  let versions: AgentVersion[] = []
  let versionNote = ''
  let savingVersion = false
  let rollingBack: string | null = null
  const rerender = () => ctx.render()
  const agentId = _init.agentId

  function fmtVersionTime(t: string): string {
    try { return new Date(t).toLocaleString().slice(0, 16) } catch { return String(t ?? '').slice(0, 16) }
  }
  function loadVersions() {
    void ctx.api!.get<{ versions: AgentVersion[] }>(`/api/agents/${agentId}/versions`).then((d) => { versions = d.versions ?? []; rerender() }).catch(() => {})
  }
  async function saveVersionFn() {
    savingVersion = true; rerender()
    await ctx.api!.post(`/api/agents/${agentId}/versions`, { note: versionNote }).then(() => {
      versionNote = ''; ctx.toast?.('版本已保存', 'success'); loadVersions()
    }).catch(() => ctx.toast?.('保存失败', 'error'))
    savingVersion = false; rerender()
  }
  async function rollbackVersionFn(versionId: string) {
    const ok = await ctx.confirm?.('回滚将覆盖当前配置，确定继续？')
    if (ok === false) return
    rollingBack = versionId; rerender()
    await ctx.api!.post(`/api/agents/${agentId}/versions/${versionId}/rollback`).then(() => {
      ctx.toast?.('已回滚', 'success'); ctx.browser?.reload?.()
    }).catch(() => ctx.toast?.('回滚失败', 'error'))
    rollingBack = null; rerender()
  }
  loadVersions()

  return async () => (
    <Card id="sec-versions">
      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="refresh" size={14} /> 版本管理</div>
      <div class="wf-text-xs wf-text-tertiary wf-mb-sm">保存当前配置快照，可随时回滚（系统提示/模型/工具/配额等）</div>
      <div class="wf-row wf-gap-xs wf-mb-sm">
        <div class="wf-fill"><Input placeholder="版本备注（可选）" value={versionNote}
          onInput={(e: Event) => { versionNote = inputValue(e); rerender() }} /></div>
        <Button size="sm" disabled={savingVersion} onClick={saveVersionFn}>
          {savingVersion ? '保存中...' : '保存版本'}
        </Button>
      </div>
      <div class="wf-stack wf-gap-xs">
        {versions.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">暂无版本——保存第一个版本开始管理</div>
        ) : versions.map((v: AgentVersion) => (
          <div key={v.id} class="wf-split wf-py-sm wf-border-b">
            <div class="wf-stack wf-gap-none">
              <span class="wf-text-sm">v{v.version} · {v.note ?? '版本'}</span>
              <span class="wf-text-xs wf-text-tertiary">{fmtVersionTime(v.created_at)}</span>
            </div>
            <Button size="sm" variant="ghost" disabled={rollingBack === v.id}
              onClick={() => rollbackVersionFn(v.id)}>{rollingBack === v.id ? '回滚中...' : '回滚'}</Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
