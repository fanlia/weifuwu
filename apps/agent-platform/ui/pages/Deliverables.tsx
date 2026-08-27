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

interface DeliverableFile {
  deptId: string
  deptName: string
  path: string
  name: string
  size: number
  mtime: string
}

export const Deliverables: Component = async (_init, ctx) => {
  let files: DeliverableFile[] = []
  let loading = true
  let error = ''
  let query = ''
  const rerender = () => ctx.render()

  async function load() {
    loading = true; rerender()
    try {
      const d = await ctx.api!.get<{ files: DeliverableFile[] }>('/api/deliverables')
      files = d.files ?? []
      error = ''
    } catch (e) { error = errMsg(e, '加载失败') }
    loading = false; rerender()
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

  const shown = query
    ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.path.toLowerCase().includes(query.toLowerCase()))
    : files

  return async () => {
    if (loading) return <div class="wf-padding-xl"><Loading /></div>
    return (
      <div class="wf-container wf-stack wf-gap-lg wf-padding-lg" style="--wf-max: 980px">
        <PageHeader title="交付物中心" sub="AI 在各部门干的活——最近产物聚合（每部门工作区实时扫描）" />
        <div class="wf-row wf-justify-between wf-gap-sm">
          <Input placeholder="搜索文件名..." value={query} onInput={(e: Event) => { query = inputValue(e); rerender() }} style="max-width: 280px" />
          <Button size="sm" variant="ghost" onClick={() => void load()}><Icon name="refresh" size={14} /> 刷新</Button>
        </div>
        {error && <Badge variant="error">{error}</Badge>}
        {shown.length === 0 ? (
          <EmptyState
            icon="📦"
            text={query ? '没有匹配的交付物' : '还没有交付物'}
            hint="让 AI 在部门群里写文件（如：帮我写一份周报）——产物会出现在这里"
          />
        ) : (
          <Card>
            <div class="wf-stack wf-gap-none">
              {shown.map((f, i) => (
                <div key={`${f.deptId}:${f.path}`} class="wf-row wf-justify-between wf-gap-sm" style={{ padding: '10px 12px', borderBottom: i < shown.length - 1 ? 'var(--wf-border-width) solid var(--wf-color-border)' : 'none' }}>
                  <div class="wf-stack wf-gap-xs wf-fill">
                    <a class="wf-font-sm wf-text-primary" style="text-decoration:none;cursor:pointer"
                      onClick={() => { ctx.app?.navigate(`/chat/${f.deptId}`) }}>
                      {f.path} <span class="wf-text-tertiary wf-font-xs">({f.deptName})</span>
                    </a>
                    <span class="wf-font-xs wf-text-tertiary">{fmtSize(f.size)} · {fmtTime(f.mtime)}</span>
                  </div>
                  <a href={`/api/departments/${f.deptId}/workspace/file?path=${encodeURIComponent(f.path)}`}
                    class="wf-btn wf-btn--sm wf-btn--secondary" target="_blank" style="text-decoration:none">
                    <Icon name="external-link" size={14} /> 打开
                  </a>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }
}
