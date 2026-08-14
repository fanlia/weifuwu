/**
 * 工作空间文件区（AgentDetail 拆分子组件——列目录/打开/编辑/保存）
 */
import type { Component } from 'weifuwu/ui-dom'
import { Button, Card, EmptyState, Icon, Loading } from 'weifuwu/components'
import { errMsg } from '../../components/ui'

export const FilesSection: Component<{ agentId: string }> = async (_init, ctx) => {
  let wsEntries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }> = []
  let wsPath = ''
  let wsLoading = true
  let wsOpenFile: { path: string; content: string; binary: boolean; truncated: boolean; size: number } | null = null
  let wsEditContent = ''
  let wsSaving = false
  const rerender = () => ctx.ui.render()
  const agentId = _init.agentId

  async function loadWsList(path = '') {
    wsLoading = true; rerender()
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : ''
      const d = await ctx.api!.get(`/api/agents/${agentId}/workspace/list${q}`)
      wsEntries = d.entries ?? []; wsPath = d.path ?? '/'
    } catch (e) { ctx.toast!('加载失败：' + errMsg(e, ''), 'error') }
    wsLoading = false; rerender()
  }

  async function openWsFile(entry: { name: string; type: string }) {
    if (entry.type === 'dir') {
      await loadWsList(wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`)
      return
    }
    try {
      const rel = wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`
      const d = await ctx.api!.get(`/api/agents/${agentId}/workspace/file?path=${encodeURIComponent(rel)}`)
      if (d.binary) { ctx.toast!('二进制文件不可预览', 'error'); return }
      wsOpenFile = { path: rel, content: d.content ?? '', binary: d.binary, truncated: d.truncated, size: d.size }
      wsEditContent = d.content ?? ''
      rerender()
    } catch (e) { ctx.toast!('读取失败：' + errMsg(e, ''), 'error') }
  }

  async function saveWsFile() {
    if (!wsOpenFile) return
    wsSaving = true; rerender()
    try {
      const d = await ctx.api!.put(`/api/agents/${agentId}/workspace/file`, { path: wsOpenFile.path, content: wsEditContent })
      if (d.success) { ctx.toast!('已保存', 'success'); wsOpenFile = null; await loadWsList() }
    } catch (e) { ctx.toast!('保存失败：' + errMsg(e, ''), 'error') }
    wsSaving = false; rerender()
  }

  function wsBreadcrumbParts(): string[] {
    if (!wsPath || wsPath === '/') return []
    return wsPath.split('/').filter(Boolean)
  }

  await loadWsList()

  return async () => (
    <Card id="sec-files">
      <div class="wf-split wf-mb-sm">
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="folder" size={14} /> 工作空间文件</div>
        <Button size="sm" variant="ghost" onClick={() => loadWsList()}>刷新</Button>
      </div>
      <div class="wf-text-xs wf-text-tertiary wf-mb-sm">沙盒内 AI 写入的文件与此处一致（卷挂载共享）——AI 干活时刷新即可看到进度</div>

      {wsOpenFile ? (
        <div class="wf-stack wf-gap-sm">
          <div class="wf-row wf-gap-xs">
            <Button size="sm" variant="ghost" onClick={() => { wsOpenFile = null; rerender() }}>返回列表</Button>
            <span class="wf-text-sm wf-text-medium wf-fill wf-truncate">{wsOpenFile.path}</span>
          </div>
          <textarea rows={12} value={wsEditContent} onInput={(e: Event) => { wsEditContent = (e.target as HTMLTextAreaElement).value; rerender() }} />
          <div class="wf-right">
            <Button size="sm" variant="primary" disabled={wsSaving} onClick={saveWsFile}>{wsSaving ? '保存中...' : '保存'}</Button>
          </div>
        </div>
      ) : (
        <>
          <div class="wf-row wf-gap-xs wf-mb-xs wf-text-xs wf-text-secondary">
            <Button size="sm" variant="ghost" disabled={wsPath === '/'} onClick={() => loadWsList('')}>/</Button>
            {wsBreadcrumbParts().map((p, i) => {
              const target = wsBreadcrumbParts().slice(0, i + 1).join('/')
              return (
                <span key={i} class="wf-row wf-gap-xs">
                  <span>/</span>
                  <button type="button" class="wf-text-secondary wf-text-xs" onClick={() => loadWsList(target)}>{p}</button>
                </span>
              )
            })}
          </div>
          {wsLoading && <Loading />}
          {!wsLoading && wsEntries.length === 0 && <EmptyState icon="📂" text="空目录" hint="沙盒内 AI 写文件后此处可见" />}
          {wsEntries.map((entry) => (
            <button key={entry.name} type="button" class="wf-row wf-gap-xs wf-py-xs wf-fill wf-text-left"
              onClick={() => openWsFile(entry)}>
              <Icon name={entry.type === 'dir' ? 'folder' : 'file-text'} size={14} />
              <span class="wf-text-sm wf-text-medium">{entry.name}{entry.type === 'dir' ? '/' : ''}</span>
              <span class="wf-fill" />
              {entry.type === 'file' && <span class="wf-text-xs wf-text-tertiary wf-nums">{entry.size > 1024 ? (entry.size / 1024).toFixed(1) + 'KB' : entry.size + 'B'}</span>}
              <span class="wf-text-xs wf-text-tertiary wf-nums">{new Date(entry.mtime).toLocaleTimeString()}</span>
            </button>
          ))}
        </>
      )}
    </Card>
  )
}
