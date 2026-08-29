/**
 * 工作空间文件区（DepartmentDetail 拆分子组件——三层模型：部门 = 工作目录）
 * 按部门浏览（/api/departments/:id/workspace/*）——成员共享同一目录：
 * AI 在沙盒里写文件 / 用户放资料，双向可见。
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, EmptyState, Icon, Loading } from 'weifuwu/components'
import { errMsg } from '../../components/ui'
import { onFilesReload, offFilesReload } from '../../lib/project-store.ts'

/** B-下载（2026-08）：带鉴权下载——`<a href>` 导航无 Bearer → 401（用户实证）——
 * fetch + token → Blob → 编程式 <a download>（支持二进制）——返回是否成功 */
async function downloadWsFile(departmentId: string, rel: string, name: string): Promise<boolean> {
  const { downloadFileAuthorized } = await import('../../lib/download.ts')
  return downloadFileAuthorized(
    `/api/departments/${departmentId}/workspace/file?path=${encodeURIComponent(rel)}&download=1`,
    name,
  )
}

/** 工作区列表响应（/api/departments/:id/workspace/list） */
interface WsListResponse {
  path: string
  entries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }>
}
/** 工作区文件读取响应 */
interface WsFileResponse {
  binary: boolean
  content?: string
  truncated?: boolean
  size: number
}
interface WsSaveResponse { success: boolean }
interface WsUploadResponse { success: boolean; name: string; size: number; error?: string }

export const FilesSection: Component<{ departmentId: string }> = async (_init, ctx) => {
  let wsEntries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }> = []
  let wsPath = ''
  let wsLoading = true
  let wsOpenFile: { path: string; content: string; binary: boolean; truncated: boolean; size: number } | null = null
  let wsEditContent = ''
  let wsSaving = false
  const rerender = () => ctx.render()
  const departmentId = _init.departmentId
  // P1-3：AI 写文件 → Chat 的 file_updated 事件 → notifyFilesReload → 自动刷新
  // （注册表方案：render-only 模型下 useExternal 的 render([id]) 对动态子组件不可靠）
  const reloadCb = () => { if (!wsOpenFile) void loadWsList(wsPath) }
  onFilesReload(reloadCb)
  // 退订（组件卸载/重建时清理——模块级注册表不累积：多代实例时旧回调不再触发
  // loadWsList（fetch 浪费）；实测 onFilesReload 只注册不退订 → Set 累积）
  ctx.ui.onUnmount?.(() => { offFilesReload(reloadCb) })

  async function loadWsList(path = '') {
    // 2026-08（入驻左栏后不渲染根因）：工厂 await loadWsList（mounting 期）——
    // 内部 rerender → mounting 违例 → mount 失败循环（8次请求实证）——
    // **mounting 期（initial）零 rerender**（loadWsList 末尾的 rerender 只在
    // 工厂外（用户刷新/回调）执行——mount 完成后 renderFn 读最新 state）
    const mounting = wsLoading
    if (!mounting) { wsLoading = true; rerender() }
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : ''
      const d = await ctx.api!.get<WsListResponse>(`/api/departments/${departmentId}/workspace/list${q}`)
      wsEntries = d.entries ?? []; wsPath = d.path ?? '/'
    } catch (e) { ctx.toast!('加载失败：' + errMsg(e, ''), 'error') }
    wsLoading = false
    // mounting 期不 rerender（工厂 return 后 renderFn 读最新——无需额外渲染）
    if (!mounting) rerender()
  }

  async function openWsFile(entry: { name: string; type: string }) {
    if (entry.type === 'dir') {
      await loadWsList(wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`)
      return
    }
    try {
      const rel = wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`
      const d = await ctx.api!.get<WsFileResponse>(`/api/departments/${departmentId}/workspace/file?path=${encodeURIComponent(rel)}`)
      if (d.binary) { ctx.toast!('二进制文件不可预览', 'error'); return }
      wsOpenFile = { path: rel, content: d.content ?? '', binary: !!d.binary, truncated: !!d.truncated, size: d.size }
      wsEditContent = d.content ?? ''
      rerender()
    } catch (e) { ctx.toast!('读取失败：' + errMsg(e, ''), 'error') }
  }

  async function saveWsFile() {
    if (!wsOpenFile) return
    wsSaving = true; rerender()
    try {
      const d = await ctx.api!.put<WsSaveResponse>(`/api/departments/${departmentId}/workspace/file`, { path: wsOpenFile.path, content: wsEditContent })
      if (d.success) { ctx.toast!('已保存', 'success'); wsOpenFile = null; await loadWsList() }
    } catch (e) { ctx.toast!('保存失败：' + errMsg(e, ''), 'error') }
    wsSaving = false; rerender()
  }

  function wsBreadcrumbParts(): string[] {
    if (!wsPath || wsPath === '/') return []
    return wsPath.split('/').filter(Boolean)
  }

  // P1-3 配置页上传（二进制预置资料）
  let wsFileInputEl: HTMLInputElement | null = null
  const wsFileInputRef = (el: any) => { wsFileInputEl = el }
  const pickWsFile = () => { wsFileInputEl?.click() }
  const onWsFilePick = (e: Event) => {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { ctx.toast!('文件过大（上限 20MB）', 'warning'); input.value = ''; return }
    const reader = new FileReader()
    reader.onload = async () => {
      const data = String(reader.result ?? '').split(',')[1] ?? ''
      ctx.toast!('上传中...', 'info')
      try {
        const rel = wsPath === '/' ? '' : wsPath
        const d = await ctx.api!.post<WsUploadResponse>(`/api/departments/${departmentId}/workspace/upload`, { path: rel, name: f.name, data, size: f.size })
        if (d.success) { ctx.toast!(`已上传 ${d.name}（${d.size} 字节）`, 'success'); await loadWsList() }
        else ctx.toast!('上传失败：' + (d.error ?? ''), 'error')
      } catch (err) { ctx.toast!('上传失败：' + errMsg(err, ''), 'error') }
      rerender()
    }
    reader.readAsDataURL(f)
    input.value = ''
  }

  await loadWsList()

  return async () => {
    return (
    <Card id="sec-files">
      <div class="wf-split wf-margin-bottom-sm">
        <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="folder" size={14} /> 工作空间文件{wsEntries.length > 0 && <span class="wf-pill wf-bg-tertiary wf-padding-x-sm wf-padding-y-xs wf-font-xs wf-margin-left-sm">{wsEntries.length} 项</span>}</div>
        <div class="wf-row wf-gap-xs">
          <Button size="sm" variant="ghost" onClick={pickWsFile}><Icon name="upload" size={13} /> 上传文件</Button>
          <input ref={wsFileInputRef} type="file" hidden onChange={(e: Event) => { onWsFilePick(e) }} />
          <Button size="sm" variant="ghost" onClick={() => loadWsList()}>刷新</Button>
        </div>
      </div>
      <div class="wf-font-xs wf-text-tertiary wf-margin-bottom-sm">沙盒内 AI 写入的文件与此处一致（卷挂载共享）——AI 干活时刷新即可看到进度</div>

      {wsOpenFile ? (
        <div class="wf-stack wf-gap-sm">
          <div class="wf-row wf-gap-xs">
            <Button size="sm" variant="ghost" onClick={() => { wsOpenFile = null; rerender() }}>返回列表</Button>
            <span class="wf-font-sm wf-medium wf-fill wf-truncate">{wsOpenFile.path}</span>
          </div>
          <textarea rows={12} value={wsEditContent} onInput={(e: Event) => { wsEditContent = (e.target as HTMLTextAreaElement).value; rerender() }} />
          <div class="wf-justify-end">
            <Button size="sm" variant="primary" disabled={wsSaving} onClick={saveWsFile}>{wsSaving ? '保存中...' : '保存'}</Button>
          </div>
        </div>
      ) : (
        <>
          <div class="wf-row wf-gap-xs wf-margin-bottom-xs wf-font-xs wf-text-secondary">
            <Button size="sm" variant="ghost" disabled={wsPath === '/'} onClick={() => loadWsList('')}>/</Button>
            {wsBreadcrumbParts().map((p, i) => {
              const target = wsBreadcrumbParts().slice(0, i + 1).join('/')
              return (
                <span key={i} class="wf-row wf-gap-xs">
                  <span>/</span>
                  <button type="button" class="wf-text-secondary wf-font-xs" onClick={() => loadWsList(target)}>{p}</button>
                </span>
              )
            })}
          </div>
          {wsLoading && <Loading />}
          {!wsLoading && wsEntries.length === 0 && <EmptyState icon="📂" text="空目录" hint="沙盒内 AI 写文件后此处可见" />}
          {wsEntries.map((entry) => (
            <div key={entry.name} class="wf-row wf-gap-xs wf-padding-y-xs wf-items-center">
              <button type="button" class="wf-row wf-gap-xs wf-fill wf-text-left"
                onClick={() => openWsFile(entry)}>
                <Icon name={entry.type === 'dir' ? 'folder' : 'file-text'} size={14} />
                <span class="wf-font-sm wf-medium wf-truncate">{entry.name}{entry.type === 'dir' ? '/' : ''}</span>
              </button>
              <span class="wf-font-xs wf-text-tertiary wf-nums">{entry.type === 'file' && entry.size > 1024 ? (entry.size / 1024).toFixed(1) + 'KB' : entry.size + 'B'}</span>
              <span class="wf-font-xs wf-text-tertiary wf-nums">{new Date(entry.mtime).toLocaleTimeString()}</span>
              {entry.type === 'file' && (
                <button type="button" class="wf-btn wf-btn--ghost wf-btn--sm" title="下载（AI 产物交付）"
                  onClick={() => { void downloadWsFile(departmentId, wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`, entry.name).then((ok) => { if (!ok) ctx.toast?.('下载失败：文件取不到（请检查登录态/文件状态）', 'error') }) }}>
                  <Icon name="arrow-down" size={13} />
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </Card>
    )
  }
}
