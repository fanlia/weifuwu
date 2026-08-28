/**
 * 交付物中心页（B1——2026-08——「AI 干的活在哪找」）
 *
 * 形态：Dashboard 心智聚合视图——跨部门 AI 交付物（mtime 降序）：
 *  - 列表：部门 / 文件名 / 大小 / 时间——每行打开（读取端点）/ 下载
 *  - 搜索（文件名过滤——纯前端）
 *  - 空态：提示 AI 干活后此处可见（价值主张引导）
 */
import type { Component } from 'weifuwu/vdom'
import { EmptyState, Loading, PageHeader, errMsg } from '../components/ui'
import { Badge, Button, Card, Icon, Input } from 'weifuwu/components'
import { inputValue } from '../lib/types'

/** B-打开（2026-08）：交付物预览带鉴权（<a target=_blank> 无 Bearer → 401 实证）——
 * fetch + token → blob URL → 新窗口打开 */
async function openDeliverable(deptId: string, path: string): Promise<void> {
  const { authorizedGet } = await import('../lib/download.ts')
  try {
    const res = await authorizedGet(`/api/departments/${deptId}/workspace/file?path=${encodeURIComponent(path)}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch { /* 打开失败忽略 */ }
}

interface DeliverableFile {
  deptId: string
  deptName: string
  path: string
  name: string
  size: number
  mtime: string
}

export const Deliverables: Component = async (_init, ctx) => {
  // B-修复（2026-08）：裸 `let` 改为 `$` 状态对象（与 Reports/Workspace 一致——
  // 这两个正常）——裸 let 在 async 组件双端模块（SSR/server + client）可能存在
  // 闭包逃逸——日志证实 renderFn 读到 files=9 但 DOM 空态（diff 未触及）
  const $ = {
    files: [] as DeliverableFile[],
    loading: true,
    error: '',
    query: '',
  }
  const rerender = () => ctx.render()

  async function load() {
    // B-根因修复（2026-08）：**工厂执行期间禁止 ctx.render()**——
    // 首帧 loading=true 已是初始态——无需先 rerender（工厂期间 rerender →
    // 组件状态机违例「root.0 正在 mount」→ 渲染中断 → DOM 空态——
    // 用户实证 /deliverables 空态的根因）——首次只取数；手动刷新才 rerender
    if (!$.loading) {
      $.loading = true
      rerender()
    }
    // B-修复（2026-08）：改 Promise.then 模式（与 Reports 一致性——Reports 是
    // 唯一正常的同类页面——其 rerender 在 .then 回调（异步外部）——await 续段
    // 可能被框架当工厂 await 处理——DOM 不更新实证）
    return ctx.api!.get<{ files: DeliverableFile[] }>('/api/deliverables')
      .then((d) => {
        $.files = d.files ?? []
        $.error = ''
        $.loading = false
        rerender()
      })
      .catch((e) => {
        $.error = errMsg(e, '加载失败')
        $.loading = false
        rerender()
      })
  }
  void load()

  const fmtSize = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : n > 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`
  const fmtTime = (t: string) => {
    const d = new Date(t)
    const now = Date.now()
    const diff = now - d.getTime()
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }

  // 根因（2026-08）：`const shown = ...` 在工厂捕获 `$.files` **引用**——
  // `$.files = d.files` 替换引用后 shown 仍指旧空数组（renderFn 读不到
  // 新数据——DOM 空态）——改为函数——每次渲染按最新 state 计算
  const shownOf = () => $.query
    ? $.files.filter((f) => f.name.toLowerCase().includes($.query.toLowerCase()) || f.path.toLowerCase().includes($.query.toLowerCase()))
    : $.files

  return async () => {
    const shown = shownOf()
    return (
      <div class="wf-container wf-stack wf-gap-lg wf-padding-lg" style="--wf-max: 980px">
        <PageHeader title="交付物中心" sub="AI 在各部门干的活——最近产物聚合（每部门工作区实时扫描）" />
        <div class="wf-row wf-justify-between wf-gap-sm">
          <Input placeholder="搜索文件名..." value={$.query} onInput={(e: Event) => { $.query = inputValue(e); rerender() }} style="max-width: 280px" />
          <Button size="sm" variant="ghost" onClick={() => void load()}><Icon name="refresh" size={14} /> 刷新</Button>
        </div>
        {$.error && <Badge variant="error">{$.error}</Badge>}
        {shown.length === 0 ? (
          <div class="wf-stack wf-gap-sm wf-padding-xl">
            <div class="wf-font-lg">📦 {$.query ? '没有匹配的交付物' : '还没有交付物'}</div>
            <div class="wf-font-sm wf-text-tertiary">让 AI 在部门群里写文件（如：帮我写一份周报）——产物会出现在这里</div>
          </div>
        ) : (
          <div class="wf-stack wf-gap-none wf-padding-sm">
            {shown.map((f, i) => (
              <div key={`${f.deptId}:${f.path}`} class="wf-row wf-justify-between wf-gap-sm" style={{ padding: '10px 12px', borderBottom: i < shown.length - 1 ? '1px solid var(--wf-color-border, #eee)' : 'none' }}>
                <div class="wf-stack wf-gap-xs wf-fill">
                  <a class="wf-font-sm wf-text-primary" style="text-decoration:none;cursor:pointer"
                    onClick={() => { ctx.app?.navigate(`/chat/${f.deptId}`) }}>
                    {f.path} <span class="wf-text-tertiary wf-font-xs">({f.deptName})</span>
                  </a>
                  <span class="wf-font-xs wf-text-tertiary">{fmtSize(f.size)} · {fmtTime(f.mtime)}</span>
                </div>
                <button type="button"
                  class="wf-btn wf-btn--sm wf-btn--secondary" style="text-decoration:none"
                  onClick={() => { void openDeliverable(f.deptId, f.path) }}>
                  <Icon name="external-link" size={14} /> 打开
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
}
