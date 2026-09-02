/**
 * 工作空间文件区（DepartmentDetail 拆分子组件——三层模型：部门 = 工作目录）
 * 按部门浏览（/api/departments/:id/workspace/*）——成员共享同一目录：
 * AI 在沙盒里写文件 / 用户放资料，双向可见。
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, EmptyState, Icon, Img, Loading } from 'weifuwu/components'
import { errMsg } from '../../components/ui'
import { onFilesReload, offFilesReload } from '../../lib/project-store.ts'

// ── 类型感知（DELIVERABLES-UX-PLAN W1）──
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const SHEET_EXTS = ['csv', 'xlsx', 'xls', 'tsv']
function isImageName(name: string): boolean {
  return IMG_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '')
}
/** 类型图标名（Icon 白名单面：database/image/file-text——仅返回合法名） */
function wsIconFor(name: string): 'database' | 'image' | 'file-text' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (SHEET_EXTS.includes(ext)) return 'database'
  if (IMG_EXTS.includes(ext)) return 'image'
  return 'file-text'
}

/** 缩略图 blob 缓存（模块级——列表重复渲染/多实例不重复 fetch） */
const thumbCache = new Map<string, string>() // `${deptId}:${rel}` → blobUrl
async function loadThumb(deptId: string, rel: string): Promise<string | null> {
  const key = `${deptId}:${rel}`
  const hit = thumbCache.get(key)
  if (hit) return hit
  try {
    const { authorizedGet } = await import('../../lib/download.ts')
    const res = await authorizedGet(`/api/departments/${deptId}/workspace/file?path=${encodeURIComponent(rel)}&download=1`)
    if (!res.ok) return null
    const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'image/*' }))
    thumbCache.set(key, url)
    return url
  } catch { return null }
}

/** 文件缩略图（图片类——48px——加载前占位——加载后 Img placeholder→图——
 * 点击缩放预览（Img preview——页面内浮层——与聊天图片同体验） */
const FileThumb: Component<{ deptId: string; rel: string; name: string }> = (_init, ctx) => {
  let url: string | null = null
  let started = false
  return (props) => {
    if (!started) {
      started = true
      const cached = thumbCache.get(`${props.deptId}:${props.rel}`)
      if (cached) url = cached
      else void loadThumb(props.deptId, props.rel).then((u) => { if (u) { url = u; ctx.render() } })
    }
    if (url) {
      return <Img src={url} alt={props.name} width={48} height={48} preview placeholder
        className="wf-radius" style={{ objectFit: 'cover' }} />
    }
    return <div class="wf-thumb-ph" title={props.name}
      style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--wf-color-bg-tertiary); border-radius: var(--wf-radius); color: var(--wf-color-text-tertiary)">
      <Icon name="image" size={16} />
    </div>
  }
}

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

// **列表快照/防重入（模块级——跨组件重跑保持——same 判定有效）**：
// 工厂每拍重跑会重置闭包变量——快照必须模块级（否则 same 恒 false——
// 数据未变静默失效——自喂循环实证）——**per-dept 隔离**（多部门页面）
const listSnapshots = new Map<string, string>()
const listInflights = new Set<string>()
/** per-dept 最新数据（跨实例存活——新实例工厂即采纳：重进即时显示 +
 *  inflight 撞车兕底——空目录重进永久「加载中」实证 2027-10） */
const lastData = new Map<string, { path: string; entries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }> }>()

/** 工作区文件区（交付物列表 + 上传/刷新/下载/打开）
 *  2027-08 渲染循环根治：数据未变静默（同路径同快照零 rerender）——
 *  否则 loadWsList 完成 → rerender → diff → 组件重建 → 工厂 → loadWsList
 *  自喂循环（workspace/list 18/s + 55ms 渲染 × 15/s——流式慢/闪烁总根源） */
export const FilesSection: Component<{ departmentId: string; initialFiles?: Array<{ name: string; type: string; size: number; mtime: string }> }> = (_init, ctx) => {
  let wsEntries: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }> = []
  let wsPath = ''
  let wsLoading = true
  // **initialFiles（2026-08）：聚合 API 首帧数据——直接显示——零延迟**——
  // 成员与文件同时出（此前文件等二次 /workspace/list 请求——过一下才出现）
  const hasInitial = !!(_init.initialFiles && _init.initialFiles.length > 0)
  if (hasInitial) {
    wsEntries = _init.initialFiles as typeof wsEntries
    wsLoading = false
  } else {
    // 跨实例数据采纳（2027-10）：重进同部门即时显示上次数据（loading 零闪烁）；
    // 否则新实例 loading=true + same 快照命中 → 永久「加载中」（空目录重进实证）
    const cached = lastData.get(_init.departmentId)
    if (cached) { wsEntries = cached.entries; wsPath = cached.path; wsLoading = false }
  }
  // **mounting 期信号（2026-08）**：工厂 await loadWsList 期间——零 rerender
  // （mounting 违例——此前竞态根因）——工厂返回后 renderFn 读最新 state
  let mounting = true
  let mountingStarted = false
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
    // **防重入 + 数据未变静默（2027-08——自喂循环根治）**：
    // 同路径同快照（name/size/mtime 签名）→ 零 rerender（否则：完成 →
    // rerender → diff → 组件重建 → 工厂 → loadWsList——自喂循环——
    // workspace/list 18/s + 55ms 渲染 × 15/s 实证——流式慢/闪烁总根源）
    if (listInflights.has(departmentId)) return
    listInflights.add(departmentId)
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : ''
      const d = await ctx.api!.get<WsListResponse>(`/api/departments/${departmentId}/workspace/list${q}`)
      const newEntries = d.entries ?? []
      const sig = `${path}|${newEntries.map((e) => e.name + ':' + e.size + ':' + e.mtime).join(',')}`
      const same = listSnapshots.get(departmentId) === sig
      listSnapshots.set(departmentId, sig)
      // 2027-10 修复（空目录重进永久「加载中」实证）：快照命中 ≠ 本实例已初始化——
      // 模块级 Map 跨实例存活，新实例（导航回进/父级重建）本地态还是 loading。
      // 数据在手（fetch 已返回）——本地态一律初始化；仅渲染按需（未变且已初始化
      // → 静默——2027-08 防自喂循环语义保持：同实例刷新 + 数据未变 → 零渲染）
      const localChanged = wsLoading || wsPath !== (d.path ?? wsPath)
      wsEntries = newEntries
      wsPath = d.path ?? wsPath
      lastData.set(departmentId, { path: wsPath, entries: newEntries })
      wsLoading = false
      if ((localChanged || !same) && !mounting) rerender()
    } catch (e) {
      ctx.toast!('加载失败：' + errMsg(e, ''), 'error')
      wsLoading = false
      if (!mounting) rerender()
    } finally {
      listInflights.delete(departmentId)
    }
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

  // 异步启动（2027-08 同步化：工厂无 await——首次加载异步启动——
  // mounting 信号在工厂尾部释放（return 前——此后 rerender 合法））
  if (!mountingStarted) { mountingStarted = true; void loadWsList() }
  mounting = false // 工厂完成信号：此后 loadWsList 的 rerender 合法（异步启动完成）

  return () => {
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
            <div key={entry.name} class="wf-row wf-gap-xs wf-padding-y-xs wf-items-center wf-min-width-0">
              {entry.type === 'file' && isImageName(entry.name) ? (
                <FileThumb deptId={departmentId} rel={wsPath === '/' ? entry.name : `${wsPath}/${entry.name}`} name={entry.name} />
              ) : (
                <Icon name={entry.type === 'dir' ? 'folder' : wsIconFor(entry.name)} size={14} />
              )}
              <button type="button" class="wf-row wf-gap-xs wf-fill wf-text-left wf-min-width-0"
                title={entry.name}
                onClick={() => openWsFile(entry)}>
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
